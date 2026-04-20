import { supabaseAdmin } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * Lista los tags de Chatea Pro (ambas líneas) para el dropdown al crear plantillas.
 * Solo tags [LPR] y otros de difusión son relevantes, pero devolvemos todos con filtro opcional.
 *
 * Body: { contrasena, linea?: 'L1'|'L2'|'all', filtro?: 'LPR' }
 */

const SOLO_MATEO_DEFAULT = ['mateo'];

async function tienePermiso(asesorNombre) {
  const name = asesorNombre.toLowerCase().trim();
  const { data } = await supabaseAdmin
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', asesorNombre)
    .eq('pagina_id', 'clasificaciones')
    .maybeSingle();
  if (data && typeof data.permitido === 'boolean') return data.permitido;
  return SOLO_MATEO_DEFAULT.includes(name);
}

async function traerTags(token) {
  const tags = [];
  for (let page = 1; page <= 5; page++) {
    try {
      const r = await fetch(`https://chateapro.app/api/flow/tags?limit=50&page=${page}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!r.ok) break;
      const d = await r.json();
      tags.push(...(d.data ?? []));
      if (!d.links?.next) break;
      await new Promise(r => setTimeout(r, 150));
    } catch { break; }
  }
  return tags;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const nombre = validarAsesor(req.body?.contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!(await tienePermiso(nombre))) return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso' });

  const linea = req.body?.linea || 'all';
  const filtro = req.body?.filtro || '';

  const todos = [];
  if (linea === 'L1' || linea === 'all') {
    const t1 = process.env.CHATEA_TOKEN_LINEA_1;
    if (t1) {
      const tags = await traerTags(t1);
      tags.forEach(t => todos.push({ ...t, linea: 'L1' }));
    }
  }
  if (linea === 'L2' || linea === 'all') {
    const t2 = process.env.CHATEA_TOKEN_LINEA_2;
    if (t2) {
      const tags = await traerTags(t2);
      tags.forEach(t => todos.push({ ...t, linea: 'L2' }));
    }
  }

  let out = todos;
  if (filtro) {
    const f = filtro.toLowerCase();
    out = out.filter(t => (t.name || '').toLowerCase().includes(f));
  }

  out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return res.status(200).json({
    status: 'ok',
    tags: out.map(t => ({ tag_ns: t.tag_ns, name: t.name, linea: t.linea })),
  });
}
