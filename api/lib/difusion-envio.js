/**
 * Núcleo del envío de una difusión: procesa UN lote de la cola.
 *
 * Lo usan dos lugares:
 *   - difusiones.js (acción "enviar-lote"): cuando Mateo envía a mano desde la bandeja.
 *   - difusiones-cron.js: cuando una difusión quedó PROGRAMADA para una hora y el cron
 *     la va enviando solo, por tandas (un lote por minuto = ritmo suave para Meta).
 *
 * Es seguro que los dos toquen la misma difusión a la vez: el lote se "reclama" de forma
 * ATÓMICA en la base (difusion_reclamar_lote, FOR UPDATE SKIP LOCKED), así que un mismo
 * destinatario nunca se envía dos veces.
 */

import { supabaseAdmin } from './supabase.js';
import { enviarPlantilla } from './whatsapp.js';

// {nombre}/{telefono} → datos reales del destinatario. Otro texto se deja igual.
function resolverParametros(variables, dest) {
  if (!Array.isArray(variables)) return [];
  return variables.map(v => {
    const s = String(v == null ? '' : v);
    if (s === '{nombre}') return dest.nombre || '';
    if (s === '{telefono}') return dest.telefono || '';
    return s;
  });
}
// Cuerpo con las variables ya puestas, para guardarlo en el historial del chat.
function textoFinal(cuerpo, params) {
  let t = String(cuerpo || '');
  (params || []).forEach((val, i) => { t = t.replaceAll(`{{${i + 1}}}`, String(val ?? '')); });
  return t;
}
// Busca (o crea) la conversación de un teléfono en una línea y devuelve su id.
async function asegurarConv(telefono, lineaId, asesor) {
  let b = supabaseAdmin.from('conversaciones_whatsapp').select('id').eq('telefono', telefono);
  b = lineaId ? b.eq('linea_id', lineaId) : b.is('linea_id', null);
  const { data } = await b.maybeSingle();
  if (data) return data.id;
  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert({ telefono, linea_id: lineaId || null, ultimo_entrante: false, estado: 'humano', asesor_asignado: asesor })
    .select('id').single();
  return nueva ? nueva.id : null;
}

async function contar(difusionId, estado) {
  const { count } = await supabaseAdmin
    .from('difusion_destinatarios').select('id', { count: 'exact', head: true })
    .eq('difusion_id', difusionId).eq('estado', estado);
  return count || 0;
}

/**
 * Envía un lote de la difusión `difusionId`. Devuelve { ok, restantes, completada, enviados, fallidos }.
 */
export async function procesarLoteDifusion(difusionId, { limite = 30, asesor = 'sistema' } = {}) {
  const { data: dif } = await supabaseAdmin.from('difusiones').select('*').eq('id', difusionId).maybeSingle();
  if (!dif) return { ok: false, error: 'No se encontró la difusión.' };
  if (dif.estado === 'cancelada') return { ok: false, error: 'La difusión está cancelada.' };
  if (!dif.plantilla_id) return { ok: false, error: 'La difusión no tiene plantilla.' };

  const { data: pl } = await supabaseAdmin
    .from('plantillas_whatsapp').select('nombre, idioma, cuerpo, estado')
    .eq('id', dif.plantilla_id).eq('linea_id', dif.linea_id).maybeSingle();
  if (!pl) return { ok: false, error: 'No se encontró la plantilla de la difusión.' };
  if (pl.estado !== 'aprobada') return { ok: false, error: 'La plantilla aún no está aprobada por Meta.' };

  // Marcar que arrancó (si venía de "preparada"/"programada").
  if (dif.estado !== 'enviando') {
    await supabaseAdmin.from('difusiones')
      .update({ estado: 'enviando', iniciada_at: dif.iniciada_at || new Date().toISOString() })
      .eq('id', dif.id);
  }

  // Reclamar atómicamente el siguiente lote (pendiente → enviando).
  const { data: lote, error: errLote } = await supabaseAdmin
    .rpc('difusion_reclamar_lote', { p_difusion: dif.id, p_limite: limite });
  if (errLote) return { ok: false, error: errLote.message };

  if (!lote || !lote.length) {
    // No queda nada por reclamar. Si tampoco hay envíos "en vuelo", la damos por completada.
    const enVuelo = await contar(dif.id, 'enviando');
    if (!enVuelo) {
      await supabaseAdmin.from('difusiones')
        .update({ estado: 'completada', completada_at: new Date().toISOString() }).eq('id', dif.id);
      return { ok: true, restantes: 0, completada: true, enviados: dif.enviados, fallidos: dif.fallidos };
    }
    return { ok: true, restantes: 0, completada: false, enviados: dif.enviados, fallidos: dif.fallidos };
  }

  let nuevosEnviados = 0, nuevosFallidos = 0;
  for (const dest of lote) {
    const params = resolverParametros(dif.variables, dest);
    const env = await enviarPlantilla(dest.telefono, { nombre: pl.nombre, idioma: pl.idioma, parametros: params }, dif.linea_id);
    const ts = new Date().toISOString();
    if (env.ok) {
      await supabaseAdmin.from('difusion_destinatarios')
        .update({ estado: 'enviado', wa_message_id: env.wa_message_id || null, enviado_at: ts, error: null })
        .eq('id', dest.id);
      nuevosEnviados++;
      // Dejar rastro en el chat (igual que un saliente normal) → Liliana ve qué se envió.
      const conversacion_id = await asegurarConv(dest.telefono, dif.linea_id, asesor);
      const cuerpo = textoFinal(pl.cuerpo, params);
      await supabaseAdmin.from('mensajes_whatsapp').insert({
        conversacion_id, telefono: dest.telefono, linea_id: dif.linea_id,
        direccion: 'saliente', tipo: 'text', texto: cuerpo,
        wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts,
      });
      const cambios = { ultimo_mensaje: String(cuerpo).slice(0, 200), ultimo_at: ts, ultimo_entrante: false };
      // Si la campaña lo pide, encender el agente en ese chat: queda en silencio hasta que
      // el cliente responda; ahí Liliana arranca sola y sigue el hilo.
      if (dif.activar_agente) cambios.agente_activo = true;
      let upd = supabaseAdmin.from('conversaciones_whatsapp').update(cambios).eq('telefono', dest.telefono);
      upd = dif.linea_id ? upd.eq('linea_id', dif.linea_id) : upd.is('linea_id', null);
      await upd;
    } else {
      await supabaseAdmin.from('difusion_destinatarios')
        .update({ estado: 'fallido', error: String(env.error || 'error').slice(0, 300), enviado_at: ts })
        .eq('id', dest.id);
      nuevosFallidos++;
    }
  }

  const enviados = (dif.enviados || 0) + nuevosEnviados;
  const fallidos = (dif.fallidos || 0) + nuevosFallidos;
  const restantes = await contar(dif.id, 'pendiente');
  const enVuelo = await contar(dif.id, 'enviando');
  const completada = restantes === 0 && enVuelo === 0;
  await supabaseAdmin.from('difusiones')
    .update({ enviados, fallidos, estado: completada ? 'completada' : 'enviando', ...(completada ? { completada_at: new Date().toISOString() } : {}) })
    .eq('id', dif.id);

  return { ok: true, restantes, completada, enviados, fallidos };
}
