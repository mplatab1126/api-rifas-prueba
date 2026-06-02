/**
 * Respuestas rápidas de la bandeja (compartidas por línea).
 *
 * Cada respuesta es un MINI-FLUJO: una lista ordenada de "pasos", donde cada
 * paso es texto o una imagen (por URL). Acciones:
 *   listar   → respuestas de la línea (con sus pasos)
 *   crear    → { titulo, pasos }
 *   editar   → { id, titulo, pasos }
 *   eliminar → { id }
 *   enviar   → { id, telefono } → manda todos los pasos en orden al cliente
 *
 * pasos = [ { tipo:'texto', texto }, { tipo:'imagen', url, texto(caption) }, ... ]
 *
 * Recibe (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarImagen, enviarImagenPorId, subirMediaDesdeUrl } from '../lib/whatsapp.js';

const MAX_TITULO = 60;
const MAX_TEXTO = 4096;   // límite de texto de WhatsApp
const MAX_URL = 2048;
const MAX_PASOS = 20;     // tope sano de mensajes por flujo

// Limpia y valida la lista de pasos que llega del navegador.
function sanitizarPasos(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    if (p.tipo === 'imagen') {
      const url = String(p.url || '').trim().slice(0, MAX_URL);
      if (!/^https?:\/\//i.test(url)) continue;   // imagen sin URL válida → se descarta
      out.push({ tipo: 'imagen', url, texto: String(p.texto || '').trim().slice(0, MAX_TEXTO) });
    } else {
      const texto = String(p.texto || '').trim().slice(0, MAX_TEXTO);
      if (!texto) continue;                        // texto vacío → se descarta
      out.push({ tipo: 'texto', texto });
    }
    if (out.length >= MAX_PASOS) break;
  }
  return out;
}

// Encuentra la conversación (o la crea) y devuelve su id.
async function asegurarConv(telefono, lineaId, asesor) {
  let b = supabaseAdmin.from('conversaciones_whatsapp').select('id').eq('telefono', telefono);
  b = lineaId ? b.eq('linea_id', lineaId) : b.is('linea_id', null);
  const { data } = await b.maybeSingle();
  if (data) return data.id;
  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert({ telefono, linea_id: lineaId || null, ultimo_entrante: false, estado: 'humano', asesor_asignado: asesor })
    .select('id')
    .single();
  return nueva ? nueva.id : null;
}

// Sube a Meta las imágenes del flujo UNA sola vez y guarda su media_id en cada
// paso. Así, al usar la respuesta, las fotos ya están en Meta y se envían al
// instante (no se re-suben cada vez). Se llama al crear/editar la respuesta.
async function prepararMedia(pasos, lineaId) {
  await Promise.all((pasos || []).map(async (p) => {
    if (p.tipo === 'imagen' && p.url) {
      const sub = await subirMediaDesdeUrl(p.url, lineaId);
      if (sub && sub.ok) p.media_id = sub.media_id;
    }
  }));
}

// Best-effort: si una imagen se tuvo que re-subir al enviar (porque su id venció),
// guarda el id nuevo para que la próxima vez vuelva a ser instantáneo.
async function refrescarMediaId(respuestaId, lineaId, idx, nuevoId) {
  const { data } = await supabaseAdmin.from('respuestas_rapidas').select('pasos').eq('id', respuestaId).eq('linea_id', lineaId).maybeSingle();
  if (data && Array.isArray(data.pasos) && data.pasos[idx] && data.pasos[idx].tipo === 'imagen') {
    data.pasos[idx].media_id = nuevoId;
    await supabaseAdmin.from('respuestas_rapidas').update({ pasos: data.pasos }).eq('id', respuestaId).eq('linea_id', lineaId);
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    if (accion === 'listar') {
      const { data } = await supabase
        .from('respuestas_rapidas')
        .select('id, titulo, texto, pasos')
        .eq('linea_id', linea_id)
        .order('titulo', { ascending: true });
      return res.status(200).json({ status: 'ok', respuestas: data || [] });
    }

    if (accion === 'crear' || accion === 'editar') {
      const titulo = String(req.body.titulo || '').trim().slice(0, MAX_TITULO);
      const pasos = sanitizarPasos(req.body.pasos);
      if (!titulo) return res.status(200).json({ status: 'error', mensaje: 'Falta el título.' });
      if (!pasos.length) return res.status(200).json({ status: 'error', mensaje: 'Agrega al menos un mensaje (texto o imagen con URL).' });

      // Subir las imágenes a Meta UNA vez y guardar su id (envío luego instantáneo).
      await prepararMedia(pasos, linea_id);

      if (accion === 'crear') {
        const { data, error } = await supabaseAdmin
          .from('respuestas_rapidas')
          .insert({ linea_id, titulo, pasos })
          .select('id, titulo, texto, pasos')
          .single();
        if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
        return res.status(200).json({ status: 'ok', respuesta: data });
      }

      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la respuesta a editar.' });
      const { data, error } = await supabaseAdmin
        .from('respuestas_rapidas')
        .update({ titulo, pasos })
        .eq('id', id)
        .eq('linea_id', linea_id)
        .select('id, titulo, texto, pasos')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', respuesta: data });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la respuesta a eliminar.' });
      await supabaseAdmin.from('respuestas_rapidas').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    // Envía UN solo paso (texto o imagen). El navegador llama esto una vez por
    // paso, en orden, para que cada mensaje aparezca al instante y no haya una
    // sola petición larga que el navegador corte por tiempo.
    if (accion === 'enviar-paso') {
      const telefono = String(req.body.telefono || '').trim();
      const tipo = req.body.tipo === 'imagen' ? 'imagen' : 'texto';
      const texto = String(req.body.texto || '').trim().slice(0, MAX_TEXTO);
      const url = String(req.body.url || '').trim().slice(0, MAX_URL);
      const mediaIdCache = String(req.body.media_id || '').trim();
      const respuestaId = req.body.respuesta_id || null;
      const pasoIdx = Number.isInteger(req.body.paso_idx) ? req.body.paso_idx : null;
      if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono.' });
      if (tipo === 'texto' && !texto) return res.status(200).json({ status: 'error', mensaje: 'Mensaje de texto vacío.' });
      if (tipo === 'imagen' && !/^https?:\/\//i.test(url)) return res.status(200).json({ status: 'error', mensaje: 'La imagen no tiene una URL válida.' });

      let env;
      if (tipo === 'imagen') {
        // 1) Intentar con la imagen YA subida a Meta (instantáneo)
        if (mediaIdCache) env = await enviarImagenPorId(telefono, mediaIdCache, texto, linea_id);
        // 2) Si no había id o falló (p.ej. venció a los 30 días), subirla y refrescar el id guardado
        if (!mediaIdCache || !env || !env.ok) {
          const sub = await subirMediaDesdeUrl(url, linea_id);
          if (sub && sub.ok) {
            env = await enviarImagenPorId(telefono, sub.media_id, texto, linea_id);
            if (env && env.ok && respuestaId && pasoIdx !== null) refrescarMediaId(respuestaId, linea_id, pasoIdx, sub.media_id).catch(() => {});
          } else if (!env || !env.ok) {
            env = await enviarImagen(telefono, url, texto, linea_id);   // último respaldo: por link
          }
        }
      } else {
        env = await enviarTexto(telefono, texto, linea_id);
      }
      if (!env || !env.ok) return res.status(200).json({ status: 'error', mensaje: (env && env.error) || 'No se pudo enviar.' });

      const conversacion_id = await asegurarConv(telefono, linea_id, nombre);
      const ts = new Date().toISOString();
      await supabaseAdmin.from('mensajes_whatsapp').insert({
        conversacion_id, telefono, linea_id: linea_id || null,
        direccion: 'saliente', tipo: tipo === 'imagen' ? 'image' : 'text',
        texto: tipo === 'imagen' ? (texto || null) : texto,
        media_url: tipo === 'imagen' ? url : null,
        wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts, raw: env.raw,
      });
      let upd = supabaseAdmin.from('conversaciones_whatsapp')
        .update({ ultimo_mensaje: String(tipo === 'imagen' ? (texto || '📷 Foto') : texto).slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
        .eq('telefono', telefono);
      upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
      await upd;

      return res.status(200).json({ status: 'ok', wa_message_id: env.wa_message_id });
    }

    if (accion === 'enviar') {
      const telefono = String(req.body.telefono || '').trim();
      const { id } = req.body;
      if (!id || !telefono) return res.status(200).json({ status: 'error', mensaje: 'Faltan datos para enviar.' });

      const { data: rr } = await supabaseAdmin
        .from('respuestas_rapidas')
        .select('pasos, texto')
        .eq('id', id)
        .eq('linea_id', linea_id)
        .maybeSingle();
      if (!rr) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la respuesta.' });

      let pasos = Array.isArray(rr.pasos) ? rr.pasos : [];
      if (!pasos.length && rr.texto) pasos = [{ tipo: 'texto', texto: rr.texto }];
      pasos = sanitizarPasos(pasos);
      if (!pasos.length) return res.status(200).json({ status: 'error', mensaje: 'La respuesta no tiene mensajes.' });

      // 1) Subir TODAS las imágenes a Meta primero (en paralelo). Así quedan en
      //    sus servidores y se entregan al instante, en el orden correcto, sin la
      //    demora de "descargar el link" que descuadraba los mensajes.
      const medias = await Promise.all(pasos.map(p =>
        p.tipo === 'imagen' ? subirMediaDesdeUrl(p.url, linea_id) : Promise.resolve(null)
      ));

      const conversacion_id = await asegurarConv(telefono, linea_id, nombre);
      let enviados = 0;
      const errores = [];
      let ultimoPreview = '';
      const ESPERA_MS = 1200; // pausa entre mensajes, para asegurar el orden de llegada

      for (let i = 0; i < pasos.length; i++) {
        const p = pasos[i];
        const esImg = p.tipo === 'imagen';
        let env;
        if (esImg) {
          const media = medias[i];
          env = (media && media.ok)
            ? await enviarImagenPorId(telefono, media.media_id, p.texto, linea_id)
            : await enviarImagen(telefono, p.url, p.texto, linea_id);   // respaldo: por link
        } else {
          env = await enviarTexto(telefono, p.texto, linea_id);
        }
        if (!env.ok) { errores.push((esImg ? 'Imagen' : 'Texto') + ': ' + env.error); continue; }

        const ts = new Date().toISOString();
        await supabaseAdmin.from('mensajes_whatsapp').insert({
          conversacion_id,
          telefono,
          linea_id: linea_id || null,
          direccion: 'saliente',
          tipo: esImg ? 'image' : 'text',
          texto: esImg ? (p.texto || null) : p.texto,
          media_url: esImg ? p.url : null,
          wa_message_id: env.wa_message_id,
          estado_envio: 'enviado',
          timestamp_wa: ts,
          raw: env.raw,
        });
        enviados++;
        ultimoPreview = esImg ? (p.texto || '📷 Foto') : p.texto;

        // Esperar antes del siguiente (no después del último) para que lleguen en orden.
        if (i < pasos.length - 1) await new Promise(r => setTimeout(r, ESPERA_MS));
      }

      if (enviados > 0) {
        let upd = supabaseAdmin
          .from('conversaciones_whatsapp')
          .update({ ultimo_mensaje: String(ultimoPreview || '').slice(0, 200), ultimo_at: new Date().toISOString(), ultimo_entrante: false })
          .eq('telefono', telefono);
        upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
        await upd;
      }

      return res.status(200).json({ status: 'ok', enviados, fallidos: errores.length, errores });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
