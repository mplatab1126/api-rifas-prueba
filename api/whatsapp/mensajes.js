/**
 * Devuelve todos los mensajes de una conversación (un chat) para la bandeja.
 *
 * Al abrir el chat, también marca la conversación como leída (no_leidos = 0).
 * Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, telefono }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono.' });
  }
  if (linea_id && !(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  let query = supabase
    .from('mensajes_whatsapp')
    .select('id, direccion, tipo, texto, media_id, media_url, estado_envio, error, timestamp_wa, created_at, wa_message_id, responde_a, raw')
    .eq('telefono', telefono)
    .order('created_at', { ascending: false })   // traer los 500 MÁS RECIENTES (no los más viejos)
    .limit(500);
  if (linea_id) query = query.eq('linea_id', linea_id);

  const { data, error } = await query;
  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Marcar cuáles mensajes los envió el AGENTE (raw.agente=true) vs un humano, para mostrarlo
  // en el chat. No mandamos el `raw` completo al navegador (puede ser grande): solo el flag.
  const mensajes = (data || []).reverse().map(m => {   // revertir: de recientes→viejos a orden cronológico
    const por_agente = !!(m.raw && m.raw.agente === true);
    // predefinido = el agente lo mandó por un atajo SIN IA (saludo/premios/números/datos);
    // la bandeja lo rotula "Mensaje predefinido" en vez de "🤖 Liliana".
    const predefinido = !!(m.raw && m.raw.predefinido === true);
    // pago_asignado = esta foto de comprobante ya se usó para un abono (boleta + monto).
    // La bandeja muestra un chip verde "✅ Pago asignado a la boleta NNNN" encima de la foto.
    const pago_asignado = (m.raw && m.raw.pago_asignado) || null;
    const { raw, ...resto } = m;
    return { ...resto, por_agente, predefinido, pago_asignado };
  });

  // Marcar la conversación como leída (no rompemos si falla)
  let upd = supabaseAdmin.from('conversaciones_whatsapp').update({ no_leidos: 0 }).eq('telefono', telefono);
  if (linea_id) upd = upd.eq('linea_id', linea_id);
  await upd;

  return res.status(200).json({ status: 'ok', mensajes });
}
