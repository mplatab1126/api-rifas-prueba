import {
  CLASIFICADOR_SYSTEM_DEFAULT,
  CATEGORIAS_VALIDAS,
  TAG_POR_CATEGORIA,
} from './clasificador-prompt.js';

/**
 * Clasificación de intenciones para el subflujo "Plantilla" (difusiones).
 * ChateaPro llama este endpoint desde un nodo de solicitud HTTP en lugar del nodo de IA nativo.
 *
 * Seguridad: header Authorization: Bearer <CHATEAPRO_CLASIFICAR_SECRET>
 * Cuerpo JSON (flexible):
 *   { "mensaje": "texto del cliente" }
 * También acepta: message, text, contenido, o el string en req.body si viene plano.
 *
 * Respuesta 200:
 *   { "ok": true, "categoria": "PAGO", "tag": "Plantilla pago" }
 * Si falla la IA:
 *   { "ok": false, "categoria": "NINGUNO", "tag": "Plantilla ninguno", "error": "..." }
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-chateapro-secret');
}

function extraerMensaje(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body.trim();
  const b = body;
  const raw =
    b.mensaje ??
    b.message ??
    b.text ??
    b.contenido ??
    b.texto ??
    b.mensaje_cliente ??
    (b.data && (b.data.mensaje || b.data.message || b.data.text));
  if (raw == null) return '';
  return String(raw).trim();
}

function authOk(req) {
  const secret = process.env.CHATEAPRO_CLASIFICAR_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer && bearer === secret) return true;
  const h = req.headers['x-chateapro-secret'];
  if (h && String(h) === secret) return true;
  return false;
}

function parseJsonFromModel(text) {
  const t = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Sin JSON en respuesta');
  return JSON.parse(t.slice(start, end + 1));
}

function normalizarCategoria(val) {
  const s = String(val || '').trim().toUpperCase();
  const map = {
    'MEDIODEPAGO': 'MEDIO DE PAGO',
    'MEDIO_DE_PAGO': 'MEDIO DE PAGO',
    'MEDIO DE PAGO': 'MEDIO DE PAGO',
  };
  if (map[s]) return map[s];
  const found = CATEGORIAS_VALIDAS.find((c) => c.toUpperCase() === s);
  return found || null;
}

async function clasificarConClaude(mensaje, systemPrompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en el servidor');

  const model =
    process.env.ANTHROPIC_CLASIFICADOR_MODEL || 'claude-haiku-4-5-20251001';

  const userBlock = `MENSAJE DEL CLIENTE (puede ser corto o coloquial colombiano):
"""
${mensaje.slice(0, 8000)}
"""

Devuelve SOLO el JSON {"categoria":"..."} con una de las categorías permitidas en el system prompt.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      system: systemPrompt,
      messages: [{ role: 'user', content: userBlock }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const parsed = parseJsonFromModel(text);
  const cat = normalizarCategoria(parsed.categoria);
  if (!cat) throw new Error(`Categoría inválida: ${parsed.categoria}`);
  return cat;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, mensaje: 'Usa POST' });
  }

  if (!authOk(req)) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado' });
  }

  const mensaje = extraerMensaje(req.body);
  if (!mensaje) {
    return res.status(400).json({
      ok: false,
      categoria: 'NINGUNO',
      tag: TAG_POR_CATEGORIA.NINGUNO,
      mensaje: 'Falta el texto del cliente (mensaje / message / text)',
    });
  }

  const systemPrompt =
    process.env.CHATEAPRO_CLASIFICADOR_SYSTEM || CLASIFICADOR_SYSTEM_DEFAULT;

  try {
    const categoria = await clasificarConClaude(mensaje, systemPrompt);
    const tag = TAG_POR_CATEGORIA[categoria] || TAG_POR_CATEGORIA.NINGUNO;
    return res.status(200).json({
      ok: true,
      categoria,
      tag,
    });
  } catch (e) {
    console.error('[clasificar-plantilla]', e);
    return res.status(200).json({
      ok: false,
      categoria: 'NINGUNO',
      tag: TAG_POR_CATEGORIA.NINGUNO,
      error: String(e.message || e).slice(0, 500),
    });
  }
}
