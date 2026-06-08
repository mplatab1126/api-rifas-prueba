/**
 * Marca una conversación como "respondida" SIN tener que escribirle al cliente.
 *
 * El filtro "sin respuesta" de la bandeja se basa en `ultimo_entrante = true` (el último
 * mensaje fue del cliente). Para sacar el chat de "sin respuesta" ponemos `ultimo_entrante`
 * en false y limpiamos el contador de no leídos. Si el cliente vuelve a escribir, el webhook
 * (recibir.js) lo marca entrante de nuevo y reaparece como sin respuesta (lo correcto).
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
  if (!telefono || !linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono o la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  const { error } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .update({ ultimo_entrante: false, no_leidos: 0 })
    .eq('telefono', telefono)
    .eq('linea_id', linea_id);
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  return res.status(200).json({ status: 'ok' });
}
