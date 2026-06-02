/**
 * Respuestas rápidas de la bandeja (compartidas por línea). Un endpoint con
 * varias acciones:
 *   listar   → respuestas de la línea
 *   crear    → { titulo, texto }
 *   editar   → { id, titulo, texto }
 *   eliminar → { id }
 *
 * Recibe (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

const MAX_TITULO = 60;
const MAX_TEXTO = 4096; // límite de texto de WhatsApp

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    if (accion === 'listar') {
      const { data } = await supabase
        .from('respuestas_rapidas')
        .select('id, titulo, texto')
        .eq('linea_id', linea_id)
        .order('titulo', { ascending: true });
      return res.status(200).json({ status: 'ok', respuestas: data || [] });
    }

    if (accion === 'crear') {
      const titulo = String(req.body.titulo || '').trim().slice(0, MAX_TITULO);
      const texto = String(req.body.texto || '').trim().slice(0, MAX_TEXTO);
      if (!titulo || !texto) return res.status(200).json({ status: 'error', mensaje: 'Faltan el título y el mensaje.' });
      const { data, error } = await supabaseAdmin
        .from('respuestas_rapidas')
        .insert({ linea_id, titulo, texto })
        .select('id, titulo, texto')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', respuesta: data });
    }

    if (accion === 'editar') {
      const { id } = req.body;
      const titulo = String(req.body.titulo || '').trim().slice(0, MAX_TITULO);
      const texto = String(req.body.texto || '').trim().slice(0, MAX_TEXTO);
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la respuesta a editar.' });
      if (!titulo || !texto) return res.status(200).json({ status: 'error', mensaje: 'Faltan el título y el mensaje.' });
      const { data, error } = await supabaseAdmin
        .from('respuestas_rapidas')
        .update({ titulo, texto })
        .eq('id', id)
        .eq('linea_id', linea_id)
        .select('id, titulo, texto')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', respuesta: data });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la respuesta a eliminar.' });
      await supabaseAdmin.from('respuestas_rapidas').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
