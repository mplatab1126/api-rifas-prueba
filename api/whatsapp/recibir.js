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

import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp } from '../lib/whatsapp.js';
import { permitido } from '../lib/rate-limit.js';
import { secretoInterno } from '../lib/secreto-interno.js';
import { procesarFlujo, iniciarFlujoPorId } from '../lib/flujo-motor.js';

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

  // ── 1.5) FIRMA DE META (H19) ───────────────────────────────────────────────
  // Meta firma cada POST con HMAC-SHA256 del CUERPO CRUDO (cabecera
  // X-Hub-Signature-256). Sin esta validación, cualquiera que conozca la URL puede
  // inyectar mensajes falsos (suplantar clientes, gastar IA, prender el agente).
  // SOLO se aplica si META_APP_SECRET está configurado en Vercel: mientras no
  // exista la variable, se procesa como siempre (deploy seguro; activar después).
  let body = req.body;
  const appSecret = process.env.META_APP_SECRET;
  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    if (chunks.length) {
      const crudo = Buffer.concat(chunks);
      try { body = JSON.parse(crudo.toString('utf8') || '{}'); } catch (_) { body = {}; }
      if (appSecret) {
        const firma = String(req.headers['x-hub-signature-256'] || '');
        const esperada = 'sha256=' + crypto.createHmac('sha256', appSecret).update(crudo).digest('hex');
        const a = Buffer.from(firma), b = Buffer.from(esperada);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          // 200 SIN procesar: a Meta no le pedimos reintento, y el POST falso no tiene efectos.
          console.error('[whatsapp/recibir] FIRMA INVÁLIDA — POST rechazado sin procesar.');
          return res.status(200).json({ received: true });
        }
      }
    } else if (appSecret) {
      // El runtime ya consumió los bytes crudos: procesamos igual (no dejar mudo el
      // canal) pero queda rastro de que la firma no se pudo verificar en esta petición.
      console.error('[whatsapp/recibir] sin cuerpo crudo disponible; firma NO verificada en esta petición.');
    }
  } catch (e) {
    console.error('[whatsapp/recibir] error leyendo el cuerpo crudo:', e.message || e);
  }

  // ── 2) Mensajes entrantes y acuses (POST) ─────────────────────────────────
  let mensajesIntentados = 0, mensajesGuardados = 0;
  // H86: el motor se dispara UNA vez por CONVERSACIÓN por webhook. Antes era una vez por
  // MENSAJE: en una ráfaga de 3, dos invocaciones morían en el candado (arranques y 1.5s
  // de espera desperdiciados) y el webhook le respondía lento a Meta.
  const paraDisparar = new Map();   // 'telefono|linea' → { telefono, lineaId }
  try {
    const cambios = (body?.entry || []).flatMap((e) => e.changes || []);
    for (const cambio of cambios) {
      const value = cambio.value || {};
      const nombrePerfil = value.contacts?.[0]?.profile?.name || null;
      const lineaId = value.metadata?.phone_number_id || null;   // a qué número NUESTRO llegó

      // a) Mensajes nuevos que escribe el cliente
      for (const m of (value.messages || [])) {
        mensajesIntentados++;
        if (await guardarEntrante(m, nombrePerfil, lineaId, paraDisparar)) mensajesGuardados++;
      }
      // b) Acuses de mensajes que NOSOTROS enviamos (enviado/entregado/leído/falló)
      for (const s of (value.statuses || [])) {
        await actualizarEstado(s);
      }
    }
    for (const d of paraDisparar.values()) {
      await despachar(d.telefono, d.lineaId, d.texto, d.esNueva);
    }
  } catch (err) {
    console.error('[whatsapp/recibir] error procesando webhook:', err);
  }

  // Si llegaron mensajes del cliente y NINGUNO se pudo guardar (ej. la base caída), devolvemos
  // 500 para que Meta REINTENTE con backoff: el dedup por wa_message_id absorbe el reintento
  // sin duplicar (H13 — antes el 200 incondicional PERDÍA esos mensajes para siempre).
  // Webhooks de solo-acuses o con guardado parcial siguen respondiendo 200 rápido, como siempre.
  if (mensajesIntentados > 0 && mensajesGuardados === 0) {
    return res.status(500).json({ received: false });
  }
  return res.status(200).json({ received: true });
}

// ── Guardar un mensaje entrante ─────────────────────────────────────────────
async function guardarEntrante(m, nombrePerfil, lineaId, paraDisparar) {
  const telefono = m.from;
  const { tipo, texto, media_id } = interpretarMensaje(m);

  // Una REACCIÓN (👍/❤️ a un mensaje) NO es un mensaje (H26): antes se guardaba como
  // entrante normal → sumaba "sin leer", CANCELABA los recordatorios pendientes y
  // disparaba al agente (la IA le respondía "¿te explico los premios?" a un corazón).
  // Se ignora por completo (no es contenido; el cliente no espera respuesta).
  if (m.type === 'reaction') return true;

  const esSinContenido = (m.type === 'unsupported' || m.type === 'ephemeral');
  const respondeA = m.context?.id || null;   // si el cliente citó/respondió a un mensaje, su wa_message_id
  const ts = m.timestamp
    ? new Date(Number(m.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const preview = texto || `[${tipo}]`;
  // H71: primero solo BUSCAR o CREAR el chat (sin tocar contadores ni ventana): hasta no
  // confirmar que el mensaje es NUEVO, no se aplica ningún efecto.
  const conversacion = await buscarOCrearConversacion(telefono, nombrePerfil, preview, ts, true, lineaId);

  // upsert con ignoreDuplicates: si Meta reenvía el mismo mensaje, no se duplica.
  // .select('id') dice la verdad: lista vacía = era un DUPLICADO (reintento de Meta).
  const { data: filasMsg, error: errGuardar } = await supabaseAdmin
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
    )
    .select('id');
  const esMsgNuevo = !errGuardar && Array.isArray(filasMsg) && filasMsg.length > 0;

  // H71: TODOS los efectos secundarios solo corren para un mensaje NUEVO. Un reintento
  // tardío de Meta (puede llegar minutos u horas después) ANTES re-ejecutaba todo con un
  // mensaje VIEJO: cancelaba recordatorios recién programados, inflaba "sin leer" y
  // renovaba la ventana de 24h con una hora falsa.
  if (esMsgNuevo) {
    if (conversacion && conversacion.id && !conversacion.esNuevo) {
      const cambios = {
        ultimo_mensaje: preview?.slice(0, 200) ?? null,
        ultimo_at: ts,
        ultimo_entrante: true,   // el último mensaje lo mandó el cliente → falta responder
        // Cada mensaje del cliente renueva la ventana gratis de 24h.
        ventana_vence_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        no_leidos: (conversacion.no_leidos || 0) + 1,
      };
      if (nombrePerfil) cambios.nombre_perfil = nombrePerfil;
      try { await supabaseAdmin.from('conversaciones_whatsapp').update(cambios).eq('id', conversacion.id); } catch (_) {}
    }

    // Un tipo SIN contenido legible ('unsupported'/'ephemeral') SÍ se guarda y suma
    // "sin leer" (que lo vea un humano), pero NO cancela recordatorios ni dispara al
    // agente de inmediato (H26) — si el agente está activo, el barredor lo retoma luego.
    if (!esSinContenido) {
      // El cliente volvió a escribir → cancela los recordatorios que el agente tenía pendientes
      // para este chat (ya retomaron la conversación, no hace falta el seguimiento automático).
      // EXCEPCIÓN (bug 7-jun): un mensaje de PURA cortesía ("Gracias 🙏", "ok", "muchas gracias")
      // no retoma nada — antes cancelaba hasta un recordatorio agendado a DÍAS y el seguimiento
      // moría en silencio (caso real: recordatorio del abono de la boleta 6427 para el jueves,
      // cancelado por un "Gracias"). En la duda se cancela como siempre (conservador).
      if (!esCortesiaPura(tipo, texto)) await cancelarRecordatorios(telefono, lineaId);

      // El despacho (flujo o agente, según los disparadores) se hace UNA vez por conversación
      // al final del webhook (H86: una ráfaga de 3 mensajes ya no lanza 3 invocaciones).
      if (paraDisparar) paraDisparar.set(telefono + '|' + lineaId, { telefono, lineaId, texto, esNueva: !!(conversacion && conversacion.esNuevo) });
    }
  }

  // ¿El mensaje quedó guardado de verdad? (lo usa el handler para decidir si pedirle
  // reintento a Meta cuando NINGÚN mensaje se pudo guardar)
  if (errGuardar) console.error('[whatsapp/recibir] no se pudo guardar el mensaje entrante:', errGuardar.message || errGuardar);
  return !errGuardar;
}

// ── Despachador: qué hace cada mensaje entrante ──────────────────────────────
// Orden: (1) si hay un FLUJO en curso en el chat, lo avanza; (2) si el AGENTE ya está
// activo (conversación en curso con Liliana), lo dispara; (3) evalúa los disparadores
// CENTRALES (tabla `disparadores`): la primera regla activa que coincida (palabra clave o
// cliente nuevo) manda a su DESTINO — arrancar un flujo o prender al agente.
// No actúa si un humano tomó el chat (estado='humano').
async function despachar(telefono, lineaId, texto, esNueva) {
  try {
    if (await procesarFlujo(telefono, lineaId, texto)) return;   // (1) flujo en curso

    const { data: c } = await supabaseAdmin
      .from('conversaciones_whatsapp').select('id, agente_activo, estado')
      .eq('telefono', telefono).eq('linea_id', lineaId).maybeSingle();
    if (!c || c.estado === 'humano') return;

    if (c.agente_activo) { await dispararAgenteSiActivo(telefono, lineaId); return; }   // (2) agente en curso

    // (3) disparadores centrales
    const t = String(texto || '').toLowerCase().trim();
    const { data: disp } = await supabaseAdmin
      .from('disparadores').select('tipo, palabra, destino, flujo_id')
      .eq('linea_id', lineaId).eq('activo', true).order('created_at', { ascending: true });
    const regla = (disp || []).find(d => {
      if (d.tipo === 'nuevo_contacto') return !!esNueva;
      if (d.tipo === 'palabra') { const p = String(d.palabra || '').toLowerCase().trim(); return p && t.includes(p); }
      return false;   // 'etiqueta_aplicada' no se evalúa con mensajes entrantes (se dispara al etiquetar)
    });
    if (!regla) return;

    if (regla.destino === 'flujo') {
      await iniciarFlujoPorId(regla.flujo_id, telefono, lineaId);   // solo arranca si el flujo está 'activo'
      return;
    }
    // destino = agente (Liliana)
    const { data: cfg } = await supabaseAdmin.from('agente_config').select('estado').eq('linea_id', lineaId).maybeSingle();
    if (cfg && cfg.estado === 'apagado') return;   // línea apagada: el agente no actúa
    await supabaseAdmin.from('conversaciones_whatsapp').update({ agente_activo: true, estado: 'bot' }).eq('id', c.id);
    await dispararAgenteSiActivo(telefono, lineaId);
  } catch (e) {
    console.error('[whatsapp/recibir] despachar falló:', e.message || e);
  }
}

// ── ¿El mensaje es PURA cortesía? ("Gracias 🙏", "ok", "muchas gracias") ─────
// Solo se usa para decidir si se cancelan los recordatorios pendientes (un "gracias"
// no retoma la conversación). Lista corta y conservadora A PROPÓSITO: en la duda
// devuelve false y el recordatorio se cancela como siempre. NO incluye palabras de
// asentir que reabren la venta ("sí", "dale", "listo": pueden significar "ya pagué"
// o "sigamos") ni saludos ("buenas": el cliente está iniciando contacto de nuevo).
const PALABRAS_CORTESIA = new Set([
  'gracias', 'muchas', 'mil', 'ok', 'okey', 'okay', 'oki', 'vale',
  'perfecto', 'genial', 'esta', 'bien', 'de', 'acuerdo', 'igualmente',
  'bendiciones', 'amen', 'muy', 'amable', 'feliz', 'dia', 'tarde', 'noche',
]);
function esCortesiaPura(tipo, texto) {
  if (tipo !== 'texto') return false;                 // fotos/audios/etc. cancelan como siempre
  const crudo = String(texto || '');
  if (/\d/.test(crudo)) return false;                 // trae un número (boleta, monto) → sustancia
  const t = crudo.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin tildes
    .replace(/[^a-zñ]+/gu, ' ')                       // fuera emojis, signos y demás
    .trim();
  if (!t) return true;                                // solo emojis/signos (🙏, 👍, ❤️)
  const palabras = t.split(' ');
  if (palabras.length > 5) return false;
  return palabras.every(p => PALABRAS_CORTESIA.has(p));
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
    // 🔒 Tope de arranques del motor por chat (H40): máx 6 por minuto por teléfono.
    // Una ráfaga legítima la junta el debounce del motor; esto solo frena el abuso
    // (inflar el gasto de IA a punta de mensajes). Si se pasa del tope NO se pierde
    // nada: el mensaje ya quedó guardado y el barredor del cron lo retoma en ~2 min.
    if (!(await permitido('disparo:' + lineaId + ':' + telefono, 60, 6))) return;
    await fetch('https://www.losplata.com.co/api/whatsapp/agente-responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, linea_id: lineaId, interno: secretoInterno() }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (e) {
    // El corte a 1.5s es la ruta NORMAL (el motor sigue procesando aparte). Pero antes
    // un fallo REAL del disparo (red, DNS) era indistinguible y el chat quedaba mudo sin
    // rastro (H13): ahora solo lo esperado se calla; lo demás queda en el log de Vercel.
    if (e && e.name !== 'TimeoutError' && e.name !== 'AbortError') {
      console.error('[whatsapp/recibir] el disparo del agente FALLÓ (el chat puede quedar sin respuesta):', e.message || e);
    }
  }
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

// ── Buscar o crear la conversación (el chat del cliente) ────────────────────
// H71: esta función ya NO actualiza contadores/ventana/último-mensaje de un chat existente:
// eso lo hace guardarEntrante SOLO si el mensaje resultó ser nuevo (no un reintento de Meta).
// Si el chat no existe, sí se crea completo (un chat nuevo implica mensaje nuevo).
async function buscarOCrearConversacion(telefono, nombrePerfil, preview, ts, esEntrante, lineaId) {
  // El chat es único por (línea + teléfono): el mismo cliente puede escribirle a varias líneas.
  let busqueda = supabaseAdmin
    .from('conversaciones_whatsapp')
    .select('id, no_leidos')
    .eq('telefono', telefono);
  busqueda = lineaId ? busqueda.eq('linea_id', lineaId) : busqueda.is('linea_id', null);
  const { data: existente } = await busqueda.maybeSingle();
  if (existente) return { id: existente.id, esNuevo: false, no_leidos: existente.no_leidos || 0 };

  const fila = {
    telefono,
    linea_id: lineaId,
    ultimo_mensaje: preview?.slice(0, 200) ?? null,
    ultimo_at: ts,
    ultimo_entrante: esEntrante,
  };
  if (nombrePerfil) fila.nombre_perfil = nombrePerfil;
  if (esEntrante) {
    fila.ventana_vence_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    fila.no_leidos = 1;
    fila.estado = 'bot';
  }
  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert(fila)
    .select('id')
    .single();
  return { id: nueva?.id, esNuevo: true, no_leidos: 1 };   // esNuevo = primera vez que escribe
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
