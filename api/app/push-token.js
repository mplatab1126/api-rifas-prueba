/**
 * POST /api/app/push-token
 *
 * Registra o actualiza el token de notificaciones push del dispositivo.
 * Esto permite enviar notificaciones al cliente (recordatorios de pago,
 * resultados de sorteos, etc).
 *
 * Body: { push_token: "ExponentPushToken[...]" }
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

  const { push_token } = req.body;
  if (!push_token) {
    return res.status(400).json({ error: 'Falta el push_token' });
  }

  try {
    const { error } = await supabase
      .from('sesiones_app')
      .update({ push_token: String(push_token).trim() })
      .eq('token', sesion.token);

    if (error) throw error;

    res.status(200).json({ registrado: true });

  } catch (error) {
    console.error('Error en push-token:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
