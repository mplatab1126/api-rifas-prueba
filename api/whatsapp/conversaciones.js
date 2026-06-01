/**
 * Lista las conversaciones del buzón de WhatsApp para la bandeja de asesores.
 *
 * Devuelve los chats ordenados por el más reciente, con su vista previa y
 * cuántos mensajes sin leer tienen. Protegido con contraseña de asesor.
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
    .from('conversaciones_whatsapp')
    .select('id, telefono, nombre_perfil, ultimo_mensaje, ultimo_at, no_leidos, estado, asesor_asignado, ventana_vence_at')
    .order('ultimo_at', { ascending: false, nullsFirst: false })
    .limit(300);

  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  return res.status(200).json({ status: 'ok', conversaciones: data || [] });
}
