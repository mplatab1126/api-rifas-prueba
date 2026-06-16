/**
 * Etiquetas de conversaciones (por línea). Un endpoint con varias acciones:
 *   listar       → etiquetas de la línea (si no hay, crea unas por defecto)
 *   crear        → { nombre, icono, color }
 *   eliminar     → { id }
 *   conversacion → { telefono } → ids de etiquetas que ya tiene ese chat
 *   toggle       → { telefono, etiqueta_id, asignar:true/false }
 *
 * Recibe (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { dispararEventoEtiqueta } from '../lib/flujo-motor.js';
import { puedeVerLinea } from '../lib/asesores.js';

const DEFAULTS = [
  { nombre: 'Pagada',    icono: '🟢', color: '#22C55E' },
  { nombre: 'Abonada',   icono: '🟡', color: '#EAB308' },
  { nombre: 'Separada',  icono: '🔵', color: '#3B82F6' },
  { nombre: 'Pendiente', icono: '🔴', color: '#EF4444' },
];

async function convId(lineaId, telefono) {
  let q = supabaseAdmin.from('conversaciones_whatsapp').select('id').eq('telefono', telefono);
  q = lineaId ? q.eq('linea_id', lineaId) : q.is('linea_id', null);
  const { data } = await q.maybeSingle();
  return data ? data.id : null;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (linea_id && !(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    if (accion === 'listar') {
      const sel = 'id, nombre, icono, color, orden';
      let { data } = await supabase.from('etiquetas').select(sel).eq('linea_id', linea_id)
        .order('orden', { ascending: true }).order('created_at', { ascending: true });
      if ((!data || data.length === 0) && linea_id) {
        await supabaseAdmin.from('etiquetas').insert(DEFAULTS.map((d, i) => ({ ...d, linea_id, orden: i })));
        const r2 = await supabase.from('etiquetas').select(sel).eq('linea_id', linea_id)
          .order('orden', { ascending: true }).order('created_at', { ascending: true });
        data = r2.data;
      }
      return res.status(200).json({ status: 'ok', etiquetas: data || [] });
    }

    if (accion === 'reordenar') {
      // Guarda el orden elegido por Mateo (posición en la lista 0,1,2,...) para esta línea.
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      for (let i = 0; i < ids.length; i++) {
        await supabaseAdmin.from('etiquetas').update({ orden: i }).eq('id', ids[i]).eq('linea_id', linea_id);
      }
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'crear') {
      const { nombre: nm, icono, color } = req.body;
      if (!String(nm || '').trim()) return res.status(200).json({ status: 'error', mensaje: 'Falta el nombre.' });
      // La nueva queda de última en el orden.
      const { count } = await supabaseAdmin.from('etiquetas')
        .select('id', { count: 'exact', head: true }).eq('linea_id', linea_id);
      const { data, error } = await supabaseAdmin
        .from('etiquetas')
        .insert({ linea_id, nombre: String(nm).trim().slice(0, 40), icono: icono || null, color: color || null, orden: count || 0 })
        .select('id, nombre, icono, color, orden')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', etiqueta: data });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      await supabaseAdmin.from('etiquetas').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'conversacion') {
      const cid = await convId(linea_id, req.body.telefono);
      if (!cid) return res.status(200).json({ status: 'ok', asignadas: [] });
      const { data } = await supabase.from('conversacion_etiquetas').select('etiqueta_id').eq('conversacion_id', cid);
      return res.status(200).json({ status: 'ok', asignadas: (data || []).map(r => r.etiqueta_id) });
    }

    if (accion === 'toggle') {
      const { telefono, etiqueta_id, asignar } = req.body;
      const cid = await convId(linea_id, telefono);
      if (!cid) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la conversación.' });
      if (asignar) {
        await supabaseAdmin.from('conversacion_etiquetas').upsert({ conversacion_id: cid, etiqueta_id }, { onConflict: 'conversacion_id,etiqueta_id', ignoreDuplicates: true });
        // Evento "etiqueta aplicada": si hay un disparador para esta etiqueta, lo ejecuta (flujo o agente).
        try {
          const { data: et } = await supabaseAdmin.from('etiquetas').select('nombre').eq('id', etiqueta_id).maybeSingle();
          if (et) await dispararEventoEtiqueta(linea_id, String(telefono || '').replace(/\D/g, ''), et.nombre);
        } catch (_) { /* el disparo por etiqueta nunca debe romper el etiquetado */ }
      } else {
        await supabaseAdmin.from('conversacion_etiquetas').delete().eq('conversacion_id', cid).eq('etiqueta_id', etiqueta_id);
      }
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
