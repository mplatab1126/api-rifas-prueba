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
  if (lineaId) {
    try {
      const { data } = await supabaseAdmin.from('lineas_whatsapp').select('token').eq('phone_number_id', lineaId).maybeSingle();
      if (data && data.token) token = data.token;
    } catch (_) {}
  }
  return { token, phoneNumberId };
}

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
    const desc = await fetch(url);
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
    const metaResp = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const info = await metaResp.json();
    if (!info.url) return { ok: false, error: info.error?.message || 'No se encontró el archivo.' };

    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return { ok: false, error: 'No se pudo descargar el archivo.' };

    const buffer = Buffer.from(await bin.arrayBuffer());
    return { ok: true, base64: buffer.toString('base64'), mimeType: info.mime_type || 'image/jpeg' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
