/**
 * Devuelve todos los mensajes de una conversación (un chat) para la bandeja.
 *
 * Al abrir el chat, también marca la conversación como leída (no_leidos = 0).
 * Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, telefono }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono, linea_id } = req.body || {};
  if (!validarAsesor(contrasena)) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono.' });
  }

  let query = supabase
    .from('mensajes_whatsapp')
    .select('id, direccion, tipo, texto, media_id, estado_envio, error, timestamp_wa, created_at')
    .eq('telefono', telefono)
    .order('created_at', { ascending: true })
    .limit(500);
  if (linea_id) query = query.eq('linea_id', linea_id);

  const { data, error } = await query;
  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Marcar la conversación como leída (no rompemos si falla)
  let upd = supabaseAdmin.from('conversaciones_whatsapp').update({ no_leidos: 0 }).eq('telefono', telefono);
  if (linea_id) upd = upd.eq('linea_id', linea_id);
  await upd;

  return res.status(200).json({ status: 'ok', mensajes: data || [] });
}
