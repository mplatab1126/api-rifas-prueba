/**
 * Ayudante para poner una etiqueta a una conversación desde el backend (agente, webhook, etc.).
 * Si la etiqueta no existe en esa línea, la crea. No duplica si ya está asignada.
 */

import { supabase, supabaseAdmin } from './supabase.js';

export async function ponerEtiqueta(conversacionId, lineaId, nombre, opts = {}) {
  try {
    if (!conversacionId || !lineaId || !nombre) return;
    // Buscar la etiqueta de la línea (por nombre, sin distinguir mayúsculas).
    let { data: et } = await supabase
      .from('etiquetas').select('id').eq('linea_id', lineaId).ilike('nombre', nombre).maybeSingle();
    if (!et) {
      const { data: nueva } = await supabaseAdmin
        .from('etiquetas')
        .insert({ linea_id: lineaId, nombre, icono: opts.icono || '🏷️', color: opts.color || '#6E6E6E' })
        .select('id').single();
      et = nueva;
    }
    if (!et) return;
    // Asignarla si no la tiene ya.
    const { data: ya } = await supabase
      .from('conversacion_etiquetas').select('conversacion_id')
      .eq('conversacion_id', conversacionId).eq('etiqueta_id', et.id).maybeSingle();
    if (!ya) {
      await supabaseAdmin.from('conversacion_etiquetas').insert({ conversacion_id: conversacionId, etiqueta_id: et.id });
    }
  } catch (_) { /* poner etiqueta nunca debe romper el flujo principal */ }
}
