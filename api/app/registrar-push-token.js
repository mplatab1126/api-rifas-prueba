/**
 * POST /api/app/registrar-push-token
 *
 * Guarda el token de push notifications (Expo) del dispositivo del cliente.
 * Se llama automaticamente despues del login.
 *
 * Body: { push_token: "ExponentPushToken[xxxxx]" }
 * Requiere: Authorization: Bearer {token}
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const sesion = await validarSesionApp(req);
  if (!sesion) return res.status(401).json({ error: 'Sesion invalida' });

  const { push_token } = req.body;
  if (!push_token) return res.status(400).json({ error: 'Falta push_token' });

  try {
    const { error } = await supabase
      .from('sesiones_app')
      .update({ push_token })
      .eq('token', sesion.token);

    if (error) throw error;

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error registrando push token:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}
