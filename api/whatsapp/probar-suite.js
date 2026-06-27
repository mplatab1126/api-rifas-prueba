/**
 * SUITE DORADA (H14): corre las conversaciones que YA causaron incidentes reales
 * contra el manual ACTUAL (o contra un manual candidato, antes de guardarlo).
 *
 * Cada caso vive en `agente_casos_dorados`: una mini-conversación + lo que la
 * respuesta NO debe decir (regex `prohibidos`), lo que SÍ debe decir (`requeridos`,
 * usar poco) y, si aplica, la herramienta que DEBE usar (`herramienta_esperada`).
 *
 * El corredor llama a la IA con las MISMAS herramientas del agente real en MODO
 * SECO (las definiciones van, pero nada se ejecuta) y evalúa solo el texto y qué
 * herramienta pidió. Un caso en ROJO = el manual permitiría repetir un incidente.
 *
 * Cómo usarlo (gerencia): POST { contrasena, linea_id, prompt? }
 *   - sin `prompt`: prueba el manual que está EN PRODUCCIÓN.
 *   - con `prompt`: prueba ese manual CANDIDATO sin guardarlo (flujo seguro:
 *     probar → ver verde → recién entonces guardar en la cabina).
 */

import { aplicarCors } from '../lib/cors.js';
import { supabase } from '../lib/supabase.js';
import { validarAsesor } from '../lib/auth.js';
import { esGerencia } from '../lib/asesores.js';
import { TOOLS } from './agente-responder.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const LOTE = 5;          // casos en paralelo (la suite completa tarda ~20-40s)
const MODELOS_OK = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];  // igual que agente-responder.js: probar el MISMO modelo que producción

// Igual que en el motor: rellena {{clave}} con las variables de la línea.
function aplicarVars(texto, vars) {
  const v = vars || {};
  return String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (v[k] == null || v[k] === '') ? '' : String(v[k]));
}

async function correrCaso(caso, { prompt, modelo, apiKey, hoyTxt }) {
  // La conversación del caso → mensajes para la IA (debe empezar con el cliente).
  const msgs = (Array.isArray(caso.mensajes) ? caso.mensajes : []).map(m => ({
    role: m.rol === 'liliana' ? 'assistant' : 'user',
    content: String(m.texto || ''),
  }));
  if (msgs.length && msgs[0].role === 'assistant') msgs.unshift({ role: 'user', content: 'Hola, quiero información de la rifa' });
  if (!msgs.length) return { nombre: caso.nombre, paso: false, error: 'caso sin mensajes' };

  const system = [
    { type: 'text', text: prompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: `\n\n---\nCONTEXTO (no lo menciones literalmente): hoy es ${hoyTxt} (Colombia). Hablas por WhatsApp con un cliente. Tienes herramientas para actuar; úsalas cuando corresponda en vez de inventar.` + (caso.contexto ? `\n\n${caso.contexto}` : '') },
  ];

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'extended-cache-ttl-2025-04-11' },
    body: JSON.stringify({ model: modelo, max_tokens: 700, system, messages: msgs, tools: TOOLS }),
  });
  const data = await resp.json();
  if (data.error) return { nombre: caso.nombre, paso: false, error: 'IA: ' + (data.error.message || 'error') };

  const bloques = data.content || [];
  const texto = bloques.filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n');
  const herramientas = bloques.filter(b => b.type === 'tool_use').map(b => b.name);

  // Los regex se evalúan sin los asteriscos de negrita: "una cosa *o* la otra"
  // debe contar igual que "una cosa o la otra" (tanto requeridos como prohibidos).
  const textoPlano = texto.replace(/\*/g, '');
  const violaciones = (Array.isArray(caso.prohibidos) ? caso.prohibidos : [])
    .filter(rx => { try { return new RegExp(rx, 'i').test(textoPlano); } catch (_) { return false; } });
  const faltantes = (Array.isArray(caso.requeridos) ? caso.requeridos : [])
    .filter(rx => { try { return !new RegExp(rx, 'i').test(textoPlano); } catch (_) { return true; } });
  const herramientaOk = !caso.herramienta_esperada || herramientas.includes(caso.herramienta_esperada);

  return {
    nombre: caso.nombre,
    paso: violaciones.length === 0 && faltantes.length === 0 && herramientaOk,
    violaciones,
    faltantes,
    herramienta_esperada: caso.herramienta_esperada || null,
    herramientas_usadas: herramientas,
    respuesta: texto.slice(0, 400),
  };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, prompt: promptCandidato } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor || !esGerencia(nombreAsesor)) {
    return res.status(401).json({ status: 'error', mensaje: 'Solo gerencia puede correr la suite.' });
  }
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });

  const apiKey = process.env.ANTHROPIC_API_KEY_LILIANA || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ status: 'error', mensaje: 'Falta la llave de la IA.' });

  try {
    const { data: cfg } = await supabase
      .from('agente_config').select('prompt, modelo, nombre_agente, variables').eq('linea_id', linea_id).maybeSingle();
    const base = String(promptCandidato || cfg?.prompt || '').trim();
    if (!base) return res.status(200).json({ status: 'error', mensaje: 'No hay manual para probar.' });
    const prompt = aplicarVars(base, {
      nombre: (cfg?.nombre_agente || '').trim() || 'del equipo de Los Plata',
      ...(cfg?.variables && typeof cfg.variables === 'object' ? cfg.variables : {}),
    });
    const modelo = MODELOS_OK.includes(cfg?.modelo) ? cfg.modelo : 'claude-sonnet-4-6';

    const { data: casos } = await supabase
      .from('agente_casos_dorados').select('*').eq('linea_id', linea_id).eq('activo', true)
      .order('id', { ascending: true });
    if (!casos || !casos.length) return res.status(200).json({ status: 'error', mensaje: 'No hay casos dorados activos.' });

    const hoyTxt = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const resultados = [];
    for (let i = 0; i < casos.length; i += LOTE) {
      const tanda = casos.slice(i, i + LOTE);
      const r = await Promise.all(tanda.map(c =>
        correrCaso(c, { prompt, modelo, apiKey, hoyTxt }).catch(e => ({ nombre: c.nombre, paso: false, error: e.message }))
      ));
      resultados.push(...r);
    }

    const pasaron = resultados.filter(r => r.paso).length;
    return res.status(200).json({
      status: 'ok',
      manual: promptCandidato ? 'CANDIDATO (no guardado)' : 'el de producción',
      total: resultados.length,
      pasaron,
      fallaron: resultados.length - pasaron,
      resultados,
    });
  } catch (e) {
    return res.status(200).json({ status: 'error', mensaje: e.message });
  }
}
