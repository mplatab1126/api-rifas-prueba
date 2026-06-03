/**
 * MOTOR del Agente de IA — Fase 1.
 *
 * Lo dispara la bandeja cuando entra un mensaje del cliente en una conversación
 * con el agente ACTIVADO (conversaciones_whatsapp.agente_activo = true). NO se
 * mete en todos los chats: solo donde gerencia lo prendió con el botón.
 *
 * Qué hace (Fase 1):
 *   - Lee el prompt guardado (agente_config) y todo el historial del chat.
 *   - Conversa usando la API de Anthropic con HERRAMIENTAS (tool use).
 *   - Herramientas de Fase 1 (no tocan dinero ni inventario):
 *       · enviar_contacto_inicial → manda la presentación (fotos + precio + premios)
 *       · consultar_disponibles   → números libres reales
 *       · consultar_cliente       → boletas y saldo de un teléfono
 *       · pasar_a_humano          → apaga el agente y avisa que siga un asesor
 *   - Por cada acción deja una NOTA en el propio chat (direccion='nota'),
 *     para que gerencia vea qué hizo, tal como pidió Mateo.
 *
 * Apartar números y registrar abonos (dinero/inventario) son FASE 2.
 *
 * Recibe (POST, JSON): { contrasena, linea_id, telefono }  — SOLO gerencia.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { esGerencia, puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarImagenPorId, enviarImagen } from '../lib/whatsapp.js';
import { numerosDisponibles } from '../lib/numeros-disponibles.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELOS_OK = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const MAX_ITER = 6;          // tope de idas/vueltas con la IA por cada mensaje del cliente
const MAX_HISTORIAL = 40;    // últimos mensajes que lee del chat
const PAUSA_MS = 800;        // entre los pasos del contacto inicial (para que lleguen en orden)

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

function contextoFechaHora() {
  return new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota', weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ── Definición de las herramientas para la IA (Fase 1) ──────────────────────
const TOOLS = [
  {
    name: 'enviar_contacto_inicial',
    description: 'Envía al cliente la presentación inicial de la rifa: el saludo, las fotos de la casa, el precio, cómo separar y la pregunta de si quiere que le expliquen los premios. Úsala UNA sola vez al comienzo, cuando el cliente acaba de llegar y aún no se le ha enviado esa presentación en el chat.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_disponibles',
    description: 'Trae una lista de números de boleta (4 cifras) que están libres ahora mismo, para ofrecérselos al cliente. Úsala cuando el cliente quiera ver los números disponibles.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_cliente',
    description: 'Consulta si un teléfono ya tiene boletas con nosotros y cuánto debe. Si no pasas teléfono, usa el del cliente de este chat.',
    input_schema: {
      type: 'object',
      properties: { telefono: { type: 'string', description: 'Teléfono a consultar (opcional). Por defecto el de este chat.' } },
      required: [],
    },
  },
  {
    name: 'pasar_a_humano',
    description: 'Entrega la conversación a un asesor humano y te apaga en este chat. Úsala cuando el cliente quiere comprar/apartar/pagar, tiene una queja, pide algo que no puedes resolver, o pide hablar con una persona.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Motivo corto del traspaso.' } },
      required: ['motivo'],
    },
  },
];

// ── Guarda un mensaje en el historial del chat (saliente del agente, o nota) ──
async function guardarEnChat(conv, { direccion, tipo = 'text', texto = null, media_url = null, wa_message_id = null }) {
  const ts = new Date().toISOString();
  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id: conv.id, telefono: conv.telefono, linea_id: conv.linea_id,
    direccion, tipo, texto, media_url, wa_message_id,
    estado_envio: direccion === 'nota' ? 'nota' : 'enviado', timestamp_wa: ts, raw: { agente: true },
  });
  // refrescar el preview de la conversación
  if (direccion !== 'nota') {
    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ ultimo_mensaje: String(texto || '📷').slice(0, 200), ultimo_at: ts, ultimo_entrante: false })
      .eq('id', conv.id);
  }
}

// Deja una nota interna (gris) en el chat con lo que hizo el agente.
async function nota(conv, texto) {
  await guardarEnChat(conv, { direccion: 'nota', tipo: 'nota', texto: '🤖 ' + texto });
}

// Envía un texto al cliente por WhatsApp y lo guarda en el chat.
async function decir(conv, texto) {
  const t = String(texto || '').trim();
  if (!t) return;
  const env = await enviarTexto(conv.telefono, t, conv.linea_id);
  await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: t, wa_message_id: env.wa_message_id || null });
}

// ── Ejecutores de cada herramienta. Devuelven texto-resultado para la IA. ────
async function ejecutarHerramienta(nombre, input, conv) {
  if (nombre === 'consultar_disponibles') {
    const { texto } = await numerosDisponibles({ canal: 'bandeja' });
    await nota(conv, 'Consulté los números disponibles.');
    return 'Números disponibles ahora (4 cifras): ' + texto;
  }

  if (nombre === 'consultar_cliente') {
    const tel = String(input?.telefono || conv.telefono || '').replace(/\D/g, '');
    const last10 = tel.slice(-10);
    const { data: boletas } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, total_abonado, clientes (nombre)')
      .like('telefono_cliente', '%' + last10);
    await nota(conv, 'Consulté las boletas del teléfono ' + (last10 || '—') + '.');
    if (!boletas || boletas.length === 0) return 'Ese teléfono NO tiene boletas registradas (es cliente nuevo).';
    const nombre = boletas[0].clientes?.nombre || 'Cliente';
    const detalle = boletas.map(b => `boleta ${b.numero}: abonado $${Number(b.total_abonado||0).toLocaleString('es-CO')}, debe $${Number(b.saldo_restante||0).toLocaleString('es-CO')}`).join('; ');
    return `Cliente: ${nombre}. Boletas: ${detalle}.`;
  }

  if (nombre === 'enviar_contacto_inicial') {
    const { data: rr } = await supabase
      .from('respuestas_rapidas')
      .select('pasos')
      .eq('linea_id', conv.linea_id)
      .ilike('titulo', '%contacto inicial%')
      .maybeSingle();
    if (!rr || !Array.isArray(rr.pasos) || !rr.pasos.length) {
      return 'No encontré la presentación inicial configurada. Salúdalo tú con un mensaje corto y ofrece explicarle los premios.';
    }
    let enviados = 0;
    for (let i = 0; i < rr.pasos.length; i++) {
      const p = rr.pasos[i];
      if (p.tipo === 'imagen' && (p.media_id || p.url)) {
        const env = p.media_id
          ? await enviarImagenPorId(conv.telefono, p.media_id, p.texto || '', conv.linea_id)
          : await enviarImagen(conv.telefono, p.url, p.texto || '', conv.linea_id);
        if (env && env.ok) { await guardarEnChat(conv, { direccion: 'saliente', tipo: 'image', texto: p.texto || null, media_url: p.url || null, wa_message_id: env.wa_message_id }); enviados++; }
      } else if (p.texto) {
        const env = await enviarTexto(conv.telefono, p.texto, conv.linea_id);
        if (env && env.ok) { await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: p.texto, wa_message_id: env.wa_message_id }); enviados++; }
      }
      if (i < rr.pasos.length - 1) await dormir(PAUSA_MS);
    }
    await nota(conv, 'Envié el contacto inicial (presentación con fotos, precio y la pregunta de los premios).');
    return `Listo, ya le envié la presentación inicial completa (${enviados} mensajes: fotos de la casa, precio y la pregunta de si quiere que le explique los premios). NO repitas esa información; espera su respuesta.`;
  }

  if (nombre === 'pasar_a_humano') {
    const motivo = String(input?.motivo || 'sin especificar').slice(0, 200);
    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ agente_activo: false, estado: 'humano' })
      .eq('id', conv.id);
    await nota(conv, 'Pasé el chat a un asesor y me apagué. Motivo: ' + motivo);
    return 'AGENTE_APAGADO: el chat quedó en manos de un asesor humano. Envía un último mensaje breve y cálido avisando que un asesor lo atiende enseguida, y no hagas nada más.';
  }

  return 'Herramienta no disponible.';
}

// ── Arma el historial del chat en formato de la IA (user/assistant) ─────────
function construirMensajes(historial) {
  const msgs = [];
  for (const m of historial) {
    let role, text;
    if (m.direccion === 'entrante') {
      role = 'user';
      text = (m.texto || '').trim() || (m.tipo && m.tipo !== 'text' ? `[el cliente envió un ${m.tipo}]` : '');
    } else if (m.direccion === 'saliente') {
      role = 'assistant';
      text = (m.texto || '').trim();
    } else {
      continue;   // las notas (direccion='nota') NO van al historial de la IA
    }
    if (!text) continue;
    // La API exige alternancia user/assistant: fusiona mensajes seguidos del mismo lado.
    if (msgs.length && msgs[msgs.length - 1].role === role) {
      msgs[msgs.length - 1].content += '\n' + text;
    } else {
      msgs.push({ role, content: text });
    }
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, telefono } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!esGerencia(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia.' });
  if (!linea_id || !telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta línea o teléfono.' });
  if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'Sin acceso a esta línea.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ status: 'error', mensaje: 'Falta ANTHROPIC_API_KEY.' });

  try {
    // 1) La conversación y su estado.
    const { data: conv } = await supabase
      .from('conversaciones_whatsapp')
      .select('id, telefono, linea_id, agente_activo')
      .eq('telefono', telefono).eq('linea_id', linea_id).maybeSingle();
    if (!conv) return res.status(200).json({ status: 'error', mensaje: 'No existe esa conversación.' });
    if (!conv.agente_activo) return res.status(200).json({ status: 'ok', skip: 'El agente no está activo en este chat.' });

    // 2) Historial. Si el último mensaje NO es del cliente, ya está respondido → no hago nada (evita dobles).
    const { data: histAsc } = await supabase
      .from('mensajes_whatsapp')
      .select('direccion, tipo, texto, timestamp_wa, created_at')
      .eq('conversacion_id', conv.id)
      .order('timestamp_wa', { ascending: false })
      .limit(MAX_HISTORIAL);
    const historial = (histAsc || []).slice().reverse();
    const reales = historial.filter(m => m.direccion === 'entrante' || m.direccion === 'saliente');
    if (!reales.length || reales[reales.length - 1].direccion !== 'entrante') {
      return res.status(200).json({ status: 'ok', skip: 'No hay un mensaje del cliente pendiente de responder.' });
    }

    // 3) Configuración del agente (prompt + modelo).
    const { data: cfg } = await supabase
      .from('agente_config').select('prompt, modelo, nombre_agente').eq('linea_id', linea_id).maybeSingle();
    const prompt = String(cfg?.prompt || '').trim();
    if (!prompt) return res.status(200).json({ status: 'error', mensaje: 'El agente no tiene instrucciones guardadas.' });
    const modelo = MODELOS_OK.includes(cfg?.modelo) ? cfg.modelo : 'claude-sonnet-4-6';

    const system = prompt +
      `\n\n---\nCONTEXTO (no lo menciones literalmente): hoy es ${contextoFechaHora()} (Colombia). ` +
      `Hablas por WhatsApp con el cliente cuyo número es ${conv.telefono}. ` +
      `Tienes herramientas para actuar; úsalas cuando corresponda en vez de inventar. ` +
      `Mira el historial: si el cliente acaba de llegar y aún no se ha enviado la presentación inicial en el chat, ` +
      `usa primero enviar_contacto_inicial. Después de usar una herramienta, sigue la conversación con naturalidad ` +
      `y mensajes cortos. No repitas información que ya esté en el chat.`;

    const messages = construirMensajes(reales);
    if (!messages.length) return res.status(200).json({ status: 'ok', skip: 'Sin mensajes para procesar.' });

    // 4) Bucle de razonamiento + herramientas.
    let apagado = false;
    for (let iter = 0; iter < MAX_ITER; iter++) {
      const resp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: 1024, system, tools: TOOLS, messages }),
      });
      const data = await resp.json();
      if (data.error) { await nota(conv, 'No pude responder (problema con la IA): ' + (data.error.message || 'error')); return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') }); }

      const bloques = data.content || [];
      // Enviar primero cualquier texto que la IA quiera decir.
      for (const b of bloques) {
        if (b.type === 'text' && b.text && b.text.trim()) await decir(conv, b.text.trim());
      }
      const toolUses = bloques.filter(b => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) break;   // terminó su turno

      // Ejecutar herramientas y devolver resultados a la IA.
      messages.push({ role: 'assistant', content: bloques });
      const results = [];
      for (const tu of toolUses) {
        let out;
        try { out = await ejecutarHerramienta(tu.name, tu.input || {}, conv); }
        catch (e) { out = 'Error ejecutando la herramienta: ' + e.message; }
        if (typeof out === 'string' && out.startsWith('AGENTE_APAGADO')) apagado = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      if (apagado) {
        // dar una última vuelta para el mensaje de despedida y cortar
        const resp2 = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelo, max_tokens: 400, system, messages }),
        });
        const d2 = await resp2.json();
        if (!d2.error) for (const b of (d2.content || [])) if (b.type === 'text' && b.text?.trim()) await decir(conv, b.text.trim());
        break;
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
