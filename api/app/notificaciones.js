/**
 * GET /api/app/notificaciones — Lista las notificaciones del cliente
 * POST /api/app/notificaciones — Marcar notificaciones como leidas
 *
 * Tipos de notificaciones:
 *   - pago_registrado: Se registro un abono en tu boleta
 *   - sorteo_resultado: Resultado de un sorteo
 *   - recordatorio_pago: Tienes saldo pendiente
 *   - rifa_nueva: Nueva rifa disponible
 *   - boleta_pagada: Tu boleta quedo 100% pagada
 *   - sistema: Mensajes generales del sistema
 *
 * Requiere token de sesion en Authorization header.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,POST,OPTIONS', 'Content-Type, Authorization')) return;

  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  if (req.method === 'GET') {
    return await listarNotificaciones(req, res, sesion);
  }

  if (req.method === 'POST') {
    return await marcarLeidas(req, res, sesion);
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}

async function listarNotificaciones(req, res, sesion) {
  const limite = Math.min(Number(req.query.limite) || 30, 100);
  const soloNoLeidas = req.query.no_leidas === 'true';

  try {
    let query = supabase
      .from('notificaciones_app')
      .select('id, tipo, titulo, mensaje, datos, leida, created_at')
      .eq('telefono', sesion.telefono)
      .order('created_at', { ascending: false })
      .limit(limite);

    if (soloNoLeidas) {
      query = query.eq('leida', false);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Contar no leidas
    const { count } = await supabase
      .from('notificaciones_app')
      .select('*', { count: 'exact', head: true })
      .eq('telefono', sesion.telefono)
      .eq('leida', false);

    res.status(200).json({
      notificaciones: (data || []).map(n => ({
        id: n.id,
        tipo: n.tipo,
        titulo: n.titulo,
        mensaje: n.mensaje,
        datos: n.datos || null,
        leida: n.leida,
        fecha: n.created_at,
      })),
      no_leidas: count || 0,
    });

  } catch (error) {
    console.error('Error en notificaciones GET:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function marcarLeidas(req, res, sesion) {
  const { ids, todas } = req.body;

  try {
    if (todas === true) {
      // Marcar todas como leidas
      const { error } = await supabase
        .from('notificaciones_app')
        .update({ leida: true })
        .eq('telefono', sesion.telefono)
        .eq('leida', false);

      if (error) throw error;
      return res.status(200).json({ marcadas: true, todas: true });
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Marcar especificas como leidas
      const { error } = await supabase
        .from('notificaciones_app')
        .update({ leida: true })
        .eq('telefono', sesion.telefono)
        .in('id', ids);

      if (error) throw error;
      return res.status(200).json({ marcadas: true, cantidad: ids.length });
    }

    return res.status(400).json({ error: 'Envia ids (array) o todas: true' });

  } catch (error) {
    console.error('Error en notificaciones POST:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
