/**
 * Difusiones (broadcasts) de la bandeja: enviar una plantilla aprobada a muchos
 * contactos de una línea a la vez.
 *
 * Cómo escala: NO se manda todo en una sola petición (eso lo cortaría Vercel y
 * Meta tiene límites). En vez de eso:
 *   1) "preparar"  → arma la lista de destinatarios y la guarda en la tabla
 *                    difusion_destinatarios (la "cola").
 *   2) "enviar-lote" → el navegador llama esto muchas veces; cada llamada manda
 *                    un puñado (lote) y devuelve cuántos quedan. Así, si se cierra
 *                    el navegador, la difusión se puede retomar donde iba.
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, ... }
 *   listar       → difusiones de la línea
 *   crear        → { nombre, plantilla_id, variables, filtros } (queda en borrador)
 *   editar       → { id, nombre, plantilla_id, variables, filtros }
 *   eliminar     → { id }
 *   preparar     → { id } → calcula y guarda los destinatarios; estado "preparada"
 *   estado       → { id } → progreso (total/enviados/fallidos/pendientes)
 *   enviar-lote  → { id, limite? } → manda un lote y devuelve el avance
 *   cancelar     → { id }
 *   prueba       → { plantilla_id, variables, telefono } → manda UNO a un número de prueba
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { enviarPlantilla } from '../lib/whatsapp.js';

const LOTE_DEFECTO = 25;     // cuántos mensajes por llamada de "enviar-lote"
const LOTE_MAX = 80;
const INSERT_CHUNK = 500;    // de a cuántos destinatarios se insertan en la cola

// Reemplaza los tokens de personalización ({nombre}, {telefono}) por los datos
// reales del destinatario. Cualquier otro texto se deja igual.
function resolverParametros(variables, dest) {
  if (!Array.isArray(variables)) return [];
  return variables.map(v => {
    const s = String(v == null ? '' : v);
    if (s === '{nombre}') return dest.nombre || '';
    if (s === '{telefono}') return dest.telefono || '';
    return s;
  });
}

// Texto que se guarda en el historial del chat (el cuerpo con las variables ya puestas).
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

// Calcula la lista de teléfonos según los filtros de audiencia (server-side).
// Devuelve [{ telefono, nombre }]. Pagina para no traer todo de golpe.
async function calcularAudiencia(lineaId, filtros) {
  const tipo = (filtros && filtros.tipo) || 'todos';
  const vistos = new Set();
  const out = [];

  if (tipo === 'etiqueta' && filtros.etiqueta_id) {
    // Conversaciones de la línea que tengan esa etiqueta.
    const { data: ce } = await supabaseAdmin
      .from('conversacion_etiquetas').select('conversacion_id').eq('etiqueta_id', filtros.etiqueta_id);
    const ids = (ce || []).map(r => r.conversacion_id);
    for (let i = 0; i < ids.length; i += 300) {
      const trozo = ids.slice(i, i + 300);
      const { data } = await supabaseAdmin
        .from('conversaciones_whatsapp')
        .select('telefono, nombre_perfil')
        .eq('linea_id', lineaId)
        .in('id', trozo);
      for (const c of (data || [])) {
        if (c.telefono && !vistos.has(c.telefono)) { vistos.add(c.telefono); out.push({ telefono: c.telefono, nombre: c.nombre_perfil || '' }); }
      }
    }
    return out;
  }

  // tipo "todos": todos los contactos de la línea, paginado.
  const PAGE = 1000;
  for (let page = 0; page < 1000; page++) {
    const { data } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .select('telefono, nombre_perfil')
      .eq('linea_id', lineaId)
      .order('telefono', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (!data || !data.length) break;
    for (const c of data) {
      if (c.telefono && !vistos.has(c.telefono)) { vistos.add(c.telefono); out.push({ telefono: c.telefono, nombre: c.nombre_perfil || '' }); }
    }
    if (data.length < PAGE) break;
  }
  return out;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombreAsesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    if (accion === 'listar') {
      const { data } = await supabase
        .from('difusiones')
        .select('id, nombre, plantilla_id, variables, filtros, estado, total, enviados, fallidos, creada_por, created_at, completada_at, plantillas_whatsapp(nombre, estado)')
        .eq('linea_id', linea_id)
        .order('created_at', { ascending: false });
      const difusiones = (data || []).map(d => ({
        ...d,
        plantilla_nombre: d.plantillas_whatsapp ? d.plantillas_whatsapp.nombre : null,
        plantilla_estado: d.plantillas_whatsapp ? d.plantillas_whatsapp.estado : null,
        plantillas_whatsapp: undefined,
      }));
      return res.status(200).json({ status: 'ok', difusiones });
    }

    if (accion === 'crear' || accion === 'editar') {
      const nombre = String(req.body.nombre || '').trim().slice(0, 100);
      const plantilla_id = req.body.plantilla_id || null;
      const variables = Array.isArray(req.body.variables) ? req.body.variables : [];
      const filtros = (req.body.filtros && typeof req.body.filtros === 'object') ? req.body.filtros : { tipo: 'todos' };
      if (!nombre) return res.status(200).json({ status: 'error', mensaje: 'Ponle un nombre a la difusión.' });

      if (accion === 'crear') {
        const { data, error } = await supabaseAdmin
          .from('difusiones')
          .insert({ linea_id, nombre, plantilla_id, variables, filtros, estado: 'borrador', creada_por: nombreAsesor })
          .select('id, nombre, plantilla_id, variables, filtros, estado, total, enviados, fallidos, created_at')
          .single();
        if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
        return res.status(200).json({ status: 'ok', difusion: data });
      }

      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la difusión a editar.' });
      // Solo se puede editar mientras es borrador o está preparada (no en pleno envío).
      const { data: actual } = await supabaseAdmin.from('difusiones').select('estado').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!actual) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      if (!['borrador', 'preparada'].includes(actual.estado)) {
        return res.status(200).json({ status: 'error', mensaje: 'No se puede editar una difusión que ya empezó a enviarse.' });
      }
      const { data, error } = await supabaseAdmin
        .from('difusiones')
        .update({ nombre, plantilla_id, variables, filtros, estado: 'borrador' })
        .eq('id', id).eq('linea_id', linea_id)
        .select('id, nombre, plantilla_id, variables, filtros, estado, total, enviados, fallidos, created_at')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      // Al editarla vuelve a borrador: limpiamos la cola anterior (si la había).
      await supabaseAdmin.from('difusion_destinatarios').delete().eq('difusion_id', id);
      return res.status(200).json({ status: 'ok', difusion: data });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la difusión a eliminar.' });
      await supabaseAdmin.from('difusiones').delete().eq('id', id).eq('linea_id', linea_id);   // los destinatarios caen por cascada
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'preparar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la difusión.' });
      const { data: dif } = await supabaseAdmin.from('difusiones').select('*').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!dif) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      if (!dif.plantilla_id) return res.status(200).json({ status: 'error', mensaje: 'Primero elige una plantilla aprobada.' });
      if (!['borrador', 'preparada'].includes(dif.estado)) {
        return res.status(200).json({ status: 'error', mensaje: 'Esta difusión ya empezó a enviarse.' });
      }

      const audiencia = await calcularAudiencia(linea_id, dif.filtros);
      // Rehacemos la cola desde cero.
      await supabaseAdmin.from('difusion_destinatarios').delete().eq('difusion_id', id);
      for (let i = 0; i < audiencia.length; i += INSERT_CHUNK) {
        const filas = audiencia.slice(i, i + INSERT_CHUNK).map(a => ({
          difusion_id: id, telefono: a.telefono, nombre: a.nombre || null, estado: 'pendiente',
        }));
        if (filas.length) await supabaseAdmin.from('difusion_destinatarios').insert(filas);
      }
      await supabaseAdmin.from('difusiones')
        .update({ total: audiencia.length, enviados: 0, fallidos: 0, estado: 'preparada' })
        .eq('id', id);
      return res.status(200).json({ status: 'ok', total: audiencia.length });
    }

    if (accion === 'estado') {
      const { id } = req.body;
      const { data: dif } = await supabaseAdmin
        .from('difusiones').select('id, estado, total, enviados, fallidos').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!dif) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      const { count } = await supabaseAdmin
        .from('difusion_destinatarios').select('id', { count: 'exact', head: true }).eq('difusion_id', id).eq('estado', 'pendiente');
      return res.status(200).json({ status: 'ok', difusion: dif, pendientes: count || 0 });
    }

    if (accion === 'cancelar') {
      const { id } = req.body;
      await supabaseAdmin.from('difusiones').update({ estado: 'cancelada' }).eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    // Envía UN número de prueba (no toca la cola ni los contadores de la difusión).
    if (accion === 'prueba') {
      const telefono = String(req.body.telefono || '').replace(/\D/g, '');
      const plantilla_id = req.body.plantilla_id;
      const variables = Array.isArray(req.body.variables) ? req.body.variables : [];
      if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Escribe el número de prueba (solo dígitos, con indicativo).' });
      const { data: pl } = await supabaseAdmin
        .from('plantillas_whatsapp').select('nombre, idioma, cuerpo, estado').eq('id', plantilla_id).eq('linea_id', linea_id).maybeSingle();
      if (!pl) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la plantilla.' });
      if (pl.estado !== 'aprobada') return res.status(200).json({ status: 'error', mensaje: 'La plantilla aún no está aprobada por Meta.' });
      const params = resolverParametros(variables, { nombre: 'Prueba', telefono });
      const env = await enviarPlantilla(telefono, { nombre: pl.nombre, idioma: pl.idioma, parametros: params }, linea_id);
      if (!env.ok) return res.status(200).json({ status: 'error', mensaje: env.error });
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'enviar-lote') {
      const { id } = req.body;
      const limite = Math.min(LOTE_MAX, Math.max(1, parseInt(req.body.limite, 10) || LOTE_DEFECTO));
      const { data: dif } = await supabaseAdmin.from('difusiones').select('*').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!dif) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      if (dif.estado === 'cancelada') return res.status(200).json({ status: 'error', mensaje: 'La difusión está cancelada.' });
      if (!dif.plantilla_id) return res.status(200).json({ status: 'error', mensaje: 'La difusión no tiene plantilla.' });

      const { data: pl } = await supabaseAdmin
        .from('plantillas_whatsapp').select('nombre, idioma, cuerpo, estado').eq('id', dif.plantilla_id).eq('linea_id', linea_id).maybeSingle();
      if (!pl) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la plantilla de la difusión.' });
      if (pl.estado !== 'aprobada') return res.status(200).json({ status: 'error', mensaje: 'La plantilla aún no está aprobada por Meta. No se puede enviar.' });

      // Tomar el siguiente lote de pendientes.
      const { data: lote } = await supabaseAdmin
        .from('difusion_destinatarios')
        .select('id, telefono, nombre')
        .eq('difusion_id', id).eq('estado', 'pendiente')
        .order('id', { ascending: true })
        .limit(limite);

      if (!lote || !lote.length) {
        await supabaseAdmin.from('difusiones').update({ estado: 'completada', completada_at: new Date().toISOString() }).eq('id', id);
        return res.status(200).json({ status: 'ok', restantes: 0, completada: true, enviados: dif.enviados, fallidos: dif.fallidos });
      }

      // Marcar que arrancó.
      if (dif.estado !== 'enviando') {
        await supabaseAdmin.from('difusiones').update({ estado: 'enviando', iniciada_at: dif.iniciada_at || new Date().toISOString() }).eq('id', id);
      }

      let nuevosEnviados = 0, nuevosFallidos = 0;
      for (const dest of lote) {
        const params = resolverParametros(dif.variables, dest);
        const env = await enviarPlantilla(dest.telefono, { nombre: pl.nombre, idioma: pl.idioma, parametros: params }, linea_id);
        const ts = new Date().toISOString();
        if (env.ok) {
          await supabaseAdmin.from('difusion_destinatarios')
            .update({ estado: 'enviado', wa_message_id: env.wa_message_id || null, enviado_at: ts, error: null })
            .eq('id', dest.id);
          nuevosEnviados++;
          // Dejar rastro en el chat del cliente (igual que un mensaje saliente normal).
          const conversacion_id = await asegurarConv(dest.telefono, linea_id, nombreAsesor);
          const cuerpo = textoFinal(pl.cuerpo, params);
          await supabaseAdmin.from('mensajes_whatsapp').insert({
            conversacion_id, telefono: dest.telefono, linea_id,
            direccion: 'saliente', tipo: 'text', texto: cuerpo,
            wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts,
          });
          let upd = supabaseAdmin.from('conversaciones_whatsapp')
            .update({ ultimo_mensaje: String(cuerpo).slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
            .eq('telefono', dest.telefono);
          upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
          await upd;
        } else {
          await supabaseAdmin.from('difusion_destinatarios')
            .update({ estado: 'fallido', error: String(env.error || 'error').slice(0, 300), enviado_at: ts })
            .eq('id', dest.id);
          nuevosFallidos++;
        }
      }

      // Actualizar contadores de la difusión.
      const enviados = (dif.enviados || 0) + nuevosEnviados;
      const fallidos = (dif.fallidos || 0) + nuevosFallidos;
      const { count: restantes } = await supabaseAdmin
        .from('difusion_destinatarios').select('id', { count: 'exact', head: true }).eq('difusion_id', id).eq('estado', 'pendiente');
      const completada = (restantes || 0) === 0;
      await supabaseAdmin.from('difusiones')
        .update({ enviados, fallidos, estado: completada ? 'completada' : 'enviando', ...(completada ? { completada_at: new Date().toISOString() } : {}) })
        .eq('id', id);

      return res.status(200).json({ status: 'ok', restantes: restantes || 0, completada, enviados, fallidos });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
