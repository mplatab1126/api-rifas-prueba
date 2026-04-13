/**
 * GET /api/app/perfil — Ver datos del cliente autenticado
 * PUT /api/app/perfil — Actualizar nombre, apellido o ciudad
 *
 * Requiere token de sesion en Authorization header.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,PUT,OPTIONS', 'Content-Type, Authorization')) return;

  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const last10 = sesion.telefono.slice(-10);

  if (req.method === 'GET') {
    return await obtenerPerfil(res, last10);
  }

  if (req.method === 'PUT') {
    return await actualizarPerfil(req, res, last10);
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}

async function obtenerPerfil(res, last10) {
  try {
    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('nombre, apellido, ciudad, telefono, total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    if (error || !cliente) {
      return res.status(404).json({ error: 'No se encontraron datos del cliente' });
    }

    res.status(200).json({
      perfil: {
        nombre: cliente.nombre || '',
        apellido: cliente.apellido || '',
        ciudad: cliente.ciudad || '',
        telefono: cliente.telefono || '',
        total_comprado: Number(cliente.total_comprado || 0),
        boletas_principales: Number(cliente.boletas_grandes_compradas || 0),
        boletas_diarias: Number(cliente.boletas_diarias_compradas || 0),
      },
    });

  } catch (error) {
    console.error('Error en perfil GET:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function actualizarPerfil(req, res, last10) {
  try {
    const { nombre, apellido, ciudad } = req.body;

    // Solo permitir actualizar estos campos
    const updates = {};
    if (nombre !== undefined) updates.nombre = String(nombre).trim().slice(0, 100);
    if (apellido !== undefined) updates.apellido = String(apellido).trim().slice(0, 100);
    if (ciudad !== undefined) updates.ciudad = String(ciudad).trim().slice(0, 100);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    const { error } = await supabase
      .from('clientes')
      .update(updates)
      .like('telefono', '%' + last10);

    if (error) throw error;

    res.status(200).json({ actualizado: true, campos: Object.keys(updates) });

  } catch (error) {
    console.error('Error en perfil PUT:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
