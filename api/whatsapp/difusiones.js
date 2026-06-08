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
import { procesarLoteDifusion } from '../lib/difusion-envio.js';

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

// Calcula la lista de teléfonos según los filtros de audiencia (server-side, en la base).
// filtros = { tipo:'todos'|'etiqueta'|'clientes'|'potenciales', estado_pago?, ciudad?, etiqueta_id? }
// Devuelve [{ telefono, nombre }]. Pagina la función para aguantar líneas enormes.
async function calcularAudiencia(lineaId, filtros) {
  const f = (filtros && typeof filtros === 'object') ? filtros : { tipo: 'todos' };
  const vistos = new Set();
  const out = [];
  const PAGE = 1000;
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await supabaseAdmin
      .rpc('difusion_audiencia', { p_linea: lineaId, p_filtros: f })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data || !data.length) break;
    for (const r of data) {
      if (r.telefono && !vistos.has(r.telefono)) { vistos.add(r.telefono); out.push({ telefono: r.telefono, nombre: r.nombre || '' }); }
    }
    if (data.length < PAGE) break;
  }
  return out;
}

// Construye (desde cero) la cola de destinatarios de una difusión. Devuelve el total.
async function construirCola(dif, lineaId) {
  const audiencia = await calcularAudiencia(lineaId, dif.filtros);
  await supabaseAdmin.from('difusion_destinatarios').delete().eq('difusion_id', dif.id);
  for (let i = 0; i < audiencia.length; i += INSERT_CHUNK) {
    const filas = audiencia.slice(i, i + INSERT_CHUNK).map(a => ({
      difusion_id: dif.id, telefono: a.telefono, nombre: a.nombre || null, estado: 'pendiente',
    }));
    if (filas.length) await supabaseAdmin.from('difusion_destinatarios').insert(filas);
  }
  return audiencia.length;
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
        .select('id, nombre, plantilla_id, variables, filtros, estado, total, enviados, fallidos, creada_por, created_at, completada_at, programada_at, activar_agente, plantillas_whatsapp(nombre, estado)')
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
      const activar_agente = req.body.activar_agente !== false;   // por defecto SÍ (Liliana atiende las respuestas)
      if (!nombre) return res.status(200).json({ status: 'error', mensaje: 'Ponle un nombre a la difusión.' });

      if (accion === 'crear') {
        const { data, error } = await supabaseAdmin
          .from('difusiones')
          .insert({ linea_id, nombre, plantilla_id, variables, filtros, activar_agente, estado: 'borrador', creada_por: nombreAsesor })
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
      if (!['borrador', 'preparada', 'programada'].includes(actual.estado)) {
        return res.status(200).json({ status: 'error', mensaje: 'No se puede editar una difusión que ya empezó a enviarse.' });
      }
      const { data, error } = await supabaseAdmin
        .from('difusiones')
        .update({ nombre, plantilla_id, variables, filtros, activar_agente, estado: 'borrador', programada_at: null })
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

      const total = await construirCola(dif, linea_id);
      await supabaseAdmin.from('difusiones')
        .update({ total, enviados: 0, fallidos: 0, estado: 'preparada', programada_at: null })
        .eq('id', id);
      return res.status(200).json({ status: 'ok', total });
    }

    // Programar el envío para una fecha/hora: arma la cola ya y queda en espera; el cron la envía sola.
    if (accion === 'programar') {
      const { id } = req.body;
      const cuando = req.body.programada_at ? new Date(req.body.programada_at) : null;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la difusión.' });
      if (!cuando || isNaN(cuando.getTime())) return res.status(200).json({ status: 'error', mensaje: 'Elige una fecha y hora válida.' });
      if (cuando.getTime() < Date.now() - 60000) return res.status(200).json({ status: 'error', mensaje: 'Esa hora ya pasó. Elige una más adelante.' });
      const { data: dif } = await supabaseAdmin.from('difusiones').select('*').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!dif) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      if (!dif.plantilla_id) return res.status(200).json({ status: 'error', mensaje: 'Primero elige una plantilla aprobada.' });
      if (!['borrador', 'preparada', 'programada'].includes(dif.estado)) {
        return res.status(200).json({ status: 'error', mensaje: 'Esta difusión ya empezó a enviarse.' });
      }
      const { data: pl } = await supabaseAdmin.from('plantillas_whatsapp').select('estado').eq('id', dif.plantilla_id).eq('linea_id', linea_id).maybeSingle();
      if (!pl || pl.estado !== 'aprobada') return res.status(200).json({ status: 'error', mensaje: 'La plantilla aún no está aprobada por Meta.' });

      const total = await construirCola(dif, linea_id);
      if (!total) return res.status(200).json({ status: 'error', mensaje: 'No hay destinatarios para esos filtros.' });
      await supabaseAdmin.from('difusiones')
        .update({ total, enviados: 0, fallidos: 0, estado: 'programada', programada_at: cuando.toISOString() })
        .eq('id', id);
      return res.status(200).json({ status: 'ok', total, programada_at: cuando.toISOString() });
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
      // Verificar que la difusión es de esta línea (el resto de la lógica vive en el módulo compartido).
      const { data: own } = await supabaseAdmin.from('difusiones').select('id').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!own) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la difusión.' });
      const r = await procesarLoteDifusion(id, { limite, asesor: nombreAsesor });
      if (!r.ok) return res.status(200).json({ status: 'error', mensaje: r.error });
      return res.status(200).json({ status: 'ok', restantes: r.restantes, completada: r.completada, enviados: r.enviados, fallidos: r.fallidos });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
