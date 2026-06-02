/**
 * ENVIAR un mensaje de texto por WhatsApp desde nuestro sistema.
 *
 * Lo usará la bandeja de asesores (y sirve para las pruebas iniciales).
 * Manda el mensaje por la API de Meta y además lo GUARDA en el buzón, para
 * que quede en el historial del chat igual que los entrantes.
 *
 * Protegido con contraseña de asesor (igual que el resto del panel).
 *
 * Recibe (POST, JSON):
 *   { contrasena, telefono, texto }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { enviarTexto } from '../lib/whatsapp.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono, texto, linea_id } = req.body || {};
  const asesor = validarAsesor(contrasena);
  if (!asesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono || !texto) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan teléfono o texto.' });
  }
  if (linea_id && !(await puedeVerLinea(asesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  // 1) Mandar por la API de Meta, usando el token/número de ESA línea
  const r = await enviarTexto(String(telefono).trim(), texto, linea_id);
  if (!r.ok) {
    return res.status(200).json({ status: 'error', mensaje: r.error });
  }

  // 2) Guardar el saliente en el buzón
  const ts = new Date().toISOString();
  const conversacion_id = await asegurarConversacion(telefono, texto, ts, asesor, linea_id);

  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id,
    telefono,
    linea_id: linea_id || null,
    direccion: 'saliente',
    tipo: 'text',
    texto,
    wa_message_id: r.wa_message_id,
    estado_envio: 'enviado',
    timestamp_wa: ts,
    raw: r.raw,
  });

  return res.status(200).json({ status: 'ok', wa_message_id: r.wa_message_id });
}

// Crea la conversación si no existe, o le actualiza la vista previa. Devuelve su id.
async function asegurarConversacion(telefono, texto, ts, asesor, lineaId) {
  const preview = texto.slice(0, 200);

  let busqueda = supabaseAdmin
    .from('conversaciones_whatsapp')
    .select('id')
    .eq('telefono', telefono);
  busqueda = lineaId ? busqueda.eq('linea_id', lineaId) : busqueda.is('linea_id', null);
  const { data: existente } = await busqueda.maybeSingle();

  if (existente) {
    await supabaseAdmin
      .from('conversaciones_whatsapp')
      .update({ ultimo_mensaje: preview, ultimo_at: ts, ultimo_entrante: false })
      .eq('id', existente.id);
    return existente.id;
  }

  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert({
      telefono,
      linea_id: lineaId || null,
      ultimo_mensaje: preview,
      ultimo_at: ts,
      ultimo_entrante: false,
      estado: 'humano',
      asesor_asignado: asesor,
    })
    .select('id')
    .single();
  return nueva?.id || null;
}
