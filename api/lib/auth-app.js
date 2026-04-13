/**
 * Middleware de autenticacion para la app movil.
 *
 * Los clientes de la app se autentican con un token de sesion.
 * El token se envia en el header Authorization: Bearer {token}
 * y se valida contra la tabla sesiones_app en Supabase.
 *
 * Uso:
 *
 *   import { validarSesionApp } from '../lib/auth-app.js';
 *
 *   const sesion = await validarSesionApp(req);
 *   if (!sesion) return res.status(401).json({ error: 'Sesion invalida' });
 *   // sesion.telefono, sesion.nombre, sesion.token
 *
 * @param {object} req - Request de Vercel
 * @returns {object|null} Datos de la sesion o null si es invalida
 */

import { supabase } from './supabase.js';

export async function validarSesionApp(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const { data: sesion, error } = await supabase
    .from('sesiones_app')
    .select('telefono, activa, expires_at')
    .eq('token', token)
    .eq('activa', true)
    .single();

  if (error || !sesion) return null;

  // Verificar que no haya expirado
  if (new Date(sesion.expires_at) < new Date()) return null;

  // Traer nombre del cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre')
    .like('telefono', '%' + sesion.telefono.slice(-10))
    .limit(1)
    .single();

  return {
    telefono: sesion.telefono,
    nombre: cliente?.nombre || 'Cliente',
    token,
  };
}
