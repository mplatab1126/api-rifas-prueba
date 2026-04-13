/**
 * POST /api/auth/enviar-otp
 *
 * Genera un codigo OTP de 6 digitos y lo envia al cliente por WhatsApp.
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

    // Si no tiene boletas de 4 cifras, buscar en diarias
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

    // 2. Rate limit: maximo 3 OTPs en los ultimos 10 minutos
    const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: errCount } = await supabase
      .from('otp_codes')
      .select('*', { count: 'exact', head: true })
      .eq('telefono', telefonoLimpio)
      .gte('created_at', hace10min);

    if (errCount) throw errCount;

    if (count >= 3) {
      return res.status(429).json({
        error: 'Demasiados intentos. Espera 10 minutos antes de solicitar otro codigo.'
      });
    }

    // 3. Generar codigo de 6 digitos
    const codigo = String(Math.floor(100000 + Math.random() * 900000));

    // 4. Guardar en base de datos
    const { error: errInsert } = await supabase
      .from('otp_codes')
      .insert({
        telefono: telefonoLimpio,
        codigo,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

    if (errInsert) throw errInsert;

    // 5. Enviar por WhatsApp usando ChateaPro
    const TOKEN = process.env.CHATEA_TOKEN_LINEA_1;
    const mensaje = `🔐 Tu codigo de verificacion para la app Los Plata es: *${codigo}*\n\nEste codigo expira en 5 minutos. No lo compartas con nadie.`;

    // Primero buscar el suscriptor por telefono en ChateaPro
    const buscarResp = await fetch(
      `https://chateapro.app/api/subscribers?phone=${telefonoLimpio}&limit=1`,
      { headers: { accept: 'application/json', Authorization: `Bearer ${TOKEN}` } }
    );
    const buscarData = await buscarResp.json();

    let enviado = false;

    if (buscarData.data && buscarData.data.length > 0) {
      // Suscriptor existe en ChateaPro - enviar mensaje directo
      const userNs = buscarData.data[0].user_ns;
      const enviarResp = await fetch('https://chateapro.app/api/subscriber/send-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          user_ns: userNs,
          text: mensaje,
        }),
      });
      enviado = enviarResp.ok;
    }

    // Fallback: enviar por Twilio SMS si WhatsApp fallo
    if (!enviado && process.env.TWILIO_ACCOUNT_SID) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;
      const to = '+' + telefonoLimpio;

      const smsResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: from,
            To: to,
            Body: `Tu codigo Los Plata: ${codigo}. Expira en 5 minutos.`,
          }),
        }
      );
      enviado = smsResp.ok;
    }

    if (!enviado) {
      // Si ni WhatsApp ni SMS funcionaron, logear pero no bloquear
      // (el codigo queda en la base de datos y se puede verificar)
      console.error('No se pudo enviar OTP por ningun canal a:', telefonoLimpio);
    }

    res.status(200).json({ enviado: true });

  } catch (error) {
    console.error('Error en enviar-otp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
