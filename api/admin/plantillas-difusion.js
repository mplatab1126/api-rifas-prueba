import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * CRUD de plantillas de difusión — solo Mateo.
 *
 * Body por acción:
 *   { contrasena, accion:'listar' }
 *   { contrasena, accion:'crear',   data: { nombre, tag_ns, tag_nombre, linea, texto_plantilla, activa } }
 *   { contrasena, accion:'actualizar', id, data: { ...campos a actualizar } }
 *   { contrasena, accion:'eliminar', id }
 *   { contrasena, accion:'toggle-activa', id }
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

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const nombre = validarAsesor(req.body?.contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!(await tienePermiso(nombre))) return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso' });

  const { accion, id, data } = req.body;

  if (accion === 'listar' || !accion) {
    const { data: filas, error } = await supabase
      .from('plantillas_difusion')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', plantillas: filas || [] });
  }

  if (accion === 'crear') {
    if (!data?.nombre || !data?.tag_ns || !data?.texto_plantilla) {
      return res.status(400).json({ status: 'error', mensaje: 'Faltan campos: nombre, tag_ns, texto_plantilla' });
    }
    const { data: fila, error } = await supabase
      .from('plantillas_difusion')
      .insert([{
        nombre: data.nombre,
        tag_ns: data.tag_ns,
        tag_nombre: data.tag_nombre || null,
        linea: data.linea || null,
        texto_plantilla: data.texto_plantilla,
        activa: data.activa !== false,
      }])
      .select()
      .single();
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', plantilla: fila });
  }

  if (accion === 'actualizar') {
    if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta id' });
    const update = { updated_at: new Date().toISOString() };
    ['nombre', 'tag_ns', 'tag_nombre', 'linea', 'texto_plantilla', 'activa'].forEach(k => {
      if (data && k in data) update[k] = data[k];
    });
    const { error } = await supabase
      .from('plantillas_difusion')
      .update(update)
      .eq('id', id);
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok' });
  }

  if (accion === 'eliminar') {
    if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta id' });
    const { error } = await supabase.from('plantillas_difusion').delete().eq('id', id);
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok' });
  }

  if (accion === 'toggle-activa') {
    if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta id' });
    const { data: actual } = await supabase.from('plantillas_difusion').select('activa').eq('id', id).single();
    const nueva = !(actual?.activa);
    const { error } = await supabase.from('plantillas_difusion').update({ activa: nueva, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', activa: nueva });
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no válida' });
}
