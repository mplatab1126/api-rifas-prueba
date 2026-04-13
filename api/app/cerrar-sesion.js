/**
 * POST /api/app/cerrar-sesion
 *
 * Cierra la sesion actual del cliente (desactiva el token).
 * Requiere token de sesion en Authorization header.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  try {
    // Desactivar el token actual
    const { error } = await supabase
      .from('sesiones_app')
      .update({ activa: false })
      .eq('token', sesion.token);

    if (error) throw error;

    res.status(200).json({ cerrada: true });

  } catch (error) {
    console.error('Error en cerrar-sesion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
