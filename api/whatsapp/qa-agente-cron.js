/**
 * SUPERVISOR del agente (control de calidad).
 *
 * Lo llama un cron (pg_cron de Supabase) cada 5 minutos. Revisa las conversaciones
 * con la etiqueta AGENTE, mira SOLO lo nuevo que dijo el agente desde la última
 * revisión (marca de agua en `agente_qa_estado`), se lo pasa a Claude junto con el
 * MANUAL del agente para que detecte errores, y si los hay le manda a Mateo un
 * resumen corto por WhatsApp. Si no hay errores, no manda nada.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp, enviarTexto } from '../lib/whatsapp.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELO = 'claude-sonnet-4-6';
const LINEA = '1128258647034751';        // línea de Lili (de donde se envía y donde está la etiqueta)
const REPORTE_A = '573123354789';         // WhatsApp de Mateo (debe tener ventana de 24h abierta con la línea)
const ETIQUETA = 'AGENTE';
const MAX_CONVS = 25;                      // tope de chats por corrida
const MAX_MSGS = 40;                       // mensajes recientes por chat que se le pasan al revisor

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { interno } = req.body || {};
  const { verifyToken } = configWhatsapp();
  if (!verifyToken || interno !== verifyToken) return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ status: 'error', mensaje: 'Falta ANTHROPIC_API_KEY.' });

  const ahora = new Date().toISOString();

  // 1) Etiqueta AGENTE de la línea.
  const { data: et } = await supabase
    .from('etiquetas').select('id').eq('linea_id', LINEA).ilike('nombre', ETIQUETA).maybeSingle();
  if (!et) return res.status(200).json({ status: 'ok', skip: 'No existe la etiqueta ' + ETIQUETA });

  // 2) Marca de agua. La primera vez solo se inicializa (no revisa el historial viejo).
  const { data: est } = await supabaseAdmin
    .from('agente_qa_estado').select('ultimo_revisado_at').eq('linea_id', LINEA).maybeSingle();
  if (!est) {
    await supabaseAdmin.from('agente_qa_estado').insert({ linea_id: LINEA, ultimo_revisado_at: ahora });
    return res.status(200).json({ status: 'ok', inicializado: true });
  }
  const desde = est.ultimo_revisado_at;

  // 3) Conversaciones con la etiqueta.
  const { data: ce } = await supabaseAdmin
    .from('conversacion_etiquetas').select('conversacion_id').eq('etiqueta_id', et.id);
  const convIds = (ce || []).map(r => r.conversacion_id);
  if (!convIds.length) {
    await avanzar(ahora);
    return res.status(200).json({ status: 'ok', sin_chats: true });
  }

  const { data: convs } = await supabaseAdmin
    .from('conversaciones_whatsapp').select('id, telefono, nombre_perfil').in('id', convIds);

  // 4) De cada chat, armar el transcrito reciente SOLO si tiene salida NUEVA del agente.
  const bloques = [];
  for (const c of (convs || []).slice(0, MAX_CONVS)) {
    const { data: nuevos } = await supabaseAdmin
      .from('mensajes_whatsapp').select('id')
      .eq('conversacion_id', c.id).gt('timestamp_wa', desde)
      .in('direccion', ['saliente', 'nota']).limit(1);
    if (!nuevos || !nuevos.length) continue;   // el agente no dijo nada nuevo aquí

    const { data: msgs } = await supabaseAdmin
      .from('mensajes_whatsapp').select('direccion, tipo, texto, timestamp_wa, raw')
      .eq('conversacion_id', c.id)
      .order('timestamp_wa', { ascending: false }).limit(MAX_MSGS);
    const orden = (msgs || []).slice().reverse();
    // Solo cuenta como salida NUEVA de LILIANA si hay un saliente/nota con marca de agente.
    const hayNuevoDeLiliana = orden.some(m =>
      m.timestamp_wa && m.timestamp_wa > desde && (m.direccion === 'nota' || (m.direccion === 'saliente' && m.raw && m.raw.agente === true)));
    if (!hayNuevoDeLiliana) continue;
    const lineas = orden.map(m => {
      const nuevo = (m.timestamp_wa && m.timestamp_wa > desde) ? '[NUEVO] ' : '';
      let quien, txt;
      if (m.direccion === 'entrante') { quien = 'Cliente'; txt = (m.texto || '').trim() || '[' + (m.tipo || 'mensaje') + ']'; }
      else if (m.direccion === 'saliente') {
        // Distinguir Liliana (agente) de un asesor HUMANO que tomó el chat (marca raw.agente).
        quien = (m.raw && m.raw.agente === true) ? 'Liliana' : 'Asesor humano';
        txt = (m.texto || '').trim() || '[' + (m.tipo || '') + ']';
      } else { quien = '(nota de Liliana)'; txt = (m.texto || '').trim(); }
      if (!txt) return null;
      return `${nuevo}${quien}: ${txt}`;
    }).filter(Boolean).join('\n');
    if (lineas) bloques.push(`### Chat con ${c.nombre_perfil || c.telefono} (${c.telefono})\n${lineas}`);
  }

  if (!bloques.length) {
    await avanzar(ahora);
    return res.status(200).json({ status: 'ok', sin_actividad_nueva: true });
  }

  // 5) Manual del agente (para que el revisor juzgue si lo siguió).
  const { data: cfg } = await supabase.from('agente_config').select('prompt').eq('linea_id', LINEA).maybeSingle();
  const libreto = (cfg && cfg.prompt) || '(sin manual)';

  // 6) Revisión con Claude.
  const system =
    'Eres un SUPERVISOR DE CALIDAD del agente de ventas por WhatsApp llamado Liliana (rifa colombiana "Los Plata"). ' +
    'Tu trabajo es detectar ERRORES que cometió Liliana, para avisarle al dueño (Mateo).\n\n' +
    'Este es el MANUAL que Liliana DEBE seguir:\n"""\n' + libreto + '\n"""\n\n' +
    'Te paso varias conversaciones en orden. Los mensajes marcados [NUEVO] son los recientes aún sin revisar: CONCÉNTRATE en esos.\n' +
    'MUY IMPORTANTE — quién dijo cada cosa:\n' +
    '- "Liliana:" = el agente (lo que TÚ debes evaluar).\n' +
    '- "Cliente:" = el cliente. NO es error de Liliana.\n' +
    '- "Asesor humano:" = una PERSONA real (un asesor que tomó el chat después de que Liliana se apagó o lo pasó a un humano). Esto NO es Liliana: NUNCA lo reportes como error de Liliana ni se lo atribuyas a ella.\n' +
    '- "(nota de Liliana): 🌓 (modo sombra) le diría: «X»" = lo que Liliana RESPONDERÍA en modo prueba (evalúala como si lo hubiera dicho).\n' +
    '- "(nota de Liliana): 🤖 ..." = acciones que Liliana hizo o intentó (úsalas como contexto, no como error salvo que sean claramente incorrectas).\n\n' +
    'Reporta SOLO errores CLAROS de LILIANA en lo [NUEVO]: información equivocada o inventada, romper una regla del manual (precios, premios, fechas, registrar con otro número, tocar boletas ajenas, etc.), confundir al cliente, ofrecer algo que no debe, o respuestas raras/robóticas. ' +
    'NO inventes errores; si algo está bien, NO lo menciones. NO juzgues lo que diga el Cliente ni el Asesor humano.\n\n' +
    'Responde EXACTAMENTE así:\n' +
    '- Si NO hay errores: escribe solo  SIN ERRORES\n' +
    '- Si hay errores: una lista corta (un error por línea, empezando con "• "), con el nombre del cliente entre paréntesis. Breve y concreto, máximo ~10 líneas.';

  let reporte = '';
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 800, system, messages: [{ role: 'user', content: bloques.join('\n\n') }] }),
    });
    const data = await resp.json();
    if (data.error) return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') });   // no avanza la marca: reintenta
    reporte = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  } catch (e) {
    return res.status(200).json({ status: 'error', mensaje: e.message });   // no avanza la marca
  }

  // 7) Si hay errores, mandar el resumen a Mateo.
  let enviado = false, errorEnvio = null;
  const hayErrores = reporte && !/^\s*SIN ERRORES/i.test(reporte);
  if (hayErrores) {
    const hora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
    const msg = `🔎 *Supervisor del agente* (${hora})\nRevisé las conversaciones con etiqueta ${ETIQUETA} y encontré:\n\n${reporte}`;
    const env = await enviarTexto(REPORTE_A, msg, LINEA);
    enviado = !!env.ok;
    if (!env.ok) errorEnvio = env.error;
  }

  // 8) Avanzar la marca de agua (ya revisamos hasta 'ahora').
  await avanzar(ahora);
  return res.status(200).json({ status: 'ok', revisadas: bloques.length, hay_errores: hayErrores, enviado, errorEnvio });
}

async function avanzar(ts) {
  try {
    await supabaseAdmin.from('agente_qa_estado')
      .update({ ultimo_revisado_at: ts, actualizado_at: ts }).eq('linea_id', LINEA);
  } catch (_) {}
}
