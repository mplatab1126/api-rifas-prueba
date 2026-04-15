/**
 * POST /api/auth/verificar-otp
 *
 * Verifica el codigo OTP usando Twilio Verify.
 * Si es correcto, crea una sesion y devuelve un token.
 *
 * Body: { telefono: "3101234567", codigo: "123456" }
 * Responde: { token: "uuid-token", cliente: { nombre, telefono, ciudad } }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const { telefono, codigo, dispositivo } = req.body;
  if (!telefono || !codigo) {
    return res.status(400).json({ error: 'Faltan telefono y codigo' });
  }

  const telefonoLimpio = limpiarTelefono(telefono);

  try {
    // 1. Verificar codigo con Twilio Verify
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SID;

    const checkResp = await fetch(
      `https://verify.twilio.com/v2/Services/${verifySid}/VerificationChecks`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: '+' + telefonoLimpio,
          Code: codigo,
        }),
      }
    );

    const checkData = await checkResp.json();

    if (!checkResp.ok || checkData.status !== 'approved') {
      console.error('Twilio Verify check fallido:', JSON.stringify({
        httpStatus: checkResp.status,
        twilioStatus: checkData.status,
        twilioCode: checkData.code,
        twilioMessage: checkData.message,
        to: '+' + telefonoLimpio,
      }));
      // 20404 = verificacion no encontrada (expiro o se cancelo por demasiados intentos)
      if (checkData.code === 20404) {
        return res.status(401).json({ error: 'El codigo expiro o fue cancelado. Vuelve atras y pide un codigo nuevo.' });
      }
      return res.status(401).json({ error: 'Codigo incorrecto. Verifica bien los 6 digitos.' });
    }

    // 2. Generar token de sesion
    const token = crypto.randomUUID();

    // 3. Crear sesion
    const { error: errSesion } = await supabase
      .from('sesiones_app')
      .insert({
        token,
        telefono: telefonoLimpio,
        dispositivo: dispositivo || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

    if (errSesion) throw errSesion;

    // 4. Traer datos del cliente
    const last10 = telefonoLimpio.slice(-10);
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, ciudad, telefono')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    res.status(200).json({
      token,
      cliente: {
        nombre: cliente?.nombre || 'Cliente',
        telefono: telefonoLimpio,
        ciudad: cliente?.ciudad || '',
      },
    });

  } catch (error) {
    console.error('Error en verificar-otp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
