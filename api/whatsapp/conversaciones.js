/**
 * Lista las conversaciones del buzón de WhatsApp para la bandeja de asesores.
 *
 * Devuelve los chats ordenados por el más reciente, con su vista previa y
 * cuántos mensajes sin leer tienen. Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, soloSinRespuesta }
 *
 * Pensado para escala (50k-100k chats): el filtro "sin respuesta" y su conteo
 * se hacen EN LA BASE DE DATOS (con índice), no en el navegador.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { esGerencia, puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, soloSinRespuesta, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  // Permiso de línea: un asesor solo ve las suyas
  if (linea_id && !(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }
  if (!linea_id && !esGerencia(nombre)) {
    return res.status(200).json({ status: 'ok', conversaciones: [], sinRespuestaTotal: 0 });
  }

  // Lista de chats DE ESTA LÍNEA (los 300 más recientes; si el filtro está activo, solo los "sin respuesta")
  let query = supabase
    .from('conversaciones_whatsapp')
    .select('id, telefono, nombre_perfil, ultimo_mensaje, ultimo_at, no_leidos, estado, asesor_asignado, ventana_vence_at, ultimo_entrante, linea_id, agente_activo')
    .order('ultimo_at', { ascending: false, nullsFirst: false })
    .not('ultimo_at', 'is', null)   // los contactos sin conversación van al apartado Contactos
    .limit(300);
  if (linea_id) query = query.eq('linea_id', linea_id);
  if (soloSinRespuesta) query = query.eq('ultimo_entrante', true);

  const { data, error } = await query;
  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Adjuntar las etiquetas de cada conversación
  const ids = (data || []).map(c => c.id);
  const etiqPorConv = {};
  if (ids.length) {
    const { data: asign } = await supabase
      .from('conversacion_etiquetas')
      .select('conversacion_id, etiquetas (id, nombre, icono, color)')
      .in('conversacion_id', ids);
    for (const a of (asign || [])) {
      if (!a.etiquetas) continue;
      (etiqPorConv[a.conversacion_id] = etiqPorConv[a.conversacion_id] || []).push(a.etiquetas);
    }
  }
  const conversaciones = (data || []).map(c => ({ ...c, etiquetas: etiqPorConv[c.id] || [] }));

  // Conteo total de "sin respuesta" de esta línea (rápido por el índice parcial)
  let conteo = supabase
    .from('conversaciones_whatsapp')
    .select('id', { count: 'exact', head: true })
    .eq('ultimo_entrante', true);
  if (linea_id) conteo = conteo.eq('linea_id', linea_id);
  const { count: sinRespuestaTotal } = await conteo;

  return res.status(200).json({
    status: 'ok',
    conversaciones,
    sinRespuestaTotal: sinRespuestaTotal || 0,
  });
}
