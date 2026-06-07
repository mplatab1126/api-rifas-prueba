/**
 * Lista las conversaciones del buzón de WhatsApp para la bandeja de asesores.
 *
 * Devuelve los chats ordenados por el más reciente, con su vista previa y
 * cuántos mensajes sin leer tienen. Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, linea_id, q, filtros }
 *   q       - texto de búsqueda (nombre o teléfono). Opcional. Busca en TODA la base.
 *   filtros - filtro avanzado: { modo:'y'|'o', condiciones:[ ... ] }. Opcional.
 *             Cada condición es una de:
 *               { tipo:'etiqueta', etiqueta_id }
 *               { tipo:'sin_respuesta' }
 *               { tipo:'recordatorio' }
 *               { tipo:'creado', op:'ultimos_dias', dias }   |  op:'antes'|'despues', fecha:'YYYY-MM-DD'
 *   (se aceptan también los parámetros viejos soloSinRespuesta / etiqueta_id por compatibilidad)
 *
 * Pensado para escala (50k-100k chats): TODO el filtrado (etiquetas, sin respuesta,
 * recordatorio, fecha, búsqueda) corre EN LA BASE DE DATOS con la función
 * `bandeja_filtrar` (por índice), no en el navegador.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { esGerencia, puedeVerLinea } from '../lib/asesores.js';
import { obtenerConfig } from '../lib/configuracion.js';

// Traduce una condición "creado" a un rango de fechas (hora de Colombia, -05:00).
function rangoCreado(c) {
  const op = c && c.op;
  if (op === 'ultimos_dias') {
    const n = Math.max(1, Math.min(parseInt(c.dias, 10) || 0, 3650));
    return { desde: new Date(Date.now() - n * 86400000).toISOString(), hasta: null };
  }
  if (op === 'antes' && c.fecha) return { desde: null, hasta: `${c.fecha}T23:59:59-05:00` };
  if (op === 'despues' && c.fecha) return { desde: `${c.fecha}T00:00:00-05:00`, hasta: null };
  return { desde: null, hasta: null };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, q, filtros, linea_id, soloSinRespuesta, etiqueta_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  // Permiso de línea: un asesor solo ve las suyas.
  if (linea_id && !(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }
  if (!linea_id && !esGerencia(nombre)) {
    return res.status(200).json({ status: 'ok', conversaciones: [], sinRespuestaTotal: 0 });
  }

  // Traducir las condiciones del filtro avanzado a los parámetros de la función.
  const condiciones = (filtros && Array.isArray(filtros.condiciones)) ? filtros.condiciones : [];
  const modo = (filtros && filtros.modo === 'o') ? 'o' : 'y';
  const etiquetas = [];
  let pSinResp = false;
  let pRecordatorio = false;
  let pRecordatorioEstado = 'pendiente';
  let creadoDesde = null;
  let creadoHasta = null;
  for (const c of condiciones) {
    if (!c || !c.tipo) continue;
    if (c.tipo === 'etiqueta' && c.etiqueta_id) etiquetas.push(c.etiqueta_id);
    else if (c.tipo === 'sin_respuesta') pSinResp = true;
    else if (c.tipo === 'recordatorio') {
      pRecordatorio = true;
      if (c.estado === 'enviado' || c.estado === 'pendiente') pRecordatorioEstado = c.estado;
    }
    else if (c.tipo === 'creado') {
      const { desde, hasta } = rangoCreado(c);
      if (desde) creadoDesde = desde;
      if (hasta) creadoHasta = hasta;
    }
  }
  // Compatibilidad con la versión anterior (por si llega una llamada vieja en caché).
  if (soloSinRespuesta) pSinResp = true;
  if (etiqueta_id) etiquetas.push(etiqueta_id);

  // Liliana NO ve los chats que el agente está atendiendo (si el interruptor está activo).
  const esLiliana = String(nombre || '').trim().toLowerCase() === 'liliana';
  const ocultarAgente = esLiliana && (await obtenerConfig('ocultar_agente_liliana')) === 'true';

  // El filtrado completo lo hace la base de datos (por índice, escala a 100k chats).
  const { data, error } = await supabase.rpc('bandeja_filtrar', {
    p_linea_id: linea_id,
    p_modo: modo,
    p_etiquetas: etiquetas,
    p_sin_respuesta: pSinResp,
    p_recordatorio: pRecordatorio,
    p_recordatorio_estado: pRecordatorioEstado,
    p_creado_desde: creadoDesde,
    p_creado_hasta: creadoHasta,
    p_q: q || null,
    p_ocultar_agente: ocultarAgente,
    p_limite: 300,
  });
  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Adjuntar las etiquetas de cada conversación.
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
  // Solo devolvemos los campos que la bandeja usa (no las columnas internas del agente).
  const conversaciones = (data || []).map(c => ({
    id: c.id,
    telefono: c.telefono,
    nombre_perfil: c.nombre_perfil,
    ultimo_mensaje: c.ultimo_mensaje,
    ultimo_at: c.ultimo_at,
    no_leidos: c.no_leidos,
    estado: c.estado,
    asesor_asignado: c.asesor_asignado,
    ventana_vence_at: c.ventana_vence_at,
    ultimo_entrante: c.ultimo_entrante,
    linea_id: c.linea_id,
    agente_activo: c.agente_activo,
    etiquetas: etiqPorConv[c.id] || [],
  }));

  // Conteo total de "sin respuesta" de esta línea (rápido por el índice parcial).
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
