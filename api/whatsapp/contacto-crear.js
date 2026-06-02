/**
 * Crea (o actualiza) un contacto en una línea. Un contacto = una fila en
 * conversaciones_whatsapp (sin mensajes todavía).
 *
 * Recibe (POST, JSON): { contrasena, linea_id, nombre, telefono, correo }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

// Normaliza a formato wa_id (57 + 10 para celulares colombianos)
export function normalizarTel(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = '57' + d;
  return d;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, nombre, telefono, correo } = req.body || {};
  const asesor = validarAsesor(contrasena);
  if (!asesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (linea_id && !(await puedeVerLinea(asesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  const tel = normalizarTel(telefono);
  if (!tel || tel.length < 7) {
    return res.status(400).json({ status: 'error', mensaje: 'El teléfono no es válido.' });
  }
  const correoLimpio = correo ? String(correo).trim() : null;
  if (correoLimpio && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoLimpio)) {
    return res.status(400).json({ status: 'error', mensaje: 'El correo no tiene un formato válido.' });
  }

  const payload = {
    telefono: tel,
    linea_id: linea_id || null,
    nombre_perfil: (nombre && String(nombre).trim()) || null,
    correo: correoLimpio,
  };

  const { error } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .upsert(payload, { onConflict: 'linea_id,telefono' });

  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
  return res.status(200).json({ status: 'ok' });
}
