/**
 * POST /api/auth/verificar-otp
 *
 * Verifica el codigo OTP contra la tabla otp_codes en Supabase.
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
    // 1. Buscar codigo valido en la base de datos
    const { data: otpRecord, error: errOtp } = await supabase
      .from('otp_codes')
      .select('id, codigo, expires_at')
      .eq('telefono', telefonoLimpio)
      .eq('codigo', codigo)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (errOtp || !otpRecord) {
      return res.status(401).json({ error: 'Codigo incorrecto. Verifica bien los 6 digitos.' });
    }

    // 2. Verificar que no haya expirado
    if (new Date(otpRecord.expires_at) < new Date()) {
      // Marcar como usado para que no se pueda reutilizar
      await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);
      return res.status(401).json({ error: 'El codigo expiro. Vuelve atras y pide uno nuevo.' });
    }

    // 3. Marcar codigo como usado
    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

    // 4. Generar token de sesion
    const token = crypto.randomUUID();

    // 5. Crear sesion
    const { error: errSesion } = await supabase
      .from('sesiones_app')
      .insert({
        token,
        telefono: telefonoLimpio,
        dispositivo: dispositivo || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

    if (errSesion) throw errSesion;

    // 6. Traer datos del cliente
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
