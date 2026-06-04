/**
 * ENVIAR una foto o un PDF que el asesor adjunta DESDE SU COMPUTADOR.
 *
 * A diferencia de las respuestas rápidas (que mandan imágenes por un URL público),
 * aquí el asesor sube un archivo suelto. Pasos:
 *   1) Subir el archivo a Meta (queda guardado allá y nos devuelve un "media_id").
 *   2) Enviárselo al cliente por ese media_id.
 *   3) Guardarlo en el buzón para que quede en el historial del chat.
 *
 * Protegido con contraseña de asesor (igual que el resto del panel).
 *
 * Recibe (POST, JSON):
 *   { contrasena, telefono, linea_id, archivo_base64, mime, nombre_archivo, caption }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { subirMediaDesdeBuffer, enviarImagenPorId, enviarDocumentoPorId } from '../lib/whatsapp.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono, linea_id, archivo_base64, mime, nombre_archivo, caption } = req.body || {};
  const asesor = validarAsesor(contrasena);
  if (!asesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono || !archivo_base64) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan teléfono o archivo.' });
  }
  if (linea_id && !(await puedeVerLinea(asesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  // Solo imágenes o PDF (lo que el cliente espera recibir de un asesor).
  const tipoMime = (mime || '').split(';')[0].trim();
  const esImagen = tipoMime.startsWith('image/');
  const esPdf = tipoMime === 'application/pdf';
  if (!esImagen && !esPdf) {
    return res.status(400).json({ status: 'error', mensaje: 'Solo se permiten imágenes o PDF.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(archivo_base64, 'base64');
  } catch (_) {
    return res.status(400).json({ status: 'error', mensaje: 'El archivo no se pudo leer.' });
  }
  if (!buffer.length) {
    return res.status(400).json({ status: 'error', mensaje: 'El archivo llegó vacío.' });
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ status: 'error', mensaje: 'El archivo es muy grande (máx 5 MB).' });
  }

  const tel = String(telefono).trim();

  // 1) Subir el archivo a Meta → media_id
  const sub = await subirMediaDesdeBuffer(buffer, tipoMime, nombre_archivo, linea_id);
  if (!sub.ok) {
    return res.status(200).json({ status: 'error', mensaje: sub.error });
  }

  // 2) Enviarlo al cliente por su media_id
  const cap = (caption || '').trim() || undefined;
  const env = esImagen
    ? await enviarImagenPorId(tel, sub.media_id, cap, linea_id)
    : await enviarDocumentoPorId(tel, sub.media_id, nombre_archivo || 'archivo.pdf', cap, linea_id);
  if (!env.ok) {
    return res.status(200).json({ status: 'error', mensaje: env.error });
  }

  // 3) Guardar el saliente en el buzón (queda en el historial igual que un texto)
  const ts = new Date().toISOString();
  const preview = cap || (esImagen ? '📷 Foto' : '📄 ' + (nombre_archivo || 'Archivo'));
  const conversacion_id = await asegurarConversacion(tel, preview, ts, asesor, linea_id);

  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id,
    telefono: tel,
    linea_id: linea_id || null,
    direccion: 'saliente',
    tipo: esImagen ? 'image' : 'document',
    texto: cap || null,
    media_id: sub.media_id,
    wa_message_id: env.wa_message_id,
    estado_envio: 'enviado',
    timestamp_wa: ts,
    raw: env.raw,
  });

  return res.status(200).json({ status: 'ok', wa_message_id: env.wa_message_id });
}

// Crea la conversación si no existe, o le actualiza la vista previa. Devuelve su id.
// (Misma lógica que enviar.js, para mantener el comportamiento consistente.)
async function asegurarConversacion(telefono, texto, ts, asesor, lineaId) {
  const preview = String(texto).slice(0, 200);

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
