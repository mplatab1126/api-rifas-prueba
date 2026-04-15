/**
 * POST /api/auth/enviar-otp
 *
 * Genera un codigo de 6 digitos, lo guarda en la tabla otp_codes
 * y lo envia por SMS al cliente usando Twilio.
 *
 * El cliente debe tener al menos una boleta comprada.
 *
 * Body: { telefono: "3101234567" }
 * Responde: { enviado: true }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

// Generar codigo aleatorio de 6 digitos
function generarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

    // 2. Rate limit: maximo 3 codigos por telefono en los ultimos 10 minutos
    const { count } = await supabase
      .from('otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('telefono', telefonoLimpio)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (count >= 3) {
      return res.status(429).json({
        error: 'Demasiados intentos. Espera 10 minutos antes de pedir otro codigo.'
      });
    }

    // 3. Invalidar codigos anteriores no usados para este telefono
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('telefono', telefonoLimpio)
      .eq('used', false);

    // 4. Generar y guardar nuevo codigo (expira en 10 minutos)
    const codigo = generarCodigo();

    const { error: errInsert } = await supabase
      .from('otp_codes')
      .insert({
        telefono: telefonoLimpio,
        codigo,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (errInsert) throw errInsert;

    // 5. Enviar SMS con Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const smsFrom = process.env.TWILIO_SMS_FROM || '+19189181157';

    if (!accountSid || !authToken) {
      console.error('Faltan credenciales de Twilio');
      return res.status(500).json({ error: 'Error de configuracion del servidor' });
    }

    const smsResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: smsFrom,
          To: '+' + telefonoLimpio,
          Body: `Tu codigo de verificacion para Los Plata es: ${codigo}. Expira en 10 minutos.`,
        }),
      }
    );

    const smsData = await smsResp.json();

    if (!smsResp.ok) {
      console.error('Error enviando SMS:', JSON.stringify(smsData));
      // Borrar el codigo si el SMS fallo
      await supabase.from('otp_codes').delete().eq('telefono', telefonoLimpio).eq('codigo', codigo);
      return res.status(500).json({ error: 'No pudimos enviar el codigo por SMS. Intenta de nuevo.' });
    }

    res.status(200).json({ enviado: true });

  } catch (error) {
    console.error('Error en enviar-otp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
