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

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono, texto } = req.body || {};
  const asesor = validarAsesor(contrasena);
  if (!asesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono || !texto) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan teléfono o texto.' });
  }

  // 1) Mandar por la API de Meta
  const r = await enviarTexto(String(telefono).trim(), texto);
  if (!r.ok) {
    return res.status(200).json({ status: 'error', mensaje: r.error });
  }

  // 2) Guardar el saliente en el buzón
  const ts = new Date().toISOString();
  const conversacion_id = await asegurarConversacion(telefono, texto, ts, asesor);

  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id,
    telefono,
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
async function asegurarConversacion(telefono, texto, ts, asesor) {
  const preview = texto.slice(0, 200);

  const { data: existente } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .select('id')
    .eq('telefono', telefono)
    .maybeSingle();

  if (existente) {
    await supabaseAdmin
      .from('conversaciones_whatsapp')
      .update({ ultimo_mensaje: preview, ultimo_at: ts })
      .eq('id', existente.id);
    return existente.id;
  }

  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert({
      telefono,
      ultimo_mensaje: preview,
      ultimo_at: ts,
      estado: 'humano',
      asesor_asignado: asesor,
    })
    .select('id')
    .single();
  return nueva?.id || null;
}
