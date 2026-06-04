/**
 * Plantillas de WhatsApp (mensajes aprobados por Meta) para las difusiones.
 *
 * WhatsApp solo permite escribirle a un cliente "en frío" (fuera de la ventana
 * de 24h) usando una PLANTILLA que Meta haya aprobado primero. Aquí se crean,
 * se listan y se consulta su estado.
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, ... }
 *   listar      → plantillas de la línea (desde nuestra base)
 *   crear       → { nombre, categoria, idioma, encabezado?, cuerpo, pie?, ejemplo_variables? }
 *                 → la manda a revisión a Meta y la guarda
 *   sincronizar → le pregunta a Meta el estado de cada plantilla y lo actualiza
 *   eliminar    → { id } → la borra en Meta y en la base
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import {
  construirComponentesPlantilla,
  crearPlantillaMeta,
  listarPlantillasMeta,
  eliminarPlantillaMeta,
  enviarPlantilla,
} from '../lib/whatsapp.js';

const MAX_NOMBRE = 60;
const MAX_TEXTO = 1024;   // límite del cuerpo de una plantilla
const MAX_CORTO = 60;     // header / footer

// Traduce el estado de Meta (en inglés, mayúsculas) a nuestras palabras simples.
function mapEstado(s) {
  const m = {
    APPROVED: 'aprobada',
    PENDING: 'pendiente',
    IN_APPEAL: 'pendiente',
    PENDING_DELETION: 'pendiente',
    REJECTED: 'rechazada',
    PAUSED: 'pausada',
    DISABLED: 'pausada',
  };
  return m[String(s || '').toUpperCase()] || 'desconocido';
}

// El nombre de una plantilla en Meta debe ser minúsculas, números y guiones bajos.
function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita tildes
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_NOMBRE);
}

// Reemplaza los tokens {nombre}/{telefono} por los datos reales del cliente
// (mismo criterio que las campañas). Cualquier otro texto se deja igual.
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
        .from('plantillas_whatsapp')
        .select('id, nombre, categoria, idioma, encabezado, cuerpo, pie, estado, motivo_rechazo, created_at')
        .eq('linea_id', linea_id)
        .order('created_at', { ascending: false });
      return res.status(200).json({ status: 'ok', plantillas: data || [] });
    }

    if (accion === 'crear') {
      const nombre = normalizarNombre(req.body.nombre);
      const cuerpo = String(req.body.cuerpo || '').trim().slice(0, MAX_TEXTO);
      const categoria = ['MARKETING', 'UTILITY'].includes(String(req.body.categoria || '').toUpperCase())
        ? String(req.body.categoria).toUpperCase() : 'MARKETING';
      const idioma = String(req.body.idioma || 'es').trim().slice(0, 12) || 'es';
      const encabezado = String(req.body.encabezado || '').trim().slice(0, MAX_CORTO) || null;
      const pie = String(req.body.pie || '').trim().slice(0, MAX_CORTO) || null;
      const ejemplo_variables = Array.isArray(req.body.ejemplo_variables) ? req.body.ejemplo_variables : null;

      if (!nombre) return res.status(200).json({ status: 'error', mensaje: 'El nombre quedó vacío. Usa letras y números.' });
      if (!cuerpo) return res.status(200).json({ status: 'error', mensaje: 'Escribe el cuerpo del mensaje.' });

      // No repetir nombre en la misma línea.
      const { data: existe } = await supabase
        .from('plantillas_whatsapp').select('id').eq('linea_id', linea_id).eq('nombre', nombre).maybeSingle();
      if (existe) return res.status(200).json({ status: 'error', mensaje: 'Ya tienes una plantilla con ese nombre en esta línea.' });

      // 1) Crearla en Meta (la manda a revisión).
      const componentes = construirComponentesPlantilla({ encabezado, cuerpo, pie, ejemplo_variables });
      const meta = await crearPlantillaMeta(linea_id, { nombre, categoria, idioma, componentes });
      if (!meta.ok) return res.status(200).json({ status: 'error', mensaje: 'Meta rechazó la plantilla: ' + meta.error });

      // 2) Guardarla en nuestra base con el estado que devolvió Meta (normalmente "pendiente").
      const { data, error } = await supabaseAdmin
        .from('plantillas_whatsapp')
        .insert({
          linea_id, nombre, categoria, idioma, encabezado, cuerpo, pie,
          ejemplo_variables, meta_template_id: meta.id || null,
          estado: mapEstado(meta.estado) === 'desconocido' ? 'pendiente' : mapEstado(meta.estado),
        })
        .select('id, nombre, categoria, idioma, encabezado, cuerpo, pie, estado, motivo_rechazo, created_at')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', plantilla: data });
    }

    if (accion === 'sincronizar') {
      const meta = await listarPlantillasMeta(linea_id);
      if (!meta.ok) return res.status(200).json({ status: 'error', mensaje: 'No se pudo consultar a Meta: ' + meta.error });

      // Mapa nombre → estado/razón según Meta.
      const porNombre = {};
      for (const p of meta.plantillas) porNombre[p.name] = p;

      const { data: nuestras } = await supabaseAdmin
        .from('plantillas_whatsapp').select('id, nombre, estado').eq('linea_id', linea_id);

      let actualizadas = 0;
      for (const pl of (nuestras || [])) {
        const m = porNombre[pl.nombre];
        if (!m) continue;
        const nuevoEstado = mapEstado(m.status);
        const motivo = m.rejected_reason && m.rejected_reason !== 'NONE' ? String(m.rejected_reason) : null;
        if (nuevoEstado !== pl.estado || motivo) {
          await supabaseAdmin.from('plantillas_whatsapp')
            .update({ estado: nuevoEstado, motivo_rechazo: motivo, updated_at: new Date().toISOString() })
            .eq('id', pl.id);
          actualizadas++;
        }
      }

      const { data } = await supabase
        .from('plantillas_whatsapp')
        .select('id, nombre, categoria, idioma, encabezado, cuerpo, pie, estado, motivo_rechazo, created_at')
        .eq('linea_id', linea_id)
        .order('created_at', { ascending: false });
      return res.status(200).json({ status: 'ok', actualizadas, plantillas: data || [] });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la plantilla a eliminar.' });
      const { data: pl } = await supabaseAdmin
        .from('plantillas_whatsapp').select('nombre').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!pl) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la plantilla.' });

      // Borrar en Meta (best-effort) y luego en nuestra base.
      const m = await eliminarPlantillaMeta(linea_id, pl.nombre);
      if (!m.ok) return res.status(200).json({ status: 'error', mensaje: 'No se pudo borrar en Meta: ' + m.error });
      await supabaseAdmin.from('plantillas_whatsapp').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    // Enviar una plantilla aprobada a UN chat puntual (para reabrir conversaciones de +24h).
    if (accion === 'enviar-chat') {
      const telefono = String(req.body.telefono || '').replace(/\D/g, '');
      const plantilla_id = req.body.plantilla_id;
      const variables = Array.isArray(req.body.variables) ? req.body.variables : [];
      if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono del chat.' });

      const { data: pl } = await supabaseAdmin
        .from('plantillas_whatsapp').select('nombre, idioma, cuerpo, estado').eq('id', plantilla_id).eq('linea_id', linea_id).maybeSingle();
      if (!pl) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la plantilla.' });
      if (pl.estado !== 'aprobada') return res.status(200).json({ status: 'error', mensaje: 'La plantilla aún no está aprobada por Meta.' });

      // Datos del cliente (para el token {nombre}) y su conversación.
      let bq = supabaseAdmin.from('conversaciones_whatsapp').select('id, nombre_perfil').eq('telefono', telefono);
      bq = linea_id ? bq.eq('linea_id', linea_id) : bq.is('linea_id', null);
      const { data: conv } = await bq.maybeSingle();
      const nombreCliente = (conv && conv.nombre_perfil) || '';

      const params = resolverParametros(variables, { nombre: nombreCliente, telefono });
      const env = await enviarPlantilla(telefono, { nombre: pl.nombre, idioma: pl.idioma, parametros: params }, linea_id);
      if (!env.ok) return res.status(200).json({ status: 'error', mensaje: env.error });

      // Guardar en el historial del chat + actualizar la vista previa de la conversación.
      const ts = new Date().toISOString();
      const cuerpo = textoFinal(pl.cuerpo, params);
      let conversacion_id = conv ? conv.id : null;
      if (!conversacion_id) {
        const { data: nueva } = await supabaseAdmin
          .from('conversaciones_whatsapp')
          .insert({ telefono, linea_id: linea_id || null, ultimo_entrante: false, estado: 'humano', asesor_asignado: nombreAsesor })
          .select('id').single();
        conversacion_id = nueva ? nueva.id : null;
      }
      await supabaseAdmin.from('mensajes_whatsapp').insert({
        conversacion_id, telefono, linea_id: linea_id || null,
        direccion: 'saliente', tipo: 'text', texto: cuerpo,
        wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts,
      });
      let upd = supabaseAdmin.from('conversaciones_whatsapp')
        .update({ ultimo_mensaje: String(cuerpo).slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
        .eq('telefono', telefono);
      upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
      await upd;

      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
