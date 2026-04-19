import { aplicarCors } from '../lib/cors.js';

/**
 * Endpoint de diagnóstico para verificar que toda la configuración de Camila
 * esté bien. Útil para chequear de un vistazo antes de activar al agente.
 *
 * Verifica:
 *   1. Variable de entorno CAMILA_TOOLS_SECRET
 *   2. Variable de entorno CHATEA_TOKEN_LINEA_1
 *   3. Que exista el tag "Escalado" en Chatea Pro (L1)
 *   4. Que exista el user field "Motivo de Camila" en Chatea Pro (L1)
 *
 * Uso (desde el navegador):
 *   https://api-rifas-prueba.vercel.app/api/chateapro/verificar-camila?secret=TU_CAMILA_TOOLS_SECRET
 *
 * Devuelve JSON con el estado de cada chequeo.
 */

const NOMBRE_MOTIVO_FIELD = 'Motivo de Camila';
const NOMBRE_TAG_ESCALADO = 'Escalado';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;

  const secret = process.env.CAMILA_TOOLS_SECRET;
  if (!secret) {
    return res.status(500).json({
      ok: false,
      error: 'La variable de entorno CAMILA_TOOLS_SECRET no está configurada en Vercel',
    });
  }

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const querySecret = String(req.query.secret || '').trim();
  if (bearer !== secret && querySecret !== secret) {
    return res.status(401).json({ ok: false, error: 'Falta secret o es incorrecto' });
  }

  const token = process.env.CHATEA_TOKEN_LINEA_1;
  if (!token) {
    return res.status(200).json({
      ok: false,
      checks: {
        camila_tools_secret: { ok: true },
        chatea_token_linea_1: { ok: false, error: 'No configurado en Vercel' },
      },
    });
  }

  const checks = {
    camila_tools_secret: { ok: true },
    chatea_token_linea_1: { ok: true },
    tag_escalado: { ok: false, error: 'No verificado' },
    user_field_motivo_camila: { ok: false, error: 'No verificado' },
  };

  // 1. Verificar tag "Escalado"
  try {
    const r = await fetch('https://chateapro.app/api/flow/tags', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const d = await r.json();
    if (!r.ok) {
      checks.tag_escalado = { ok: false, error: `ChateaPro ${r.status}` };
    } else {
      const tags = d.data || [];
      const tag = tags.find((t) => t.name === NOMBRE_TAG_ESCALADO);
      checks.tag_escalado = tag
        ? { ok: true, nombre: tag.name, tag_ns: tag.tag_ns }
        : { ok: false, error: `No existe tag "${NOMBRE_TAG_ESCALADO}" en L1` };
    }
  } catch (e) {
    checks.tag_escalado = { ok: false, error: String(e.message) };
  }

  // 2. Verificar user field "Motivo de Camila"
  try {
    const r = await fetch('https://chateapro.app/api/flow/user-fields', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const d = await r.json();
    if (!r.ok) {
      checks.user_field_motivo_camila = { ok: false, error: `ChateaPro ${r.status}` };
    } else {
      const fields = d.data || [];
      const field = fields.find((f) => f.name === NOMBRE_MOTIVO_FIELD);
      checks.user_field_motivo_camila = field
        ? { ok: true, nombre: field.name, var_ns: field.var_ns, tipo: field.var_type }
        : { ok: false, error: `No existe user field "${NOMBRE_MOTIVO_FIELD}" en L1` };
    }
  } catch (e) {
    checks.user_field_motivo_camila = { ok: false, error: String(e.message) };
  }

  const todoOk = Object.values(checks).every((c) => c.ok);
  return res.status(200).json({
    ok: todoOk,
    resumen: todoOk
      ? 'Todo listo para activar a Camila 🚀'
      : 'Hay items faltantes. Revisa los checks.',
    checks,
  });
}
