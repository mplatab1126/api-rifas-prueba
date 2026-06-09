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

// Normaliza las condiciones del filtro al formato que entiende la función de la base.
// Cada condición lleva su operador (tiene / no_tiene). Acepta también el formato viejo
// (etiqueta_id suelto) por si llega una llamada en caché durante un despliegue.
function normalizarCondiciones(condiciones) {
  return (Array.isArray(condiciones) ? condiciones : []).map(c => {
    if (!c || !c.tipo) return null;
    if (c.tipo === 'etiqueta') {
      const etiquetas = (Array.isArray(c.etiquetas) && c.etiquetas.length)
        ? c.etiquetas
        : (c.etiqueta_id ? [c.etiqueta_id] : []);
      if (!etiquetas.length) return null;
      const op = (c.op === 'no_tiene' || c.op === 'todas') ? c.op : 'tiene';
      return { tipo: 'etiqueta', op, etiquetas };
    }
    if (c.tipo === 'sin_respuesta') {
      return { tipo: 'sin_respuesta', op: c.op === 'no_tiene' ? 'no_tiene' : 'tiene' };
    }
    if (c.tipo === 'recordatorio') {
      return {
        tipo: 'recordatorio',
        op: c.op === 'no_tiene' ? 'no_tiene' : 'tiene',
        estado: c.estado === 'enviado' ? 'enviado' : 'pendiente',
      };
    }
    if (c.tipo === 'creado') {
      return { tipo: 'creado', op: c.op, dias: c.dias, fecha: c.fecha };
    }
    return null;
  }).filter(Boolean);
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

  // Condiciones del filtro avanzado (la función de la base las valida y aplica).
  const modo = (filtros && filtros.modo === 'o') ? 'o' : 'y';
  const condiciones = normalizarCondiciones(filtros && filtros.condiciones);
  // Compatibilidad con la versión anterior (parámetros sueltos en caché).
  if (soloSinRespuesta) condiciones.push({ tipo: 'sin_respuesta', op: 'tiene' });
  if (etiqueta_id) condiciones.push({ tipo: 'etiqueta', op: 'tiene', etiquetas: [etiqueta_id] });

  // El filtrado completo lo hace la base de datos (por índice, escala a 100k chats).
  const { data, error } = await supabase.rpc('bandeja_filtrar', {
    p_linea_id: linea_id,
    p_modo: modo,
    p_condiciones: condiciones,
    p_q: q || null,
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
      .select('conversacion_id, etiquetas (id, nombre, icono, color, orden)')
      .in('conversacion_id', ids);
    for (const a of (asign || [])) {
      if (!a.etiquetas) continue;
      (etiqPorConv[a.conversacion_id] = etiqPorConv[a.conversacion_id] || []).push(a.etiquetas);
    }
    // Las píldoras de cada chat se muestran en el orden elegido por Mateo.
    for (const k of Object.keys(etiqPorConv)) {
      etiqPorConv[k].sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
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
