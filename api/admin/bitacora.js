import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { contrasena, accion, titulo, categoria, contenido, autor, api_key } = req.body;

  const esApiExterna = api_key === process.env.CRON_SECRET;

  if (!esApiExterna) {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
        const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
        const nombre = (asesores[contrasena] || '').toLowerCase().trim();
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
        const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
        const nombre = (asesores[contrasena] || '').toLowerCase().trim();
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
