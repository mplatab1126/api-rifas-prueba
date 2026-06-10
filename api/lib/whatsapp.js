/**
 * Helper central para hablar con la API oficial de WhatsApp (Meta Cloud API).
 *
 * Esta es la "oficina de correos" de Meta: sabe ENVIAR mensajes (texto, foto,
 * audio, etc.) y nosotros la usamos desde nuestro propio sistema, sin ChateaPro
 * de por medio. Recibir mensajes se maneja en api/whatsapp/recibir.js (el timbre).
 *
 * Variables de entorno (configurar en Vercel cuando la app de Meta esté lista):
 *
 *   WHATSAPP_TOKEN            - Token de acceso de la app de Meta (como una contraseña).
 *   WHATSAPP_PHONE_NUMBER_ID  - "Identificador del número de teléfono" desde el que se envía.
 *   WHATSAPP_VERIFY_TOKEN     - Palabra secreta que TÚ inventas, para el "apretón de manos"
 *                               cuando Meta verifica el webhook (debe coincidir en los dos lados).
 *
 * Mientras esas variables no existan, las funciones devuelven { ok:false, error:... }
 * de forma controlada (no se cae nada).
 */

import { supabaseAdmin } from './supabase.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function configWhatsapp() {
  return {
    token:         process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken:   process.env.WHATSAPP_VERIFY_TOKEN,
  };
}

/**
 * Resuelve el token y el número de envío de UNA línea (multi-línea).
 * lineaId es el phone_number_id de Meta. Si la línea tiene token propio en la
 * tabla lineas_whatsapp se usa ese; si no, cae al WHATSAPP_TOKEN de Vercel
 * (la línea de prueba). Así agregar una línea = agregar una fila.
 *
 * @param {string} lineaId - phone_number_id de la línea
 * @returns {Promise<{token:string, phoneNumberId:string}>}
 */
export async function resolverLinea(lineaId) {
  let token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = lineaId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  let wabaId = null;
  if (lineaId) {
    // H85: memoria de 60s por línea — el contacto inicial (saludo + fotos + cierre) hacía
    // 6+ lecturas IDÉNTICAS de esta tabla en una sola corrida. Solo se guarda la lectura
    // EXITOSA (un error transitorio no debe fijar el token de respaldo por 60s).
    const enCache = _lineaCache.get(lineaId);
    if (enCache && Date.now() - enCache.ts < 60000) return { ...enCache.valor };
    try {
      const { data, error } = await supabaseAdmin.from('lineas_whatsapp').select('token, waba_id').eq('phone_number_id', lineaId).maybeSingle();
      if (data && data.token) token = data.token;
      if (data && data.waba_id) wabaId = data.waba_id;
      if (!error) _lineaCache.set(lineaId, { ts: Date.now(), valor: { token, phoneNumberId, wabaId } });
    } catch (_) {}
  }
  return { token, phoneNumberId, wabaId };
}
const _lineaCache = new Map();   // lineaId → { ts, valor } (vive por instancia caliente de Vercel)

/**
 * Envía un mensaje de TEXTO a un número de WhatsApp.
 *
 * @param {string} telefono - Número internacional sin signos, ej: '573001234567'
 * @param {string} texto    - El mensaje
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarTexto(telefono, texto, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }

  try {
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'text',
        text: { preview_url: true, body: texto },
      }),
      // H34: si Meta se cuelga, cortar a los 30s y devolver { ok:false } manejable,
      // en vez de dejar el turno entero colgado hasta que Vercel lo mate.
      signal: AbortSignal.timeout(30000),
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    }
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía una IMAGEN por URL (link público) a un número de WhatsApp.
 * Meta descarga la imagen del link y se la entrega al cliente.
 *
 * @param {string} telefono - Número internacional sin signos
 * @param {string} url      - URL pública de la imagen (jpg/png)
 * @param {string} caption  - Pie de foto opcional
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarImagen(telefono, url, caption, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }

  try {
    const image = { link: url };
    if (caption) image.caption = caption;
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'image',
        image,
      }),
      signal: AbortSignal.timeout(30000),   // H34
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    }
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Sube una imagen a Meta a partir de su URL pública y devuelve su media_id.
 *
 * Por qué: cuando se envía una imagen "por link", Meta la descarga del URL
 * RECIÉN al momento de entregarla, y esa demora hace que el mensaje siguiente
 * (un texto) le llegue antes al cliente, descuadrando el orden. Si en cambio
 * subimos la imagen primero, queda EN los servidores de Meta y se entrega de
 * inmediato, igual de rápido que un texto → el orden se respeta.
 *
 * @returns {Promise<{ok:boolean, media_id?:string, error?:string}>}
 */
export async function subirMediaDesdeUrl(url, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }

  try {
    const desc = await fetch(url, { signal: AbortSignal.timeout(60000) });   // H34
    if (!desc.ok) return { ok: false, error: `No se pudo descargar la imagen (HTTP ${desc.status}).` };
    const mime = (desc.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buffer = Buffer.from(await desc.arrayBuffer());

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([buffer], { type: mime }), 'imagen');

    const up = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60000),   // H34
    });
    const data = await up.json();
    if (!up.ok || data.error || !data.id) {
      return { ok: false, error: data.error?.message || `HTTP ${up.status}` };
    }
    return { ok: true, media_id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Sube un archivo (foto o PDF) a Meta a partir de sus BYTES (no de un URL) y
 * devuelve su media_id. Lo usa la bandeja cuando el asesor adjunta un archivo
 * desde su propio computador.
 *
 * @returns {Promise<{ok:boolean, media_id?:string, error?:string}>}
 */
export async function subirMediaDesdeBuffer(buffer, mime, filename, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }

  try {
    const tipo = (mime || 'application/octet-stream').split(';')[0].trim();
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', tipo);
    form.append('file', new Blob([buffer], { type: tipo }), filename || 'archivo');

    const up = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60000),   // H34
    });
    const data = await up.json();
    if (!up.ok || data.error || !data.id) {
      return { ok: false, error: data.error?.message || `HTTP ${up.status}` };
    }
    return { ok: true, media_id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía una imagen que YA está subida a Meta (por su media_id).
 *
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarImagenPorId(telefono, mediaId, caption, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }

  try {
    const image = { id: mediaId };
    if (caption) image.caption = caption;
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'image',
        image,
      }),
      signal: AbortSignal.timeout(30000),   // H34
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    }
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía un DOCUMENTO (PDF, etc.) por URL pública a un número de WhatsApp.
 * Meta descarga el archivo del link y se lo entrega al cliente.
 *
 * @param {string} telefono - Número internacional sin signos
 * @param {string} url      - URL pública del documento
 * @param {string} filename - Nombre con el que el cliente verá el archivo
 * @param {string} caption  - Texto opcional bajo el documento
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarDocumento(telefono, url, filename, caption, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }
  try {
    const document = { link: url };
    if (filename) document.filename = filename;
    if (caption) document.caption = caption;
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: telefono, type: 'document', document,
      }),
      signal: AbortSignal.timeout(30000),   // H34
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    }
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía un DOCUMENTO (PDF, etc.) que YA está subido a Meta (por su media_id).
 *
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarDocumentoPorId(telefono, mediaId, filename, caption, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  }
  try {
    const document = { id: mediaId };
    if (filename) document.filename = filename;
    if (caption) document.caption = caption;
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: telefono, type: 'document', document,
      }),
      signal: AbortSignal.timeout(30000),   // H34
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    }
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Descarga un archivo de WhatsApp (foto/PDF) y lo devuelve como base64.
 * Igual que el endpoint media.js pero como función reutilizable desde el backend.
 *
 * @param {string} mediaId - El identificador del archivo en Meta
 * @returns {Promise<{ok:boolean, base64?:string, mimeType?:string, error?:string}>}
 */
export async function descargarMediaBase64(mediaId, lineaId) {
  const { token } = await resolverLinea(lineaId);
  if (!token) return { ok: false, error: 'No hay token configurado para esta línea.' };

  try {
    const metaResp = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });   // H34
    const info = await metaResp.json();
    if (!info.url) return { ok: false, error: info.error?.message || 'No se encontró el archivo.' };

    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });   // H34
    if (!bin.ok) return { ok: false, error: 'No se pudo descargar el archivo.' };

    const buffer = Buffer.from(await bin.arrayBuffer());
    return { ok: true, base64: buffer.toString('base64'), mimeType: info.mime_type || 'image/jpeg' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PLANTILLAS (templates) y DIFUSIONES
//
// WhatsApp NO permite escribirle "en frío" a un cliente (fuera de la ventana de
// 24h desde su último mensaje). Para eso obliga a usar una PLANTILLA que Meta
// haya aprobado antes. Las plantillas se administran a nivel de WABA (la cuenta
// de WhatsApp Business), no del número; por eso aquí resolvemos el waba_id.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Arma los "componentes" de una plantilla en el formato que pide Meta, a partir
 * de los campos simples que llenó el asesor (encabezado, cuerpo, pie, ejemplos).
 * Si el cuerpo tiene variables {{1}}, {{2}}..., Meta exige un ejemplo por cada una.
 */
export function construirComponentesPlantilla({ encabezado, cuerpo, pie, ejemplo_variables }) {
  const componentes = [];
  if (encabezado && String(encabezado).trim()) {
    componentes.push({ type: 'HEADER', format: 'TEXT', text: String(encabezado).trim() });
  }
  const body = { type: 'BODY', text: cuerpo };
  const numVars = (String(cuerpo).match(/\{\{\s*\d+\s*\}\}/g) || []).length;
  if (numVars > 0) {
    const ejemplos = Array.isArray(ejemplo_variables) ? ejemplo_variables.map(v => String(v || 'Ejemplo')) : [];
    while (ejemplos.length < numVars) ejemplos.push('Ejemplo');
    body.example = { body_text: [ejemplos.slice(0, numVars)] };
  }
  componentes.push(body);
  if (pie && String(pie).trim()) {
    componentes.push({ type: 'FOOTER', text: String(pie).trim() });
  }
  return componentes;
}

/**
 * Crea la plantilla EN META (la manda a revisión). Devuelve {ok, id, estado, error}.
 */
export async function crearPlantillaMeta(lineaId, { nombre, categoria, idioma, componentes }) {
  const { token, wabaId } = await resolverLinea(lineaId);
  if (!token) return { ok: false, error: 'No hay token configurado para esta línea.' };
  if (!wabaId) return { ok: false, error: 'Esta línea no tiene su cuenta de WhatsApp Business (WABA) configurada. No se puede crear la plantilla.' };
  try {
    const resp = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, language: idioma, category: categoria, components: componentes }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    return { ok: true, id: data.id, estado: data.status, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Trae el estado actual de TODAS las plantillas de la WABA desde Meta
 * (para saber cuáles aprobó/rechazó). Devuelve {ok, plantillas:[...]}.
 */
export async function listarPlantillasMeta(lineaId) {
  const { token, wabaId } = await resolverLinea(lineaId);
  if (!token || !wabaId) return { ok: false, error: 'Falta el token o la cuenta de WhatsApp Business (WABA) de esta línea.' };
  try {
    const resp = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,components,id,rejected_reason&limit=250`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    return { ok: true, plantillas: data.data || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Borra una plantilla en Meta (por nombre).
 */
export async function eliminarPlantillaMeta(lineaId, nombre) {
  const { token, wabaId } = await resolverLinea(lineaId);
  if (!token || !wabaId) return { ok: false, error: 'Falta el token o la cuenta de WhatsApp Business (WABA) de esta línea.' };
  try {
    const resp = await fetch(`${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(nombre)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía un mensaje de PLANTILLA a un número (esto es lo que permite escribir
 * fuera de la ventana de 24h). `parametros` son los valores de {{1}}, {{2}}...
 *
 * @param {string} telefono
 * @param {{nombre:string, idioma:string, parametros?:string[]}} plantilla
 * @param {string} lineaId
 */
export async function enviarPlantilla(telefono, { nombre, idioma, parametros, botonUrlParam }, lineaId) {
  const { token, phoneNumberId } = await resolverLinea(lineaId);
  if (!token || !phoneNumberId) return { ok: false, error: 'No hay token/número configurado para esta línea.' };
  const componentes = [];
  if (Array.isArray(parametros) && parametros.length) {
    componentes.push({ type: 'body', parameters: parametros.map(p => ({ type: 'text', text: String(p ?? '') })) });
  }
  // Si la plantilla tiene un botón de URL dinámica, su parte variable va aquí.
  if (botonUrlParam != null && botonUrlParam !== '') {
    componentes.push({ type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: String(botonUrlParam) }] });
  }
  try {
    const resp = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'template',
        template: {
          name: nombre,
          language: { code: idioma },
          ...(componentes.length ? { components: componentes } : {}),
        },
      }),
      signal: AbortSignal.timeout(30000),   // H34
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, raw: data };
    return { ok: true, wa_message_id: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
