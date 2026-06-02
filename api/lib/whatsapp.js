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
