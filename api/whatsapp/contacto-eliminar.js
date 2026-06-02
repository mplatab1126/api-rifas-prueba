/**
 * Elimina un contacto de la bandeja: borra su CONVERSACIÓN y TODOS sus mensajes
 * (de esa línea). Por las llaves en cascada, al borrar la conversación se borran
 * también sus etiquetas. Además borramos los mensajes por teléfono+línea por si
 * quedara alguno suelto.
 *
 * NO toca clientes, boletas, abonos ni transferencias: son tablas aparte, sin
 * ninguna relación con la conversación. Las ventas y pagos del cliente quedan
 * intactos.
 *
 * Recibe (POST, JSON): { contrasena, telefono, linea_id }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, telefono, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    const tel = String(telefono).trim();
    // 1) Borrar los mensajes de este contacto en esta línea (incluye cualquier huérfano).
    await supabaseAdmin.from('mensajes_whatsapp').delete().eq('telefono', tel).eq('linea_id', linea_id);
    // 2) Borrar la conversación → en cascada borra sus etiquetas (y mensajes restantes).
    const { error } = await supabaseAdmin.from('conversaciones_whatsapp').delete().eq('telefono', tel).eq('linea_id', linea_id);
    if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
