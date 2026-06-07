/**
 * RELOJITO de los recordatorios del agente.
 *
 * Lo llama un cron (pg_cron de Supabase) cada minuto. Busca los recordatorios
 * que YA vencieron y siguen pendientes (el índice parcial hace esto instantáneo,
 * aunque haya millones guardados), los "reclama" uno por uno de forma atómica
 * (para que NO se disparen dos veces si dos corridas se cruzan) y, según el caso:
 *
 *   - Si la ventana de 24h SIGUE ABIERTA (el cliente escribió hace poco, ej. un
 *     recordatorio "para hoy en 20 min"): despierta al motor del agente para que
 *     escriba el seguimiento con texto normal.
 *   - Si la ventana YA SE CERRÓ (recordatorio "para el martes", días después):
 *     WhatsApp NO deja escribir texto libre, así que se le manda la PLANTILLA de
 *     seguimiento aprobada por Meta para reabrir la conversación. Cuando el cliente
 *     responda, el webhook (recibir.js) despierta al motor con normalidad.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp, enviarPlantilla } from '../lib/whatsapp.js';

const LOTE = 40;   // cuántos recordatorios procesa por corrida (escala: el cron corre cada minuto)
const BASE_URL = 'https://www.losplata.com.co';
// Plantilla de seguimiento (la crea Mateo en Difusiones → Plantillas; su {{1}} = nombre del cliente).
// Se usa SOLO cuando la ventana de 24h ya se cerró. Debe estar APROBADA por Meta para que funcione.
const PLANTILLA_SEGUIMIENTO = 'seguimiento_los_plata';
const VENTANA_MS = 24 * 3600 * 1000;
const COLCHON_MS = 15 * 60000;   // margen antes de dar la ventana por cerrada

// Primer nombre, capitalizado, para meterlo en la plantilla ({{1}}).
function primerNombre(s) {
  const p = String(s || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
}
// Cuerpo de la plantilla con la variable ya puesta, para guardarlo en el historial del chat.
function textoFinal(cuerpo, params) {
  let t = String(cuerpo || '');
  (params || []).forEach((val, i) => { t = t.replaceAll(`{{${i + 1}}}`, String(val ?? '')); });
  return t;
}

// Envía la plantilla de seguimiento a un cliente cuya ventana de 24h ya se cerró.
async function enviarSeguimientoPorPlantilla(r) {
  try {
    // ¿Hay plantilla de seguimiento APROBADA en esta línea?
    const { data: pl } = await supabaseAdmin
      .from('plantillas_whatsapp')
      .select('nombre, idioma, cuerpo')
      .eq('linea_id', r.linea_id).eq('nombre', PLANTILLA_SEGUIMIENTO).eq('estado', 'aprobada')
      .maybeSingle();

    const { data: conv } = await supabaseAdmin
      .from('conversaciones_whatsapp').select('id, nombre_perfil').eq('id', r.conversacion_id).maybeSingle();
    const nombreCliente = primerNombre(conv && conv.nombre_perfil) || 'qué tal';

    if (!pl) {
      await supabaseAdmin.from('agente_actividad').insert({
        linea_id: r.linea_id, telefono: r.telefono, tipo: 'error',
        resumen: `Recordatorio a días: no hay plantilla "${PLANTILLA_SEGUIMIENTO}" aprobada en esta línea; no se pudo reabrir la conversación.`,
      });
      return;
    }

    // {{1}} = nombre del cliente. {{2}} = el motivo que guardó Liliana, como frase de cara al
    // cliente (ej. "me dijiste que hoy ibas a separar tu boleta"). Si no hay motivo, va una genérica.
    // WhatsApp NO acepta saltos de línea ni espacios de más en los parámetros de una plantilla.
    const motivoLimpio = String(r.motivo || '').replace(/\s+/g, ' ').trim();
    const contexto = motivoLimpio || 'Queríamos retomar lo de tu boleta de la casa.';
    const params = [nombreCliente, contexto];
    const env = await enviarPlantilla(r.telefono, { nombre: pl.nombre, idioma: pl.idioma, parametros: params }, r.linea_id);
    const ts = new Date().toISOString();
    if (!env.ok) {
      await supabaseAdmin.from('agente_actividad').insert({
        linea_id: r.linea_id, telefono: r.telefono, tipo: 'error',
        resumen: 'Recordatorio a días: falló enviar la plantilla de seguimiento: ' + env.error,
      });
      return;
    }
    const cuerpo = textoFinal(pl.cuerpo, params);
    await supabaseAdmin.from('mensajes_whatsapp').insert({
      conversacion_id: r.conversacion_id, telefono: r.telefono, linea_id: r.linea_id,
      direccion: 'saliente', tipo: 'text', texto: cuerpo, wa_message_id: env.wa_message_id || null,
      estado_envio: 'enviado', timestamp_wa: ts, raw: { agente: true, plantilla: true },
    });
    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ ultimo_mensaje: String(cuerpo).slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
      .eq('id', r.conversacion_id);
    await supabaseAdmin.from('agente_actividad').insert({
      linea_id: r.linea_id, telefono: r.telefono, tipo: 'nota',
      resumen: '🤖 Recordatorio a días: envié la plantilla de seguimiento para reabrir la conversación.',
    });
  } catch (e) {
    await supabaseAdmin.from('agente_actividad').insert({
      linea_id: r.linea_id, telefono: r.telefono, tipo: 'error',
      resumen: 'Recordatorio a días: error inesperado al enviar la plantilla: ' + (e.message || e),
    }).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  // Solo lo puede llamar quien tenga el secreto interno (el cron).
  const { interno } = req.body || {};
  const { verifyToken } = configWhatsapp();
  if (!verifyToken || interno !== verifyToken) {
    return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });
  }

  const ahora = new Date().toISOString();
  const ahoraMs = Date.now();

  // Recordatorios vencidos y pendientes (lee SOLO esos gracias al índice parcial).
  const { data: vencidos, error } = await supabaseAdmin
    .from('recordatorios')
    .select('id, linea_id, telefono, motivo, conversacion_id, ultimo_msg_cliente_at')
    .eq('estado', 'pendiente')
    .lte('programado_para', ahora)
    .order('programado_para', { ascending: true })
    .limit(LOTE);
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  const tareas = [];
  let porTexto = 0;
  let porPlantilla = 0;
  for (const r of (vencidos || [])) {
    // "Reclamar" de forma atómica: pasarlo a 'enviado' SOLO si sigue 'pendiente'.
    // Si otra corrida ya se lo llevó, esta no recibe fila y lo salta (sin doble envío).
    const { data: claim } = await supabaseAdmin
      .from('recordatorios')
      .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
      .eq('id', r.id).eq('estado', 'pendiente')
      .select('id').maybeSingle();
    if (!claim) continue;

    // ¿La ventana de 24h sigue abierta? (si no sabemos cuándo escribió el cliente, asumimos
    // que sí, para no gastar una plantilla de más; el texto libre es el camino seguro por defecto).
    const ultMs = r.ultimo_msg_cliente_at ? new Date(r.ultimo_msg_cliente_at).getTime() : ahoraMs;
    const ventanaAbierta = (ahoraMs - ultMs) < (VENTANA_MS - COLCHON_MS);

    if (ventanaAbierta) {
      // Despertar al motor del agente (fire-and-forget, igual que el webhook): escribe texto normal.
      tareas.push(
        fetch(`${BASE_URL}/api/whatsapp/agente-responder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telefono: r.telefono, linea_id: r.linea_id, interno: verifyToken,
            recordatorio: { motivo: r.motivo || '' },
          }),
          signal: AbortSignal.timeout(1500),
        }).catch(() => {})
      );
      porTexto++;
    } else {
      // Ventana cerrada: reabrir con la plantilla de seguimiento aprobada por Meta.
      tareas.push(enviarSeguimientoPorPlantilla(r));
      porPlantilla++;
    }
  }

  // Esperamos a que SALGAN las peticiones/envíos (cada fetch se corta a 1.5s).
  await Promise.allSettled(tareas);

  return res.status(200).json({ status: 'ok', porTexto, porPlantilla });
}
