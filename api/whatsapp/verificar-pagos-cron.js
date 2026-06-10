/**
 * RELOJITO de la verificación de pagos con reintentos (agente Liliana).
 *
 * Lo llama un cron (pg_cron de Supabase) cada ~5 minutos. Toma las verificaciones
 * vencidas y pendientes y reintenta buscar el pago real del cliente:
 *   - Si aparece y coincide de forma SÓLIDA → abona solo (misma lógica probada) y le
 *     avisa al cliente por WhatsApp.
 *   - Si aún no aparece → reprograma el próximo intento (+15 min).
 *   - Si ya agotó los intentos (~1 hora) → pasa a un asesor (etiqueta ASESOR) y avisa.
 *
 * NUNCA abona por "misma hora" sola (la regla anti-fraude vive en `lib/abono-agente.js`).
 * Una transferencia solo se consume UNA vez, así que los reintentos no duplican abonos.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp, enviarTexto } from '../lib/whatsapp.js';
import { ponerEtiqueta } from '../lib/etiquetas.js';
import { verificarYAbonar, contrasenaGerencia } from '../lib/abono-agente.js';

const LOTE = 15;                   // cada verificación lee una imagen con IA (es lento)
const REINTENTO_MS = 15 * 60000;   // 15 min entre intentos

// Manda un texto al cliente (como mensaje del agente) y lo guarda en el historial del chat.
async function avisarCliente(v, texto) {
  const env = await enviarTexto(v.telefono, texto, v.linea_id);
  if (!env || !env.ok) return false;
  const ts = new Date().toISOString();
  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id: v.conversacion_id, telefono: v.telefono, linea_id: v.linea_id,
    direccion: 'saliente', tipo: 'text', texto, wa_message_id: env.wa_message_id || null,
    estado_envio: 'enviado', timestamp_wa: ts, raw: { agente: true },
  });
  await supabaseAdmin.from('conversaciones_whatsapp')
    .update({ ultimo_mensaje: String(texto).slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
    .eq('id', v.conversacion_id);
  return true;
}

async function nota(v, texto, tipo = 'nota') {
  await supabaseAdmin.from('agente_actividad')
    .insert({ linea_id: v.linea_id, telefono: v.telefono, tipo, resumen: texto }).catch(() => {});
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

  const pwd = contrasenaGerencia();
  if (!pwd) return res.status(200).json({ status: 'error', mensaje: 'Falta la configuración de contraseña de gerencia.' });

  // Rescate de huérfanas: si una corrida murió a mitad de verificación, su fila queda
  // 'en_proceso' para siempre (y bloquearía nuevas verificaciones de ese chat). Pasados
  // 10 min sin movimiento la devolvemos a 'pendiente' para que se reintente.
  const hace10min = new Date(Date.now() - 10 * 60000).toISOString();
  await supabaseAdmin
    .from('verificaciones_pago')
    .update({ estado: 'pendiente', actualizado_at: new Date().toISOString() })
    .eq('estado', 'en_proceso')
    .lt('actualizado_at', hace10min);

  const ahora = new Date().toISOString();
  const { data: vencidas, error } = await supabaseAdmin
    .from('verificaciones_pago')
    .select('id, linea_id, telefono, conversacion_id, media_id, numero_pedido, intentos, max_intentos')
    .eq('estado', 'pendiente')
    .lte('proximo_intento_at', ahora)
    .order('proximo_intento_at', { ascending: true })
    .limit(LOTE);
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  let abonados = 0, reintentos = 0, rendidos = 0;
  for (const v of (vencidas || [])) {
    // Reclamar de forma atómica: marcar 'en_proceso', subir intentos y reprogramar SOLO
    // si nadie lo tomó ya (comparando estado e intentos). Si otra corrida ganó, esta lo
    // salta. El estado 'en_proceso' también le avisa al turno en vivo (registrar_abono)
    // que NO procese este mismo comprobante en paralelo.
    const { data: claim } = await supabaseAdmin
      .from('verificaciones_pago')
      .update({
        estado: 'en_proceso',
        intentos: v.intentos + 1,
        proximo_intento_at: new Date(Date.now() + REINTENTO_MS).toISOString(),
        actualizado_at: new Date().toISOString(),
      })
      .eq('id', v.id).eq('estado', 'pendiente').eq('intentos', v.intentos)
      .select('id').maybeSingle();
    if (!claim) continue;

    let r;
    try {
      r = await verificarYAbonar({
        telefono: v.telefono, linea_id: v.linea_id, conversacion_id: v.conversacion_id,
        mediaId: v.media_id, numeroPedido: v.numero_pedido, pwd,
      });
    } catch (e) { r = { tipo: 'error', mensaje: e.message }; }

    if (r.tipo === 'abonado') {
      await supabaseAdmin.from('verificaciones_pago')
        .update({ estado: 'abonado', resultado: `abonado $${r.monto} a ${r.numero}`, actualizado_at: new Date().toISOString() })
        .eq('id', v.id);
      await avisarCliente(v, `¡Listo! ✅ Confirmé tu pago y te registré el abono de $${Number(r.monto).toLocaleString('es-CO')} a la boleta *${r.numero}*. ¡Gracias! 🙌`);
      await nota(v, `Verificación con reintentos: aboné $${Number(r.monto).toLocaleString('es-CO')} a la boleta ${r.numero}.`);
      abonados++;
      continue;
    }

    if (r.tipo === 'sin_saldo') {
      // No hay boletas con saldo → probablemente ya lo abonaron por otro lado. Cerrar en silencio.
      await supabaseAdmin.from('verificaciones_pago')
        .update({ estado: 'cancelado', resultado: 'sin saldo (quizá ya estaba pago)', actualizado_at: new Date().toISOString() })
        .eq('id', v.id);
      continue;
    }

    // no_encontrado / misma_hora / error: ¿ya agotó los intentos?
    if (v.intentos + 1 >= v.max_intentos) {
      await supabaseAdmin.from('verificaciones_pago')
        .update({ estado: 'rendido', resultado: r.tipo + ' tras ' + (v.intentos + 1) + ' intentos', actualizado_at: new Date().toISOString() })
        .eq('id', v.id);
      // Se agotaron los intentos: Liliana se APAGA y pasa el chat a un humano EN SILENCIO.
      // NO le vuelve a escribir al cliente (ya le había dicho que estaba verificando; un
      // segundo mensaje diciendo casi lo mismo se sentía repetido). Un asesor lo retoma por
      // la etiqueta ASESOR. Mismo apagado que la herramienta pasar_a_humano.
      await supabaseAdmin.from('conversaciones_whatsapp')
        .update({ agente_activo: false, estado: 'humano' })
        .eq('id', v.conversacion_id);
      try {
        await supabaseAdmin.from('recordatorios').update({ estado: 'cancelado' })
          .eq('linea_id', v.linea_id).eq('telefono', v.telefono).eq('estado', 'pendiente');
      } catch (_) {}
      await ponerEtiqueta(v.conversacion_id, v.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' });
      await nota(v, 'Verificación con reintentos: no se confirmó el pago tras los intentos; me apagué y pasé el chat a un asesor EN SILENCIO (sin escribirle otra vez al cliente).', 'error');
      rendidos++;
    } else {
      // Sigue pendiente: devolver la fila de 'en_proceso' a 'pendiente' para el próximo
      // intento (la reprogramación ya quedó hecha en el claim). Condicional por si el
      // turno en vivo la canceló/reemplazó mientras verificábamos.
      await supabaseAdmin
        .from('verificaciones_pago')
        .update({ estado: 'pendiente', actualizado_at: new Date().toISOString() })
        .eq('id', v.id).eq('estado', 'en_proceso');
      reintentos++;
    }
  }

  return res.status(200).json({ status: 'ok', abonados, reintentos, rendidos });
}
