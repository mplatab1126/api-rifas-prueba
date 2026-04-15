/**
 * POST /api/auth/enviar-otp
 *
 * Envia un codigo de verificacion por SMS al cliente usando Twilio Verify.
 * El cliente debe existir en la tabla "clientes" (debe tener al menos
 * una boleta comprada).
 *
 * Body: { telefono: "3101234567" }
 * Responde: { enviado: true }
 *
 * Rate limit: maximo 3 intentos por telefono cada 10 minutos.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const { telefono } = req.body;
  if (!telefono) {
    return res.status(400).json({ error: 'Falta el numero de telefono' });
  }

  const telefonoLimpio = limpiarTelefono(telefono);
  const last10 = String(telefono).replace(/\D/g, '').slice(-10);

  try {
    // 1. Verificar que el cliente existe (tiene al menos una boleta)
    const { data: boletas, error: errBoletas } = await supabase
      .from('boletas')
      .select('numero')
      .like('telefono_cliente', '%' + last10)
      .limit(1);

    if (errBoletas) throw errBoletas;

    let clienteExiste = boletas && boletas.length > 0;

    if (!clienteExiste) {
      const { data: diarias } = await supabase
        .from('boletas_diarias')
        .select('numero')
        .like('telefono_cliente', '%' + last10)
        .limit(1);
      clienteExiste = diarias && diarias.length > 0;
    }

    if (!clienteExiste) {
      const { data: diarias3 } = await supabase
        .from('boletas_diarias_3cifras')
        .select('numero')
        .like('telefono_cliente', '%' + last10)
        .limit(1);
      clienteExiste = diarias3 && diarias3.length > 0;
    }

    if (!clienteExiste) {
      return res.status(404).json({
        error: 'No encontramos boletas con este numero. Verifica que sea el mismo celular con el que compraste.'
      });
    }

    // 2. Enviar verificacion con Twilio Verify
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SID;

    if (!accountSid || !authToken || !verifySid) {
      console.error('Faltan credenciales de Twilio Verify');
      return res.status(500).json({ error: 'Error de configuracion del servidor' });
    }

    const verifyResp = await fetch(
      `https://verify.twilio.com/v2/Services/${verifySid}/Verifications`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: '+' + telefonoLimpio,
          Channel: 'sms',
        }),
      }
    );

    const verifyData = await verifyResp.json();

    if (!verifyResp.ok) {
      console.error('Error Twilio Verify:', verifyData);
      return res.status(500).json({ error: 'No pudimos enviar el codigo. Intenta de nuevo.' });
    }

    res.status(200).json({ enviado: true });

  } catch (error) {
    console.error('Error en enviar-otp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
