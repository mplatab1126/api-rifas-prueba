import { aplicarCors } from '../lib/cors.js';

/**
 * Tool del agente Camila: guardar los datos personales del cliente en Chatea Pro.
 *
 * Cuando el cliente envía su nombre, apellido y/o ciudad, Camila llama a esta
 * tool para persistirlos en los user fields de Chatea Pro. Así el asesor
 * humano (y el resto del sistema) ven los datos en el perfil del cliente.
 *
 * Se pueden actualizar 1, 2 o los 3 campos en una sola llamada. Los que no
 * vengan en el body se dejan como están.
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON:
 *   {
 *     "user_ns": "f159929u602921253",       // obligatorio
 *     "nombre": "Juan Carlos",               // opcional
 *     "apellido": "Pérez Gómez",             // opcional
 *     "ciudad": "Bogotá"                     // opcional
 *   }
 *
 * Mapeo a user fields de Chatea Pro (L1):
 *   nombre   → "[LPR] Nombre del cliente"
 *   apellido → "[LPR] Apellido del cliente"
 *   ciudad   → "[LPR] Ciudad del cliente"
 *
 * Respuesta:
 *   { "ok": true, "guardados": ["nombre", "apellido", "ciudad"] }
 *   { "ok": false, "error": "...", "detalles": [...] }
 */

const CAMPO_NOMBRE = '[LPR] Nombre del cliente';
const CAMPO_APELLIDO = '[LPR] Apellido del cliente';
const CAMPO_CIUDAD = '[LPR] Ciudad del cliente';

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

async function setField(token, user_ns, field_name, value) {
  const r = await fetch('https://chateapro.app/api/subscriber/set-user-field-by-name', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ user_ns, field_name, value }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data, field: field_name };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usa POST' });
  }
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const { user_ns, nombre, apellido, ciudad } = req.body || {};
  if (!user_ns) return res.status(400).json({ ok: false, error: 'Falta user_ns' });

  const token = tokenDeLinea(user_ns);
  if (!token) return res.status(400).json({ ok: false, error: 'user_ns no reconocido o token no configurado' });

  const peticiones = [];
  const etiquetas = [];
  if (typeof nombre === 'string' && nombre.trim()) {
    peticiones.push(setField(token, user_ns, CAMPO_NOMBRE, nombre.trim().slice(0, 200)));
    etiquetas.push('nombre');
  }
  if (typeof apellido === 'string' && apellido.trim()) {
    peticiones.push(setField(token, user_ns, CAMPO_APELLIDO, apellido.trim().slice(0, 200)));
    etiquetas.push('apellido');
  }
  if (typeof ciudad === 'string' && ciudad.trim()) {
    peticiones.push(setField(token, user_ns, CAMPO_CIUDAD, ciudad.trim().slice(0, 200)));
    etiquetas.push('ciudad');
  }

  if (peticiones.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debes enviar al menos uno de: nombre, apellido, ciudad' });
  }

  const resultados = await Promise.all(peticiones);
  const errores = resultados.filter((r) => !r.ok);
  if (errores.length > 0) {
    return res.status(200).json({
      ok: false,
      error: errores.map((e) => `${e.field}: ${e.status} ${JSON.stringify(e.data)}`).join(' | '),
      detalles: resultados,
    });
  }

  return res.status(200).json({
    ok: true,
    guardados: etiquetas,
  });
}
