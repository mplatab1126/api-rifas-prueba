import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { contrasena, accion, titulo, categoria, contenido, autor, api_key } = req.body;

  const esApiExterna = api_key === process.env.CRON_SECRET;

  if (!esApiExterna) {
    if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  try {
    if (accion === 'listar') {
      const { data, error } = await supabase
        .from('bitacora')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.status(200).json({ status: 'ok', entradas: data });
    }

    if (accion === 'crear') {
      if (!titulo || !contenido || !categoria) {
        return res.status(400).json({ status: 'error', mensaje: 'Faltan campos: titulo, categoria, contenido' });
      }
      const { data, error } = await supabase
        .from('bitacora')
        .insert([{ titulo, categoria, contenido, autor: autor || 'Sistema' }])
        .select();
      if (error) throw error;
      return res.status(200).json({ status: 'ok', entrada: data[0] });
    }

    if (accion === 'editar') {
      if (!esApiExterna) {
        const nombre = (validarAsesor(contrasena) || '').toLowerCase().trim();
        if (!['mateo'].includes(nombre)) {
          return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede editar entradas' });
        }
      }
      const { id } = req.body;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta id' });
      const updates = {};
      if (titulo) updates.titulo = titulo;
      if (contenido) updates.contenido = contenido;
      if (categoria) updates.categoria = categoria;
      const { data, error } = await supabase.from('bitacora').update(updates).eq('id', id).select();
      if (error) throw error;
      return res.status(200).json({ status: 'ok', entrada: data[0] });
    }

    if (accion === 'eliminar') {
      if (!esApiExterna) {
        const nombre = (validarAsesor(contrasena) || '').toLowerCase().trim();
        if (!['mateo'].includes(nombre)) {
          return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede eliminar entradas' });
        }
      }
      const { id } = req.body;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta id' });
      const { error } = await supabase.from('bitacora').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no válida' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
