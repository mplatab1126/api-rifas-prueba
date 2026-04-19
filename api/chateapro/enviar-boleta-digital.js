import { aplicarCors } from '../lib/cors.js';
import { supabase } from '../lib/supabase.js';
import { limpiarTelefono } from '../lib/telefono.js';

/**
 * Tool del agente Camila: enviar al cliente el link de su boleta digital.
 *
 * Flujo:
 *   1. Obtiene el teléfono del cliente (del body o de /subscriber/get-info).
 *   2. Consulta Supabase para traer todas las boletas asociadas a ese teléfono.
 *   3. Si no tiene boletas → responde ok:false con motivo "sin_boletas".
 *   4. Construye un mensaje con los enlaces y lo envía por /subscriber/send-text.
 *
 * IMPORTANTE: esta tool NO verifica pagos. Solo envía la boleta si el cliente
 * YA TIENE boletas registradas en Supabase (porque un asesor humano ya validó
 * el pago). Si el cliente nunca compró, esta tool no debe ejecutarse — Camila
 * debería escalar primero.
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON:
 *   {
 *     "user_ns": "f159929u602921253",    // obligatorio
 *     "telefono": "573101234567"          // opcional; si no viene se consulta a ChateaPro
 *   }
 *
 * Respuesta OK:
 *   { "ok": true, "boletas": ["1234","5678"], "telefono": "..." }
 * Sin boletas:
 *   { "ok": false, "motivo": "sin_boletas", "telefono": "..." }
 * Error técnico:
 *   { "ok": false, "error": "..." }
 */

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

async function obtenerTelefono(token, user_ns) {
  const r = await fetch(
    `https://chateapro.app/api/subscriber/get-info?user_ns=${encodeURIComponent(user_ns)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  const sub = d.data ?? d;
  return sub?.phone || null;
}

async function enviarTexto(token, user_ns, texto) {
  const r = await fetch('https://chateapro.app/api/subscriber/send-text', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ user_ns, content: texto }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usa POST' });
  }
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const { user_ns, telefono } = req.body || {};
  if (!user_ns) return res.status(400).json({ ok: false, error: 'Falta user_ns' });

  const token = tokenDeLinea(user_ns);
  if (!token) return res.status(400).json({ ok: false, error: 'user_ns no reconocido o token no configurado' });

  // 1. Obtener el teléfono (del body o consultándolo)
  let tel = telefono;
  if (!tel) {
    tel = await obtenerTelefono(token, user_ns);
    if (!tel) return res.status(200).json({ ok: false, error: 'No se pudo obtener el teléfono del cliente' });
  }
  const telefonoLimpio = limpiarTelefono(tel);
  const last10 = String(tel).replace(/\D/g, '').slice(-10);

  // 2. Consultar Supabase
  let boletas;
  try {
    const { data, error } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, clientes(nombre)')
      .like('telefono_cliente', '%' + last10);
    if (error) throw error;
    boletas = data || [];
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Supabase: ${e.message}` });
  }

  if (boletas.length === 0) {
    return res.status(200).json({
      ok: false,
      motivo: 'sin_boletas',
      telefono: telefonoLimpio,
      mensaje: 'El cliente no tiene boletas registradas. Camila debería escalar en vez de enviar boleta.',
    });
  }

  // 3. Construir mensaje con enlaces (mismo formato que /api/cliente)
  const nombre = boletas[0].clientes?.nombre || 'Cliente';
  const formatearPesos = (v) => '$' + Number(v).toLocaleString('es-CO');
  const enlaces = boletas
    .map((b) => `🎟️ *Boleta ${b.numero}:*\nhttps://www.losplata.com.co/boleta/${b.numero}`)
    .join('\n\n');
  const resumen = boletas
    .map((b) => `🎟️ *Boleta ${b.numero}* → Restante: *${formatearPesos(b.saldo_restante)}*`)
    .join('\n\n');

  const textoMensaje =
    `Aquí tienes tu boleta digital, ${nombre.split(' ')[0]} 🎟️\n\n` +
    `${enlaces}\n\n` +
    `*Resumen de tus boletas:*\n\n${resumen}`;

  // 4. Enviar por Chatea Pro
  const envio = await enviarTexto(token, user_ns, textoMensaje);
  if (!envio.ok) {
    return res.status(200).json({
      ok: false,
      error: `ChateaPro ${envio.status}: ${JSON.stringify(envio.data)}`,
      telefono: telefonoLimpio,
    });
  }

  return res.status(200).json({
    ok: true,
    boletas: boletas.map((b) => b.numero),
    telefono: telefonoLimpio,
    enviado: true,
  });
}
