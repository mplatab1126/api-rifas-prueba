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

const GRAPH = 'https://graph.facebook.com/v21.0';

export function configWhatsapp() {
  return {
    token:         process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken:   process.env.WHATSAPP_VERIFY_TOKEN,
  };
}

/**
 * Envía un mensaje de TEXTO a un número de WhatsApp.
 *
 * @param {string} telefono - Número internacional sin signos, ej: '573001234567'
 * @param {string} texto    - El mensaje
 * @returns {Promise<{ok:boolean, wa_message_id?:string, error?:string, raw?:object}>}
 */
export async function enviarTexto(telefono, texto) {
  const { token, phoneNumberId } = configWhatsapp();
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en Vercel.' };
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
