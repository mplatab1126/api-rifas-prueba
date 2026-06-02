/**
 * Lista las líneas de WhatsApp activas (para el selector de la bandeja).
 * NO devuelve los tokens (son secretos), solo nombre e identificador.
 *
 * Recibe (POST, JSON): { contrasena }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena } = req.body || {};
  if (!validarAsesor(contrasena)) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }

  const { data, error } = await supabase
    .from('lineas_whatsapp')
    .select('phone_number_id, nombre')
    .eq('activa', true)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  return res.status(200).json({ status: 'ok', lineas: data || [] });
}
