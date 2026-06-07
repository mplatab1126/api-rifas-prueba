/**
 * Recordatorios PENDIENTES de un chat (para la bandeja).
 *
 * Devuelve los recordatorios que el agente (Liliana) dejó programados para
 * volver a escribirle a un cliente y que todavía NO se han enviado. Sirve para
 * que el asesor vea, desde el chat, cuándo se le volverá a escribir y por qué
 * (el "motivo" que guardó el agente). Solo lectura; protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, linea_id, telefono }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, linea_id, telefono } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!linea_id || !telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta la línea o el teléfono.' });
  }

  const { data, error } = await supabaseAdmin
    .from('recordatorios')
    .select('id, motivo, programado_para, estado')
    .eq('linea_id', linea_id)
    .eq('telefono', telefono)
    .eq('estado', 'pendiente')
    .order('programado_para', { ascending: true });

  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  return res.status(200).json({ status: 'ok', recordatorios: data || [] });
}
