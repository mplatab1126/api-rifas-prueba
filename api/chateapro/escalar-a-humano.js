import { aplicarCors } from '../lib/cors.js';

/**
 * Tool del agente Camila: escalar una conversación a los asesores humanos.
 *
 * Llamado desde el motor del agente cuando:
 *   - Cliente envía imagen (posible comprobante)
 *   - Cliente pregunta por rifa diaria 2/3 cifras
 *   - Cliente muestra inconformidad o pide asesor
 *   - Pregunta fuera de la base de conocimiento
 *   - Cliente consulta número específico
 *
 * Pasos que ejecuta:
 *   1. Pausa al bot en esa conversación (`/subscriber/pause-bot`).
 *   2. Guarda el motivo del escalamiento en el user field "Motivo de Camila"
 *      (para que el asesor lo vea al abrir el chat).
 *   3. Agrega el tag "Escalado" al cliente.
 *
 * No asigna a ningún agente: los asesores revisan la bandeja general y toman
 * las conversaciones escaladas manualmente.
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON:
 *   {
 *     "user_ns": "f159929u602921253",    // obligatorio
 *     "razon": "Cliente inconforme"       // obligatorio, texto corto
 *   }
 *
 * Respuesta:
 *   { "ok": true, "escalado": true, "pasos_ejecutados": [...] }
 *   { "ok": false, "error": "...", "pasos_ejecutados": [...] }
 *
 * Variables de entorno requeridas en Vercel:
 *   - CAMILA_TOOLS_SECRET    → token para autenticar llamadas
 *   - CHATEA_TOKEN_LINEA_1   → token API línea 1 (ya existe)
 *   - CHATEA_TOKEN_LINEA_2   → token API línea 2 (opcional, solo si se activa L2)
 */

const NOMBRE_MOTIVO_FIELD = 'Motivo de Camila';
const NOMBRE_TAG_ESCALADO = 'Escalado';

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

async function llamarChatea(path, token, body, method = 'POST') {
  const r = await fetch(`https://chateapro.app/api${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
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

  const { user_ns, razon } = req.body || {};
  if (!user_ns) return res.status(400).json({ ok: false, error: 'Falta user_ns' });
  if (!razon) return res.status(400).json({ ok: false, error: 'Falta razon' });

  const token = tokenDeLinea(user_ns);
  if (!token) return res.status(400).json({ ok: false, error: 'user_ns no reconocido o token de línea no configurado' });

  const razonTruncada = String(razon).slice(0, 500);
  const pasos = [];
  const errores = [];

  // Paso 1: pausar el bot
  try {
    const r = await llamarChatea('/subscriber/pause-bot', token, { user_ns });
    pasos.push({ paso: 'pausar_bot', ok: r.ok, status: r.status });
    if (!r.ok) errores.push(`pausar_bot: ${r.status} ${JSON.stringify(r.data)}`);
  } catch (e) {
    pasos.push({ paso: 'pausar_bot', ok: false, error: String(e.message) });
    errores.push(`pausar_bot: ${e.message}`);
  }

  // Paso 2: guardar motivo en el user field "Motivo de Camila"
  try {
    const r = await llamarChatea('/subscriber/set-user-field-by-name', token, {
      user_ns,
      field_name: NOMBRE_MOTIVO_FIELD,
      value: razonTruncada,
    }, 'PUT');
    pasos.push({ paso: 'set_motivo', ok: r.ok, status: r.status });
    if (!r.ok) errores.push(`set_motivo: ${r.status} ${JSON.stringify(r.data)}`);
  } catch (e) {
    pasos.push({ paso: 'set_motivo', ok: false, error: String(e.message) });
    errores.push(`set_motivo: ${e.message}`);
  }

  // Paso 3: agregar tag "Escalado"
  try {
    const r = await llamarChatea('/subscriber/add-tag-by-name', token, {
      user_ns,
      tag_name: NOMBRE_TAG_ESCALADO,
    });
    pasos.push({ paso: 'add_tag', ok: r.ok, status: r.status });
    if (!r.ok) errores.push(`add_tag: ${r.status} ${JSON.stringify(r.data)}`);
  } catch (e) {
    pasos.push({ paso: 'add_tag', ok: false, error: String(e.message) });
    errores.push(`add_tag: ${e.message}`);
  }

  if (errores.length > 0) {
    return res.status(200).json({
      ok: false,
      escalado: false,
      razon: razonTruncada,
      error: errores.join(' | '),
      pasos_ejecutados: pasos,
    });
  }

  return res.status(200).json({
    ok: true,
    escalado: true,
    razon: razonTruncada,
    pasos_ejecutados: pasos,
  });
}
