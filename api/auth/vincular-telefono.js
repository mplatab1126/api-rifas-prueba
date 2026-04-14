/**
 * POST /api/auth/vincular-telefono
 *
 * Vincula un telefono a una cuenta social (Google/Facebook).
 * Se usa la primera vez que un usuario entra con login social.
 *
 * Flujo:
 * 1. El usuario ya hizo social login (tiene su social_id)
 * 2. Ingresa su telefono
 * 3. Recibe OTP por WhatsApp
 * 4. Verifica el OTP
 * 5. Se vincula el telefono a la cuenta social
 * 6. Se crea sesion
 *
 * Body: { proveedor: 'google'|'facebook', id_social: '...', telefono: '...', codigo: '...', dispositivo: '...' }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { proveedor, id_social, telefono, codigo, dispositivo } = req.body;

  if (!proveedor || !id_social || !telefono || !codigo) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const telefonoLimpio = limpiarTelefono(telefono);

  try {
    // 1. Verificar que el OTP sea valido
    const { data: otp, error: errOtp } = await supabase
      .from('otp_codes')
      .select('id, expires_at')
      .eq('telefono', telefonoLimpio)
      .eq('codigo', codigo)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (errOtp || !otp) {
      return res.status(401).json({ error: 'Codigo incorrecto o expirado' });
    }

    if (new Date(otp.expires_at) < new Date()) {
      return res.status(401).json({ error: 'El codigo ha expirado. Solicita uno nuevo.' });
    }

    // 2. Marcar OTP como usado
    await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

    // 3. Vincular telefono a la cuenta social
    const { error: errUpdate } = await supabase
      .from('cuentas_sociales')
      .update({ telefono: telefonoLimpio })
      .eq('proveedor', proveedor)
      .eq('id_social', id_social);

    if (errUpdate) throw errUpdate;

    // 4. Crear sesion
    const token = crypto.randomUUID();

    await supabase
      .from('sesiones_app')
      .insert({
        token,
        telefono: telefonoLimpio,
        dispositivo: dispositivo || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

    // 5. Traer datos del cliente
    const last10 = telefonoLimpio.slice(-10);
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, ciudad')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    // Traer foto de la cuenta social
    const { data: social } = await supabase
      .from('cuentas_sociales')
      .select('foto, nombre')
      .eq('proveedor', proveedor)
      .eq('id_social', id_social)
      .single();

    res.status(200).json({
      token,
      cliente: {
        nombre: cliente?.nombre || social?.nombre || 'Cliente',
        telefono: telefonoLimpio,
        ciudad: cliente?.ciudad || '',
        foto: social?.foto || '',
      },
    });

  } catch (error) {
    console.error('Error en vincular-telefono:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
