/**
 * MOTOR DE FLUJOS (Fase 2) — ejecuta un flujo guardado con un cliente real por WhatsApp.
 *
 * Lo llama `api/whatsapp/recibir.js` cuando entra un mensaje del cliente, ANTES de
 * disparar a Liliana. Regla de oro: un chat lo lleva el flujo O Liliana, nunca los dos.
 *   - Si el chat tiene una sesión de flujo activa → avanza el flujo con la respuesta.
 *   - Si no, y el mensaje DISPARA un flujo activo (palabra clave o contacto nuevo) → lo arranca.
 *   - Si nada de eso → devuelve false y el webhook sigue como hoy (Liliana).
 *
 * SEGURIDAD: nada corre salvo que el interruptor `flujos_modo` (tabla configuracion)
 * esté en 'prueba' (solo números de `flujos_numeros_prueba`) o 'vivo' (todos).
 * Por defecto 'off' = ningún flujo corre, aunque esté marcado "Activo".
 *
 * Solo ejecuta los 5 nodos base: Mensaje (texto/botones/lista), Pregunta, Acción,
 * Condición, Ir a otro flujo. (Reconoce los tipos viejos botones/lista por compatibilidad.)
 * NO implementado aún (Fase 2b): el "no respondió en X horas" de Pregunta (necesita un cron).
 */

import { supabaseAdmin } from './supabase.js';
import { obtenerConfig } from './configuracion.js';
import { enviarTexto, enviarImagen, enviarBotones, enviarLista } from './whatsapp.js';
import { ponerEtiqueta } from './etiquetas.js';
import { consultarPorLinea } from './integracion-datos.js';

const MAX_PASOS = 40;   // tope anti-bucle por turno
const sol10 = t => String(t || '').replace(/\D/g, '').slice(-10);

function interpolar(t, vars) {
  return String(t || '').replace(/{{\s*([\w-]+)\s*}}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

// Validadores de la cajita Pregunta (mismo criterio que el simulador).
const VALIDA = {
  texto: () => true,
  numero: t => /\d/.test(t) && /^[\s$.,\d-]+$/.test(t),
  telefono: t => t.replace(/\D/g, '').length >= 7,
  correo: t => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim()),
};

function nodoInicio(grafo) { return Object.values(grafo).find(n => n.name === 'inicio'); }
function siguiente(grafo, nodo, salida) {
  const conns = nodo?.outputs?.[salida || 'output_1']?.connections || [];
  return conns.length ? (grafo[conns[0].node] || null) : null;
}
function grafoDe(flujo) { return (flujo && flujo.grafo && flujo.grafo.drawflow && flujo.grafo.drawflow.Home && flujo.grafo.drawflow.Home.data) || {}; }

// ── Interruptor de seguridad ────────────────────────────────────────────────
async function permitidoCorrer(telefono) {
  const modo = (await obtenerConfig('flujos_modo')) || 'off';
  if (modo === 'vivo') return true;
  if (modo === 'prueba') {
    const lista = (await obtenerConfig('flujos_numeros_prueba')) || '';
    const nums = lista.split(',').map(sol10).filter(Boolean);
    return nums.includes(sol10(telefono));
  }
  return false;
}

async function cargarFlujo(id, lineaId) {
  const { data } = await supabaseAdmin.from('flujos').select('id, grafo').eq('id', id).eq('linea_id', lineaId).maybeSingle();
  return data;
}
async function guardarSesion(id, campos) {
  await supabaseAdmin.from('flujo_sesiones').update({ ...campos, actualizado_at: new Date().toISOString() }).eq('id', id);
}

// Deja rastro del mensaje saliente en el chat (para que aparezca en la bandeja).
async function registrarSaliente(conv, telefono, lineaId, texto, waId) {
  const ts = new Date().toISOString();
  try {
    await supabaseAdmin.from('mensajes_whatsapp').insert({
      conversacion_id: conv.id, telefono, linea_id: lineaId,
      direccion: 'saliente', tipo: 'text', texto, wa_message_id: waId || null,
      estado_envio: 'enviado', timestamp_wa: ts,
    });
    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ ultimo_mensaje: String(texto || '').slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
      .eq('id', conv.id);
  } catch (_) {}
}
async function quitarEtiqueta(conversacionId, lineaId, nombre) {
  try {
    if (!nombre) return;
    const { data: et } = await supabaseAdmin.from('etiquetas').select('id').eq('linea_id', lineaId).ilike('nombre', nombre).maybeSingle();
    if (et) await supabaseAdmin.from('conversacion_etiquetas').delete().eq('conversacion_id', conversacionId).eq('etiqueta_id', et.id);
  } catch (_) {}
}

// ¿El nodo espera respuesta del cliente?
function esperaRespuesta(nodo) {
  if (!nodo) return false;
  if (nodo.name === 'pregunta' || nodo.name === 'lista' || nodo.name === 'botones') return true;
  if (nodo.name === 'mensaje') return nodo.data?.respuesta === 'botones' || nodo.data?.respuesta === 'lista';
  return false;
}

// Envía el "prompt" de un nodo que espera (la pregunta o el menú con opciones).
async function enviarPrompt(nodo, conv, telefono, lineaId, vars) {
  const d = nodo.data || {};
  const texto = interpolar(d.texto, vars) || '...';
  const modo = nodo.name === 'mensaje' ? d.respuesta : nodo.name;
  let env;
  if (modo === 'botones') {
    const btns = [d.btn1, d.btn2, d.btn3].map(b => interpolar(b, vars).trim()).filter(Boolean);
    env = await enviarBotones(telefono, texto, btns, lineaId);
  } else if (modo === 'lista') {
    const ops = (d.opciones || '').split('\n').map(o => interpolar(o, vars).trim()).filter(Boolean).slice(0, 10);
    env = await enviarLista(telefono, texto, ops, lineaId);
  } else { // pregunta
    const saltar = interpolar(d.saltar || '', vars).trim();
    env = saltar ? await enviarBotones(telefono, texto, [saltar], lineaId) : await enviarTexto(telefono, texto, lineaId);
  }
  await registrarSaliente(conv, telefono, lineaId, texto, env?.wa_message_id);
}

// Resuelve un nodo que estaba esperando, con la respuesta del cliente.
// Devuelve { salida } para seguir, o { reintentar:true, mensaje } para repreguntar.
function resolverEspera(nodo, texto, vars) {
  const d = nodo.data || {};
  const resp = String(texto || '').trim();
  vars.__ultima = resp;
  const modo = nodo.name === 'mensaje' ? d.respuesta : nodo.name;

  if (modo === 'botones') {
    const btns = [d.btn1, d.btn2, d.btn3].map(b => interpolar(b, vars).trim());
    const idx = btns.findIndex(b => b && b.toLowerCase() === resp.toLowerCase());
    return { salida: 'output_' + (idx >= 0 ? idx + 1 : 4) };
  }
  if (modo === 'lista') {
    const ops = (d.opciones || '').split('\n').map(o => interpolar(o, vars).trim()).filter(Boolean);
    const eligio = ops.find(o => o.toLowerCase() === resp.toLowerCase());
    if (eligio && d.campo) vars[d.campo] = eligio;
    return { salida: eligio ? 'output_1' : 'output_2' };
  }
  // pregunta
  const saltar = interpolar(d.saltar || '', vars).trim();
  if (saltar && resp.toLowerCase() === saltar.toLowerCase()) return { salida: 'output_1' };
  const tipo = d.tipo || 'texto';
  if (!VALIDA[tipo](resp)) {
    const clave = '__intentos_' + nodo.id;
    const n = (Number(vars[clave]) || 0) + 1;
    vars[clave] = n;
    if (n > Number(d.reintentos ?? 3)) { delete vars[clave]; return { salida: 'output_2' }; }   // agotó reintentos
    return { reintentar: true, mensaje: interpolar(d.texto, vars) };
  }
  delete vars['__intentos_' + nodo.id];
  if (d.campo) vars[d.campo] = resp;
  return { salida: 'output_1' };
}

function evaluarCondicion(d, vars) {
  const origen = d.origen === 'campo' ? String(vars[d.campo_cond] ?? '') : String(vars.__ultima ?? '');
  const op = d.operador || 'contiene';
  const valor = interpolar(d.palabra || '', vars);
  if (op === 'contiene' || op === 'no_contiene') {
    const palabras = valor.toLowerCase().split(',').map(p => p.trim()).filter(Boolean);
    const tiene = palabras.some(p => origen.toLowerCase().includes(p));
    return op === 'contiene' ? tiene : !tiene;
  }
  if (op === 'es') return origen.trim().toLowerCase() === valor.trim().toLowerCase();
  if (op === 'mayor' || op === 'menor') {
    const a = parseFloat(String(origen).replace(/[^\d.-]/g, '')), b = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    return !isNaN(a) && !isNaN(b) && (op === 'mayor' ? a > b : a < b);
  }
  if (op === 'vacio') return !origen.trim();
  return false;
}

// Corre desde un nodo hasta toparse con uno que espera respuesta, o el fin del flujo.
async function correr(grafo, startNodo, ctx) {
  const { conv, telefono, lineaId } = ctx;
  const vars = ctx.vars;
  let nodo = startNodo, pasos = 0;
  while (nodo && pasos < MAX_PASOS) {
    pasos++;
    const d = nodo.data || {};
    if (esperaRespuesta(nodo)) {
      await enviarPrompt(nodo, conv, telefono, lineaId, vars);
      await guardarSesion(ctx.sesionId, { nodo_actual: nodo.id, estado: 'esperando', variables: vars, flujo_id: ctx.flujoId });
      return;
    }
    switch (nodo.name) {
      case 'inicio': nodo = siguiente(grafo, nodo); break;
      case 'mensaje': {
        const texto = interpolar(d.texto, vars);
        const env = (d.adjunto === 'imagen' && d.adjunto_url)
          ? await enviarImagen(telefono, d.adjunto_url, texto, lineaId)
          : await enviarTexto(telefono, texto || '...', lineaId);
        await registrarSaliente(conv, telefono, lineaId, texto || '[adjunto]', env?.wa_message_id);
        nodo = siguiente(grafo, nodo); break;
      }
      case 'accion': {
        if (d.accion === 'establecer_campo') { if (d.campo) vars[d.campo] = interpolar(d.valor, vars); }
        else if (d.accion === 'quitar_etiqueta') { await quitarEtiqueta(conv.id, lineaId, d.etiqueta); }
        else { await ponerEtiqueta(conv.id, lineaId, d.etiqueta); }
        nodo = siguiente(grafo, nodo); break;
      }
      case 'condicion':
        nodo = siguiente(grafo, nodo, evaluarCondicion(d, vars) ? 'output_1' : 'output_2'); break;
      case 'irflujo': {
        const otro = d.flujo ? await cargarFlujo(d.flujo, lineaId) : null;
        if (!otro) { nodo = null; break; }
        ctx.flujoId = otro.id;
        await guardarSesion(ctx.sesionId, { flujo_id: otro.id, variables: vars });
        const g2 = grafoDe(otro);
        return await correr(g2, nodoInicio(g2), ctx);
      }
      default: nodo = siguiente(grafo, nodo);
    }
  }
  await guardarSesion(ctx.sesionId, { estado: 'terminado', variables: vars });
}

// ¿Algún flujo ACTIVO de la línea se dispara con este mensaje? Devuelve el flujo (con grafo) o null.
async function flujoQueDispara(lineaId, texto, esNueva) {
  const { data: flujos } = await supabaseAdmin
    .from('flujos').select('id, disparador, palabras, grafo').eq('linea_id', lineaId).eq('estado', 'activo');
  if (!flujos || !flujos.length) return null;
  const t = String(texto || '').toLowerCase();
  for (const f of flujos) {
    if (f.disparador === 'nuevo_contacto') { if (esNueva) return f; continue; }
    const palabras = String(f.palabras || '').toLowerCase().split(',').map(p => p.trim()).filter(Boolean);
    if (palabras.some(p => t.includes(p))) return f;
  }
  return null;
}

/**
 * Procesa un mensaje entrante con el motor de flujos.
 * Devuelve true si un flujo lo manejó (entonces NO se dispara a Liliana), false si no.
 */
export async function procesarFlujo(telefono, lineaId, texto, esNueva) {
  try {
    if (!(await permitidoCorrer(telefono))) return false;

    const { data: conv } = await supabaseAdmin.from('conversaciones_whatsapp')
      .select('id, estado, nombre_perfil').eq('telefono', telefono).eq('linea_id', lineaId).maybeSingle();
    if (!conv || conv.estado === 'humano') return false;   // un humano tomó el chat → ni flujo ni agente

    // ¿Sesión de flujo activa para este chat?
    const { data: ses } = await supabaseAdmin.from('flujo_sesiones')
      .select('*').eq('conversacion_id', conv.id).in('estado', ['corriendo', 'esperando'])
      .order('actualizado_at', { ascending: false }).limit(1).maybeSingle();

    if (ses) {
      const flujo = await cargarFlujo(ses.flujo_id, lineaId);
      if (!flujo) { await guardarSesion(ses.id, { estado: 'cancelado' }); return false; }
      const grafo = grafoDe(flujo);
      const vars = ses.variables || {};
      const nodo = grafo[ses.nodo_actual];
      if (!nodo) { await guardarSesion(ses.id, { estado: 'terminado' }); return false; }
      const ctx = { conv, telefono, lineaId, vars, sesionId: ses.id, flujoId: flujo.id };
      const r = resolverEspera(nodo, texto, vars);
      if (r.reintentar) {
        if (r.mensaje) { const env = await enviarTexto(telefono, r.mensaje, lineaId); await registrarSaliente(conv, telefono, lineaId, r.mensaje, env?.wa_message_id); }
        await guardarSesion(ses.id, { variables: vars });
        return true;
      }
      await correr(grafo, siguiente(grafo, nodo, r.salida), ctx);
      return true;
    }

    // ¿Arranca un flujo?
    const flujo = await flujoQueDispara(lineaId, texto, esNueva);
    if (!flujo) return false;

    // El flujo toma el chat: Liliana fuera (agente_activo=false), marca 'bot'.
    await supabaseAdmin.from('conversaciones_whatsapp').update({ agente_activo: false, estado: 'bot' }).eq('id', conv.id);
    const vars = { nombre: (conv.nombre_perfil || '').split(' ')[0] || '' };
    // Cargar los datos del contacto desde la fuente conectada (Sheets/Supabase), si hay,
    // para que las condiciones puedan usar {{total_abonado}}, {{saldo}}, {{boleta}}, etc.
    try { const d = await consultarPorLinea(lineaId, telefono); if (d && d.campos) Object.assign(vars, d.campos); } catch (_) {}
    const { data: nueva } = await supabaseAdmin.from('flujo_sesiones')
      .upsert({ linea_id: lineaId, flujo_id: flujo.id, conversacion_id: conv.id, nodo_actual: null, variables: vars, estado: 'corriendo', actualizado_at: new Date().toISOString() },
        { onConflict: 'flujo_id,conversacion_id' })
      .select('id').single();
    if (!nueva) return false;
    const grafo = grafoDe(flujo);
    const ctx = { conv, telefono, lineaId, vars, sesionId: nueva.id, flujoId: flujo.id };
    await correr(grafo, nodoInicio(grafo), ctx);
    return true;
  } catch (e) {
    console.error('[flujo-motor] error:', e.message || e);
    return false;   // ante cualquier error, dejar que siga el flujo normal (Liliana); no romper el webhook
  }
}
