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
// El supervisor usa OPUS (modelo más alto): de nada sirve que Sonnet evalúe a Sonnet. Es 1 sola
// llamada cada 30 min, así que el costo de Opus es bajo y el criterio para juzgar es mejor.
const MODELO = 'claude-opus-4-8';

// "2026-07-04" → "sábado 4 de julio" (día de semana calculado por código, sin líos de zona horaria).
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function etiquetaFecha(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3];
  return `${DIAS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]} ${d} de ${MESES[mo - 1] || ''}`;
}
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

  // 5) Manual del agente (para que el revisor juzgue si lo siguió) + calendario con fechas correctas.
  const { data: cfg } = await supabase.from('agente_config').select('prompt').eq('linea_id', LINEA).maybeSingle();
  const libreto = (cfg && cfg.prompt) || '(sin manual)';

  // Calendario de sorteos con el día de la semana YA calculado, para que el supervisor cache los
  // errores de fecha de Liliana (ej. decir "sábado 7 de junio" cuando el 7 es domingo).
  const { data: rif } = await supabase.from('rifas').select('sorteos').eq('estado', 'activa')
    .order('fecha_inicio', { ascending: false }).limit(1);
  const sorteos = (rif && rif[0] && Array.isArray(rif[0].sorteos)) ? rif[0].sorteos : [];
  const hoyCol = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const bloqueFechas = sorteos.length
    ? '\n\nFECHAS CORRECTAS (calculadas por código; si Liliana dice un día de la semana o una fecha que NO coincide con estas, es un ERROR y debes reportarlo):\n' +
      '- Hoy es ' + etiquetaFecha(hoyCol) + '.\n' +
      sorteos.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
        .map(s => '- ' + String(s.titulo || 'Sorteo').trim() + ' — ' + etiquetaFecha(s.fecha)).join('\n') + '\n'
    : '';

  // 6) Revisión con Claude.
  const system =
    'Eres un SUPERVISOR DE CALIDAD del agente de ventas por WhatsApp llamado Liliana (rifa colombiana "Los Plata"). ' +
    'Tu trabajo es detectar ERRORES que cometió Liliana, para avisarle al dueño (Mateo).\n\n' +
    'Este es el MANUAL que Liliana DEBE seguir:\n"""\n' + libreto + '\n"""\n' + bloqueFechas + '\n' +
    'Te paso varias conversaciones en orden. Los mensajes marcados [NUEVO] son los recientes aún sin revisar: CONCÉNTRATE en esos.\n' +
    'MUY IMPORTANTE — quién dijo cada cosa:\n' +
    '- "Liliana:" = el agente (lo que TÚ debes evaluar).\n' +
    '- "Cliente:" = el cliente. NO es error de Liliana.\n' +
    '- "Asesor humano:" = una PERSONA real (un asesor que tomó el chat después de que Liliana se apagó o lo pasó a un humano). Esto NO es Liliana: NUNCA lo reportes como error de Liliana ni se lo atribuyas a ella.\n' +
    '- "(nota de Liliana): 🌓 (modo sombra) le diría: «X»" = lo que Liliana RESPONDERÍA en modo prueba (evalúala como si lo hubiera dicho).\n' +
    '- "(nota de Liliana): 🤖 ..." = acciones que Liliana hizo o intentó (úsalas como contexto, no como error salvo que sean claramente incorrectas).\n\n' +
    'Reporta SOLO errores CLAROS de LILIANA en lo [NUEVO]: información equivocada o inventada, romper una regla del manual (precios, premios, fechas, registrar con otro número, tocar boletas ajenas, etc.), confundir al cliente, ofrecer algo que no debe, o respuestas raras/robóticas. ' +
    'NO inventes errores; si algo está bien, NO lo menciones. NO juzgues lo que diga el Cliente ni el Asesor humano.\n\n' +
    'Responde SOLO un JSON válido (sin texto antes ni después, sin ```), con esta forma:\n' +
    '{"errores":[{"cliente":"nombre del cliente","error":"qué hizo mal Liliana, MUY corto","regla":"una regla concreta y corta, en imperativo, para AGREGAR al manual de Liliana y que NO vuelva a pasar"}]}\n' +
    'Si NO hay errores: {"errores":[]}. Máximo 5 errores, los más graves. AGRUPA los repetidos en uno. ' +
    'La "regla" debe ser accionable y general (no sobre un cliente puntual), lista para pegar al manual.';

  let crudo = '';
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1000, system, messages: [{ role: 'user', content: bloques.join('\n\n') }] }),
    });
    const data = await resp.json();
    if (data.error) return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') });   // no avanza la marca: reintenta
    crudo = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  } catch (e) {
    return res.status(200).json({ status: 'error', mensaje: e.message });   // no avanza la marca
  }

  // Sacar el JSON de la respuesta (por si viene con texto/``` alrededor).
  let errores = [];
  try {
    const a = crudo.indexOf('{'), b = crudo.lastIndexOf('}');
    const parsed = (a >= 0 && b > a) ? JSON.parse(crudo.slice(a, b + 1)) : { errores: [] };
    if (Array.isArray(parsed.errores)) errores = parsed.errores.slice(0, 5);
  } catch (_) { errores = []; }

  // 7) Guardar cada error como SUGERENCIA (error + regla) para el ciclo de mejora, y avisar a Mateo.
  let enviado = false, errorEnvio = null;
  const hayErrores = errores.length > 0;
  if (hayErrores) {
    const filas = errores.map(e => ({
      linea_id: LINEA,
      cliente: String(e.cliente || '').slice(0, 120) || null,
      error: String(e.error || '').slice(0, 500),
      regla: String(e.regla || '').slice(0, 500),
      estado: 'nuevo',
    })).filter(f => f.error && f.regla);
    if (filas.length) { try { await supabaseAdmin.from('agente_sugerencias').insert(filas); } catch (_) {} }

    const hora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
    const lista = errores.map(e => `• (${String(e.cliente || '').trim() || 'chat'}) ${String(e.error || '').trim()}`).join('\n');
    const msg = `🔎 *Supervisor del agente* (${hora})\nEncontré:\n\n${lista}\n\nRevisa "Mejorar el agente" en la cabina para aplicar las correcciones.`;
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
