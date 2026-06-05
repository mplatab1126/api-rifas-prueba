/**
 * Lista las conversaciones del buzón de WhatsApp para la bandeja de asesores.
 *
 * Devuelve los chats ordenados por el más reciente, con su vista previa y
 * cuántos mensajes sin leer tienen. Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, soloSinRespuesta, q, etiqueta_id }
 *   q - texto de búsqueda (nombre o teléfono). Opcional. Busca en TODA la base.
 *   etiqueta_id - filtra solo los chats que tengan esa etiqueta (INNER JOIN). Opcional.
 *
 * Pensado para escala (50k-100k chats): el filtro "sin respuesta", la búsqueda y
 * su conteo se hacen EN LA BASE DE DATOS (con índice), no en el navegador.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { esGerencia, puedeVerLinea } from '../lib/asesores.js';
import { obtenerConfig } from '../lib/configuracion.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, soloSinRespuesta, q, etiqueta_id, linea_id } = req.body || {};
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
  const cols = 'id, telefono, nombre_perfil, ultimo_mensaje, ultimo_at, no_leidos, estado, asesor_asignado, ventana_vence_at, ultimo_entrante, linea_id, agente_activo';
  // Si se filtra por etiqueta, se hace un INNER JOIN con conversacion_etiquetas (por índice):
  // solo trae los chats que tienen esa etiqueta, sin recorrer toda la base.
  let query = supabase
    .from('conversaciones_whatsapp')
    .select(etiqueta_id ? cols + ', conversacion_etiquetas!inner(etiqueta_id)' : cols)
    .order('ultimo_at', { ascending: false, nullsFirst: false })
    .not('ultimo_at', 'is', null)   // los contactos sin conversación van al apartado Contactos
    .limit(300);
  if (linea_id) query = query.eq('linea_id', linea_id);
  if (soloSinRespuesta) query = query.eq('ultimo_entrante', true);
  if (etiqueta_id) query = query.eq('conversacion_etiquetas.etiqueta_id', etiqueta_id);

  // Liliana NO ve los chats que el agente está atendiendo (si el interruptor está activo).
  // Cuando el agente le entrega un chat (agente_activo=false), sí lo ve.
  const esLiliana = String(nombre || '').trim().toLowerCase() === 'liliana';
  if (esLiliana && (await obtenerConfig('ocultar_agente_liliana')) === 'true') {
    query = query.or('agente_activo.is.null,agente_activo.eq.false');
  }

  // Búsqueda en TODA la base (no solo en lo cargado): por teléfono si escribieron
  // números, o por nombre del perfil si escribieron letras. Mismo criterio que Contactos.
  const filtro = String(q || '').trim();
  if (filtro) {
    const soloDigitos = filtro.replace(/\D/g, '');
    if (soloDigitos.length >= 3) query = query.ilike('telefono', `%${soloDigitos}%`);
    else query = query.ilike('nombre_perfil', `%${filtro}%`);
  }

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
  const conversaciones = (data || []).map(c => {
    const { conversacion_etiquetas, ...rest } = c;   // quita el campo del join (si vino)
    return { ...rest, etiquetas: etiqPorConv[c.id] || [] };
  });

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
