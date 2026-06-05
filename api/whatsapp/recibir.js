/**
 * EL TIMBRE: aquí llega Meta cada vez que pasa algo en WhatsApp.
 *
 * Tiene dos trabajos:
 *
 *  1) VERIFICACIÓN (una sola vez, al configurar el webhook en Meta):
 *     Meta hace un GET con una palabra secreta. Si coincide con
 *     WHATSAPP_VERIFY_TOKEN, le devolvemos el "challenge" y queda conectado.
 *
 *  2) MENSAJES (todo el tiempo):
 *     Meta hace un POST cada vez que un cliente escribe, o cuando un mensaje
 *     nuestro fue entregado/leído. Guardamos todo en el buzón (Supabase) y
 *     respondemos 200 RÁPIDO (si tardamos o devolvemos error, Meta reintenta
 *     en bucle y se atasca).
 *
 * Por ahora SOLO guarda los mensajes. El cerebro (la IA que responde) y la
 * bandeja de asesores se conectan después, leyendo de estas mismas tablas.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp } from '../lib/whatsapp.js';
import { ponerEtiqueta } from '../lib/etiquetas.js';

export default async function handler(req, res) {
  // ── 1) Verificación del webhook (GET) ─────────────────────────────────────
  if (req.method === 'GET') {
    const { verifyToken } = configWhatsapp();
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Token de verificación incorrecto');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  // ── 2) Mensajes entrantes y acuses (POST) ─────────────────────────────────
  try {
    const cambios = (req.body?.entry || []).flatMap((e) => e.changes || []);
    for (const cambio of cambios) {
      const value = cambio.value || {};
      const nombrePerfil = value.contacts?.[0]?.profile?.name || null;
      const lineaId = value.metadata?.phone_number_id || null;   // a qué número NUESTRO llegó

      // a) Mensajes nuevos que escribe el cliente
      for (const m of (value.messages || [])) {
        await guardarEntrante(m, nombrePerfil, lineaId);
      }
      // b) Acuses de mensajes que NOSOTROS enviamos (enviado/entregado/leído/falló)
      for (const s of (value.statuses || [])) {
        await actualizarEstado(s);
      }
    }
  } catch (err) {
    // Aun con error devolvemos 200: si devolvemos error, Meta reintenta sin parar.
    console.error('[whatsapp/recibir] error procesando webhook:', err);
  }

  return res.status(200).json({ received: true });
}

// ── Guardar un mensaje entrante ─────────────────────────────────────────────
async function guardarEntrante(m, nombrePerfil, lineaId) {
  const telefono = m.from;
  const { tipo, texto, media_id } = interpretarMensaje(m);
  const respondeA = m.context?.id || null;   // si el cliente citó/respondió a un mensaje, su wa_message_id
  const ts = m.timestamp
    ? new Date(Number(m.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const preview = texto || `[${tipo}]`;
  const conversacion = await upsertConversacion(telefono, nombrePerfil, preview, ts, true, lineaId);

  // upsert con ignoreDuplicates: si Meta reenvía el mismo mensaje, no se duplica.
  await supabaseAdmin
    .from('mensajes_whatsapp')
    .upsert(
      {
        conversacion_id: conversacion?.id || null,
        telefono,
        linea_id: lineaId,
        direccion: 'entrante',
        tipo,
        texto,
        media_id,
        wa_message_id: m.id,
        responde_a: respondeA,
        estado_envio: 'recibido',
        timestamp_wa: ts,
        raw: m,
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true }
    );

  // El cliente volvió a escribir → cancela los recordatorios que el agente tenía pendientes
  // para este chat (ya retomaron la conversación, no hace falta el seguimiento automático).
  await cancelarRecordatorios(telefono, lineaId);

  // Disparadores: si el mensaje contiene una palabra clave configurada, o si es un cliente NUEVO
  // (primer mensaje) y hay un disparador de ese tipo, prende el agente en este chat.
  await activarPorDisparador(telefono, lineaId, texto, !!(conversacion && conversacion.esNuevo));

  // Si el agente está activo en este chat, dispararlo de una (sin depender del navegador).
  await dispararAgenteSiActivo(telefono, lineaId);
}

// ── Disparadores: prender el agente automáticamente por palabra clave ────────
// Si el mensaje del cliente contiene una palabra clave (tabla `disparadores`), prende el agente
// en ese chat. No lo hace si: el agente ya está activo, un humano tomó el chat (estado='humano'),
// o la línea tiene el agente en 'apagado'. El estado de línea (sombra/encendido) lo respeta el motor.
async function activarPorDisparador(telefono, lineaId, texto, esConvNueva) {
  try {
    const t = String(texto || '').toLowerCase().trim();
    const { data: c } = await supabaseAdmin
      .from('conversaciones_whatsapp').select('id, agente_activo, estado')
      .eq('telefono', telefono).eq('linea_id', lineaId).maybeSingle();
    if (!c || c.agente_activo || c.estado === 'humano') return;

    const { data: cfg } = await supabaseAdmin
      .from('agente_config').select('estado').eq('linea_id', lineaId).maybeSingle();
    if (cfg && cfg.estado === 'apagado') return;   // línea apagada: los disparadores no actúan

    const { data: disp } = await supabaseAdmin
      .from('disparadores').select('palabra, tipo').eq('linea_id', lineaId).eq('activo', true);
    const hay = (disp || []).some(d => {
      if (d.tipo === 'nuevo_contacto') return !!esConvNueva;          // cliente nuevo: cualquier 1er mensaje
      const p = String(d.palabra || '').toLowerCase().trim();         // palabra clave: el texto la contiene
      return p && t.includes(p);
    });
    if (!hay) return;

    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ agente_activo: true, estado: 'bot' })
      .eq('telefono', telefono).eq('linea_id', lineaId);
    // Etiquetar el chat como AGENTE (lo usa el supervisor y para filtrar).
    await ponerEtiqueta(c.id, lineaId, 'AGENTE', { icono: '🤖', color: '#dff7e4' });
  } catch (_) { /* si falla, simplemente no se auto-prende */ }
}

// ── Cancelar recordatorios pendientes de una conversación ───────────────────
async function cancelarRecordatorios(telefono, lineaId) {
  try {
    let q = supabaseAdmin.from('recordatorios').update({ estado: 'cancelado' })
      .eq('telefono', telefono).eq('estado', 'pendiente');
    q = lineaId ? q.eq('linea_id', lineaId) : q.is('linea_id', null);
    await q;
  } catch (_) { /* no es crítico: si falla, el recordatorio simplemente se dispararía */ }
}

// ── Disparar el agente de IA si está activo en esta conversación ────────────
// Lo llamamos al instante cuando entra el mensaje, sin esperar al navegador.
// No bloqueamos a Meta: lanzamos la petición y cortamos a 1.5s (el motor sigue
// procesando en su propia ejecución serverless).
async function dispararAgenteSiActivo(telefono, lineaId) {
  try {
    const { data: c } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .select('agente_activo')
      .eq('telefono', telefono).eq('linea_id', lineaId).maybeSingle();
    if (!c || !c.agente_activo) return;
    const { verifyToken } = configWhatsapp();
    await fetch('https://www.losplata.com.co/api/whatsapp/agente-responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, linea_id: lineaId, interno: verifyToken }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (_) { /* el corte a 1.5s es esperado; el motor sigue procesando aparte */ }
}

// ── Actualizar el estado de un mensaje que enviamos ─────────────────────────
async function actualizarEstado(s) {
  const mapa = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };
  const patch = { estado_envio: mapa[s.status] || s.status };
  if (s.status === 'failed') {
    patch.error = s.errors?.[0]?.title || s.errors?.[0]?.message || 'fallido';
  }
  await supabaseAdmin
    .from('mensajes_whatsapp')
    .update(patch)
    .eq('wa_message_id', s.id);
}

// ── Crear o actualizar la conversación (el chat del cliente) ────────────────
async function upsertConversacion(telefono, nombrePerfil, preview, ts, esEntrante, lineaId) {
  const cambios = {
    ultimo_mensaje: preview?.slice(0, 200) ?? null,
    ultimo_at: ts,
    ultimo_entrante: esEntrante,   // el último mensaje lo mandó el cliente → falta responder
  };
  if (nombrePerfil) cambios.nombre_perfil = nombrePerfil;
  // Cada mensaje del cliente renueva la ventana gratis de 24h.
  if (esEntrante) {
    cambios.ventana_vence_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  // El chat es único por (línea + teléfono): el mismo cliente puede escribirle a varias líneas.
  let busqueda = supabaseAdmin
    .from('conversaciones_whatsapp')
    .select('id, no_leidos')
    .eq('telefono', telefono);
  busqueda = lineaId ? busqueda.eq('linea_id', lineaId) : busqueda.is('linea_id', null);
  const { data: existente } = await busqueda.maybeSingle();

  if (existente) {
    if (esEntrante) cambios.no_leidos = (existente.no_leidos || 0) + 1;
    await supabaseAdmin
      .from('conversaciones_whatsapp')
      .update(cambios)
      .eq('id', existente.id);
    return { id: existente.id, esNuevo: false };
  }

  const fila = { telefono, linea_id: lineaId, ...cambios };
  if (esEntrante) {
    fila.no_leidos = 1;
    fila.estado = 'bot';
  }
  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert(fila)
    .select('id')
    .single();
  return { id: nueva?.id, esNuevo: true };   // esNuevo = es la primera vez que este cliente escribe
}

// ── Sacar el texto y el tipo de cualquier mensaje que mande Meta ────────────
function interpretarMensaje(m) {
  switch (m.type) {
    case 'text':
      return { tipo: 'text', texto: m.text?.body || null, media_id: null };
    case 'image':
      return { tipo: 'image', texto: m.image?.caption || null, media_id: m.image?.id || null };
    case 'audio':
      return { tipo: 'audio', texto: null, media_id: m.audio?.id || null };
    case 'video':
      return { tipo: 'video', texto: m.video?.caption || null, media_id: m.video?.id || null };
    case 'document':
      return { tipo: 'document', texto: m.document?.caption || m.document?.filename || null, media_id: m.document?.id || null };
    case 'sticker':
      return { tipo: 'sticker', texto: null, media_id: m.sticker?.id || null };
    case 'location':
      return { tipo: 'location', texto: `📍 ${m.location?.latitude}, ${m.location?.longitude}`, media_id: null };
    case 'interactive':
      return {
        tipo: 'interactive',
        texto: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || null,
        media_id: null,
      };
    case 'button':
      return { tipo: 'button', texto: m.button?.text || null, media_id: null };
    default:
      return { tipo: m.type || 'unknown', texto: null, media_id: null };
  }
}
