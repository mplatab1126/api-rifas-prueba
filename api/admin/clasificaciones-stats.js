import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * Stats y listado de clasificaciones de difusiones (tabla clasificaciones_plantilla).
 * Acceso controlado por permisos_asesores (por defecto solo Mateo).
 *
 * Body:
 *   { contrasena: "LosP", dias: 7, categoria: "PAGO"|null, linea: "L1"|null, solo_errores: false }
 */

const SOLO_MATEO_DEFAULT = ['mateo'];

async function tienePermisoClasificaciones(asesorNombre) {
  const name = asesorNombre.toLowerCase().trim();
  // 1) Permiso explícito en DB
  const { data } = await supabaseAdmin
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', asesorNombre)
    .eq('pagina_id', 'clasificaciones')
    .maybeSingle();
  if (data && typeof data.permitido === 'boolean') return data.permitido;
  // 2) Default: solo Mateo
  return SOLO_MATEO_DEFAULT.includes(name);
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const nombre = validarAsesor(req.body?.contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  const permitido = await tienePermisoClasificaciones(nombre);
  if (!permitido) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso para esta página' });
  }

  const dias = Math.max(1, Math.min(90, Number(req.body?.dias) || 7));
  const categoria = req.body?.categoria || null;  // filtro opcional
  const linea = req.body?.linea || null;          // 'L1' | 'L2' | null
  const soloErrores = !!req.body?.solo_errores;

  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  let query = supabase
    .from('clasificaciones_plantilla')
    .select('id, user_ns, linea, nombre, telefono, mensaje_analizado, categoria, tag_aplicado, lpr_tag, created_at, evaluado_at, evaluacion_correcta, evaluacion_categoria_correcta, evaluacion_razon')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500);

  if (categoria) query = query.eq('categoria', categoria);
  if (linea) query = query.eq('linea', linea);
  if (soloErrores) query = query.eq('evaluacion_correcta', false);

  const { data, error } = await query;
  if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

  const rows = data || [];

  // KPIs
  const total = rows.length;
  const evaluadas = rows.filter(r => r.evaluado_at).length;
  const correctas = rows.filter(r => r.evaluacion_correcta === true).length;
  const incorrectas = rows.filter(r => r.evaluacion_correcta === false).length;
  const pendientesEval = rows.filter(r => !r.evaluado_at).length;

  // Por categoría
  const porCategoria = {};
  for (const r of rows) {
    const c = r.categoria || '¿?';
    if (!porCategoria[c]) porCategoria[c] = { total: 0, correctas: 0, incorrectas: 0 };
    porCategoria[c].total++;
    if (r.evaluacion_correcta === true) porCategoria[c].correctas++;
    if (r.evaluacion_correcta === false) porCategoria[c].incorrectas++;
  }

  // Por línea
  const porLinea = {};
  for (const r of rows) {
    const l = r.linea || '?';
    if (!porLinea[l]) porLinea[l] = { total: 0, correctas: 0, incorrectas: 0 };
    porLinea[l].total++;
    if (r.evaluacion_correcta === true) porLinea[l].correctas++;
    if (r.evaluacion_correcta === false) porLinea[l].incorrectas++;
  }

  // Por día (para gráfica)
  const porDia = {};
  for (const r of rows) {
    const d = r.created_at?.substring(0, 10) || 'unknown';
    if (!porDia[d]) porDia[d] = { total: 0, correctas: 0, incorrectas: 0 };
    porDia[d].total++;
    if (r.evaluacion_correcta === true) porDia[d].correctas++;
    if (r.evaluacion_correcta === false) porDia[d].incorrectas++;
  }

  return res.status(200).json({
    status: 'ok',
    filtros: { dias, categoria, linea, solo_errores: soloErrores },
    kpis: {
      total,
      evaluadas,
      pendientes_evaluacion: pendientesEval,
      correctas,
      incorrectas,
      precision_pct: evaluadas > 0 ? +(correctas / evaluadas * 100).toFixed(1) : null,
    },
    por_categoria: porCategoria,
    por_linea: porLinea,
    por_dia: porDia,
    filas: rows,
  });
}
