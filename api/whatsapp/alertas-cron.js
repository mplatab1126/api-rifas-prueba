/**
 * ALERTAS del agente al WhatsApp de Mateo (H16 de la auditoría).
 *
 * Lo llama un cron (pg_cron) cada 15 minutos. Revisa la salud del agente y, si hay
 * algo que un humano deba saber, manda UN WhatsApp resumido a Mateo:
 *   1. Clientes ESPERANDO: chats con el agente activo cuyo último mensaje es del
 *      cliente y lleva >15 min sin respuesta (si el barredor no pudo destrabarlo,
 *      algo pasa). Solo avisa chats que no haya avisado ya (memoria en la base).
 *   2. ERRORES nuevos en la actividad del agente desde la última revisión.
 *   3. Verificaciones de pago RENDIDAS nuevas (pago prometido que no se confirmó).
 *   4. GASTO de IA anómalo: lo de hoy supera 2× el promedio diario de la última
 *      semana (avisa máximo una vez al día).
 * Y a las 8 p.m. manda el RESUMEN del día (abonos, gasto de IA, errores).
 *
 * Envío: texto libre a Mateo por la línea de Lili; si la ventana de 24h está
 * cerrada y falla, intenta la plantilla utility `alerta_sistema_los_plata`
 * (cuando Meta la apruebe). Si tampoco se puede, deja el aviso en la actividad.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { enviarTexto, enviarPlantilla } from '../lib/whatsapp.js';
import { esSecretoInternoValido } from '../lib/secreto-interno.js';

const TEL_MATEO = '573123354789';                 // el WhatsApp de Mateo (mismo del viejo supervisor QA)
const LINEA_ALERTAS = '1128258647034751';         // línea de Lili (Mateo la opera a diario → ventana abierta)
const PLANTILLA_ALERTA = 'alerta_sistema_los_plata';

const hoyColombia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const horaColombia = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }));
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

// Manda la alerta a Mateo: texto libre primero; plantilla aprobada como respaldo;
// si nada sale, deja rastro en la actividad del agente (mejor eso que perderla).
async function avisarMateo(texto) {
  const env = await enviarTexto(TEL_MATEO, texto, LINEA_ALERTAS);
  if (env && env.ok) return true;
  try {
    const { data: pl } = await supabaseAdmin
      .from('plantillas_whatsapp').select('nombre, idioma')
      .eq('linea_id', LINEA_ALERTAS).eq('nombre', PLANTILLA_ALERTA).eq('estado', 'aprobada')
      .maybeSingle();
    if (pl) {
      const corto = String(texto).replace(/\s+/g, ' ').trim().slice(0, 600);
      const envPl = await enviarPlantilla(TEL_MATEO, { nombre: pl.nombre, idioma: pl.idioma, parametros: [corto] }, LINEA_ALERTAS);
      if (envPl && envPl.ok) return true;
    }
  } catch (_) {}
  try {
    await supabaseAdmin.from('agente_actividad').insert({
      linea_id: LINEA_ALERTAS, telefono: TEL_MATEO, tipo: 'error',
      resumen: ('No pude enviar la ALERTA a Mateo (ventana cerrada y sin plantilla aprobada). Decía: ' + texto).slice(0, 500),
    });
  } catch (_) {}
  return false;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { interno } = req.body || {};
  if (!esSecretoInternoValido(interno)) {   // H39: secreto interno propio, comparación segura
    return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });
  }

  // Memoria de la última corrida (para no repetir alertas cada 15 min).
  const { data: fila } = await supabaseAdmin.from('agente_alertas_estado').select('datos').eq('id', 1).maybeSingle();
  const estado = (fila && fila.datos) || {};
  const ultimaCorrida = estado.ultima_corrida || new Date(Date.now() - 15 * 60000).toISOString();
  const avisados = estado.silencios_avisados || {};
  const ahoraIso = new Date().toISOString();
  const partes = [];

  try {
    // 1) Clientes ESPERANDO (>15 min sin respuesta, hasta 2h hacia atrás).
    const hace15 = new Date(Date.now() - 15 * 60000).toISOString();
    const hace2h = new Date(Date.now() - 120 * 60000).toISOString();
    const { data: esperando } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .select('id, telefono, nombre_perfil, ultimo_at')
      .eq('agente_activo', true).eq('ultimo_entrante', true)
      .or('estado.is.null,estado.neq.humano')
      .gte('ultimo_at', hace2h).lte('ultimo_at', hace15)
      .limit(10);
    const nuevosEsperando = (esperando || []).filter(c => !avisados[c.id]);
    if (nuevosEsperando.length) {
      const lista = nuevosEsperando.slice(0, 4)
        .map(c => `${c.nombre_perfil || 'Cliente'} (...${String(c.telefono).slice(-4)})`).join(', ');
      partes.push(`⏳ *${nuevosEsperando.length} cliente(s) llevan >15 min esperando* respuesta del agente: ${lista}.`);
      for (const c of nuevosEsperando) avisados[c.id] = ahoraIso;
    }
    // 1b) Chats EN MANOS DE UN HUMANO con el cliente esperando >30 min (H28): cuando un
    // chat pasa a asesor (estado='humano') el agente se apaga y el barredor no lo toca —
    // si nadie abre la bandeja, el cliente queda esperando sin que NADIE se entere
    // (hubo un caso real de 15 horas). Avisa una vez por chat (se re-avisa a las ~2h).
    const hace30 = new Date(Date.now() - 30 * 60000).toISOString();
    const hace24h = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: humanos } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .select('id, telefono, nombre_perfil')
      .eq('estado', 'humano').eq('ultimo_entrante', true)
      .gte('ultimo_at', hace24h).lte('ultimo_at', hace30)
      .limit(10);
    const nuevosHumanos = (humanos || []).filter(c => !avisados['h:' + c.id]);
    if (nuevosHumanos.length) {
      const lista = nuevosHumanos.slice(0, 4)
        .map(c => `${c.nombre_perfil || 'Cliente'} (...${String(c.telefono).slice(-4)})`).join(', ');
      partes.push(`🆘 *${nuevosHumanos.length} chat(s) EN MANOS DE ASESOR llevan >30 min sin respuesta humana:* ${lista}.`);
      for (const c of nuevosHumanos) avisados['h:' + c.id] = ahoraIso;
    }

    // Limpieza de la memoria de avisados (>2h se olvidan: si reaparecen, se re-avisa).
    for (const k of Object.keys(avisados)) {
      if (new Date(avisados[k]).getTime() < Date.now() - 120 * 60000) delete avisados[k];
    }

    // 2) ERRORES nuevos en la actividad del agente.
    const { data: errores } = await supabaseAdmin
      .from('agente_actividad').select('resumen, created_at')
      .eq('tipo', 'error').gt('created_at', ultimaCorrida)
      .order('created_at', { ascending: false }).limit(5);
    // No alertar sobre la propia alerta fallida (evita el bucle).
    const erroresReales = (errores || []).filter(e => !String(e.resumen || '').startsWith('No pude enviar la ALERTA'));
    if (erroresReales.length) {
      partes.push(`❌ *${erroresReales.length} error(es) nuevo(s)* del agente. El más reciente: "${String(erroresReales[0].resumen).slice(0, 120)}".`);
    }

    // 3) Verificaciones de pago RENDIDAS nuevas (cliente pagó y no se pudo confirmar).
    const { data: rendidas } = await supabaseAdmin
      .from('verificaciones_pago').select('telefono')
      .eq('estado', 'rendido').gt('actualizado_at', ultimaCorrida).limit(5);
    if (rendidas && rendidas.length) {
      partes.push(`💸 *${rendidas.length} verificación(es) de pago se rindieron* (el pago no apareció tras ~1h): el chat quedó marcado 🆘 para un asesor.`);
    }

    // 4) GASTO de IA anómalo (una vez al día).
    const hoy = hoyColombia();
    if (estado.gasto_avisado_fecha !== hoy) {
      const inicioHoy = hoy + 'T00:00:00-05:00';
      const hace7d = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
      const [{ data: usoHoy }, { data: usoSem }] = await Promise.all([
        supabaseAdmin.from('agente_uso').select('costo_usd').gte('created_at', inicioHoy),
        supabaseAdmin.from('agente_uso').select('costo_usd').gte('created_at', hace7d).lt('created_at', inicioHoy),
      ]);
      const gastoHoy = (usoHoy || []).reduce((s, u) => s + Number(u.costo_usd || 0), 0);
      const promDia = ((usoSem || []).reduce((s, u) => s + Number(u.costo_usd || 0), 0)) / 7;
      if (gastoHoy > 2 && promDia > 0 && gastoHoy > 2 * promDia) {
        partes.push(`💰 *Gasto de IA anómalo hoy:* ${gastoHoy.toFixed(2)} USD (el promedio diario de la semana es ${promDia.toFixed(2)} USD).`);
        estado.gasto_avisado_fecha = hoy;
      }
    }

    // 5) RESUMEN del día (8 p.m., una vez).
    if (horaColombia() >= 20 && estado.resumen_fecha !== hoy) {
      const inicioHoy = hoy + 'T00:00:00';
      const [{ data: abHoy }, { data: usoHoy2 }, { count: nErr }] = await Promise.all([
        supabaseAdmin.from('abonos').select('monto').gte('fecha_pago', inicioHoy),
        supabaseAdmin.from('agente_uso').select('costo_usd').gte('created_at', hoy + 'T00:00:00-05:00'),
        supabaseAdmin.from('agente_actividad').select('id', { count: 'exact', head: true }).eq('tipo', 'error').gte('created_at', hoy + 'T00:00:00-05:00'),
      ]);
      const totalAb = (abHoy || []).reduce((s, a) => s + Number(a.monto || 0), 0);
      const gasto = (usoHoy2 || []).reduce((s, u) => s + Number(u.costo_usd || 0), 0);
      partes.push(`🌙 *Resumen de hoy:* ${(abHoy || []).length} abono(s) por ${fmt(totalAb)} · gasto de IA ${gasto.toFixed(2)} USD · ${nErr || 0} error(es) del agente.`);
      estado.resumen_fecha = hoy;
    }

    let enviado = false;
    if (partes.length) {
      enviado = await avisarMateo('🔔 *Sistema Los Plata*\n\n' + partes.join('\n\n'));
    }

    // Guardar la memoria de esta corrida.
    estado.ultima_corrida = ahoraIso;
    estado.silencios_avisados = avisados;
    await supabaseAdmin.from('agente_alertas_estado')
      .update({ datos: estado, actualizado_at: ahoraIso }).eq('id', 1);

    return res.status(200).json({ status: 'ok', alertas: partes.length, enviado });
  } catch (e) {
    return res.status(200).json({ status: 'error', mensaje: e.message });
  }
}
