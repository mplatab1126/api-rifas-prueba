import { aplicarCors } from '../lib/cors.js';

/**
 * Tool del agente Camila: enviar los medios de pago al cliente por WhatsApp.
 *
 * Llamado desde el motor del agente (webhook principal) cuando Camila decide
 * que el cliente ya está listo para pagar (tiene número elegido + datos).
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON:
 *   { "user_ns": "f159929u602921253" }   // obligatorio
 *   { "user_ns": "...", "nombre_cliente": "Juan" }  // opcional para personalizar
 *
 * Respuesta:
 *   { "ok": true, "enviado": true }
 *   { "ok": false, "error": "..." }
 *
 * ⚠️ ACTUALIZAR AQUÍ SI CAMBIAN LAS CUENTAS BANCARIAS:
 * La constante TEXTO_MEDIOS_PAGO de abajo es lo que se envía al cliente.
 * Si Mateo cambia de banco, Nequi o Daviplata, EDITAR ESTE TEXTO.
 * Se puede migrar a bot field de Chatea Pro más adelante si se necesita
 * que Mateo lo edite sin tocar código.
 */

const TEXTO_MEDIOS_PAGO = `*Estos son nuestros medios de pago* 💳

🟣 *NEQUI*
Número: 310 000 0000
A nombre de: Mateo Plata Buitrago

🔴 *DAVIPLATA*
Número: 310 000 0000
A nombre de: Mateo Plata Buitrago

🟡 *BANCOLOMBIA*
Cuenta de Ahorros: 000 000 000 00
A nombre de: Los Plata S.A.S.

Cuando termines, envíanos el comprobante por este mismo chat y lo verificamos enseguida. 😊`;

function tokenDeLinea(userNs) {
  if (typeof userNs !== 'string') return null;
  if (userNs.startsWith('f159929')) return process.env.CHATEA_TOKEN_LINEA_1;
  if (userNs.startsWith('f166221')) return process.env.CHATEA_TOKEN_LINEA_2;
  return null;
}

function authOk(req) {
  const secret = process.env.CAMILA_TOOLS_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === secret;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usa POST' });
  }
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const { user_ns, nombre_cliente } = req.body || {};
  if (!user_ns) {
    return res.status(400).json({ ok: false, error: 'Falta user_ns' });
  }

  const token = tokenDeLinea(user_ns);
  if (!token) {
    return res.status(400).json({ ok: false, error: `user_ns no reconocido (debe empezar por f159929 o f166221)` });
  }

  const saludo = nombre_cliente ? `${nombre_cliente}, ` : '';
  const texto = saludo + TEXTO_MEDIOS_PAGO;

  try {
    const r = await fetch('https://chateapro.app/api/subscriber/send-text', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        user_ns,
        text: texto,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(200).json({
        ok: false,
        error: `ChateaPro ${r.status}: ${data?.message || JSON.stringify(data)}`,
      });
    }
    return res.status(200).json({ ok: true, enviado: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
