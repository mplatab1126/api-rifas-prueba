/**
 * POST /api/auth/social-login
 *
 * Maneja login con Google o Facebook.
 *
 * Flujo:
 * 1. App envia el token del proveedor (Google/Facebook)
 * 2. Backend verifica el token con el proveedor
 * 3. Si el usuario ya tiene un telefono vinculado → crea sesion directa
 * 4. Si NO tiene telefono vinculado → responde con necesita_telefono: true
 *
 * Body: { proveedor: 'google'|'facebook', token_proveedor: '...', dispositivo: 'ios'|'android' }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { proveedor, token_proveedor, dispositivo } = req.body;

  if (!proveedor || !token_proveedor) {
    return res.status(400).json({ error: 'Faltan proveedor y token' });
  }

  try {
    // 1. Verificar token con el proveedor y obtener datos del usuario
    let socialUser;

    if (proveedor === 'google') {
      const resp = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${token_proveedor}` },
      });
      if (!resp.ok) return res.status(401).json({ error: 'Token de Google invalido' });
      const data = await resp.json();
      socialUser = {
        id: data.sub,
        email: data.email,
        nombre: data.name || data.given_name || '',
        foto: data.picture || '',
      };
    } else if (proveedor === 'facebook') {
      const resp = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${token_proveedor}`
      );
      if (!resp.ok) return res.status(401).json({ error: 'Token de Facebook invalido' });
      const data = await resp.json();
      socialUser = {
        id: data.id,
        email: data.email || '',
        nombre: data.name || '',
        foto: data.picture?.data?.url || '',
      };
    } else {
      return res.status(400).json({ error: 'Proveedor no soportado' });
    }

    // 2. Buscar si ya existe una cuenta social vinculada
    const { data: cuenta, error: errCuenta } = await supabase
      .from('cuentas_sociales')
      .select('telefono')
      .eq('proveedor', proveedor)
      .eq('id_social', socialUser.id)
      .single();

    // Si no tiene telefono vinculado, pedir que lo vincule
    if (errCuenta || !cuenta || !cuenta.telefono) {
      // Guardar/actualizar la cuenta social sin telefono
      await supabase
        .from('cuentas_sociales')
        .upsert({
          proveedor,
          id_social: socialUser.id,
          email: socialUser.email,
          nombre: socialUser.nombre,
          foto: socialUser.foto,
        }, { onConflict: 'proveedor,id_social' });

      return res.status(200).json({
        necesita_telefono: true,
        social_id: socialUser.id,
        nombre: socialUser.nombre,
        email: socialUser.email,
        foto: socialUser.foto,
      });
    }

    // 3. Tiene telefono vinculado — crear sesion directa
    const token = crypto.randomUUID();

    await supabase
      .from('sesiones_app')
      .insert({
        token,
        telefono: cuenta.telefono,
        dispositivo: dispositivo || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

    // Traer nombre del cliente
    const last10 = cuenta.telefono.slice(-10);
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, ciudad')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    res.status(200).json({
      necesita_telefono: false,
      token,
      cliente: {
        nombre: cliente?.nombre || socialUser.nombre,
        telefono: cuenta.telefono,
        ciudad: cliente?.ciudad || '',
        foto: socialUser.foto,
      },
    });

  } catch (error) {
    console.error('Error en social-login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
