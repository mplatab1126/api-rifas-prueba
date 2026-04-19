import { aplicarCors } from '../lib/cors.js';
import { construirSystemPrompt, CAMILA_MODELO, CAMILA_PROMPT_VERSION } from './camila-prompt.js';

/**
 * Motor del agente Camila. Webhook único al que llama Chatea Pro cuando
 * el cliente envía un mensaje.
 *
 * Flujo:
 *   1. Recibe el webhook con `user_ns`.
 *   2. Trae en paralelo: historial de mensajes, info del suscriptor,
 *      bot fields de la rifa, datos del cliente en Supabase (si tiene boleta).
 *   3. Construye el system prompt con los bot fields actuales.
 *   4. Arma los messages desde el historial.
 *   5. Loop con Claude Sonnet 4.6 (tool use): hasta 5 iteraciones donde
 *      Claude puede pedir ejecutar tools. El motor las ejecuta y le
 *      devuelve los resultados, hasta que Claude responda con texto final.
 *   6. Envía la respuesta final al cliente vía /subscriber/send-text.
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON esperado desde Chatea Pro:
 *   { "user_ns": "f159929u602921253" }
 *
 * Variables de entorno requeridas:
 *   - CAMILA_TOOLS_SECRET     → auth compartido con las tools
 *   - ANTHROPIC_API_KEY       → clave de Anthropic (ya existe para el clasificador)
 *   - CHATEA_TOKEN_LINEA_1    → token API de L1 (ya existe)
 *   - API_BASE_URL            → URL base del proyecto (ej: "https://api-rifas-prueba.vercel.app")
 */

const MAX_TOKENS_RESPUESTA = 500;
const MAX_ITERACIONES_TOOL_USE = 5;
const LIMITE_MENSAJES_HISTORIAL = 25;
const BOT_FIELDS_REQUERIDOS = {
  'NOMBRE_RIFA': '[Rifa 1] Nombre de la rifa',
  'VALOR_BOLETA': '[Rifa 1] Valor de la boleta',
  'INFO_PREMIO_MAYOR': '[Rifa 1] Información del premio mayor',
  'PREMIOS_RIFA': '[Rifa 1] Premios de la rifa',
  'CONDICIONES_PREMIOS': '[Rifa 1] Condiciones para los premios',
  'FLEXIBILIDAD_PREMIOS': '[Rifa 1] Flexibilidad en los premios',
  'FECHA_SORTEO': '[Rifa 1] Fecha del sorteo',
  'HORA_MAXIMA': 'Hora máxima para realizar transferencia',
};

// ────── Definiciones de tools para Claude ──────

const TOOLS_DEFINICION = [
  {
    name: 'consultar_numeros_disponibles',
    description: 'Obtiene la lista de boletas de 4 cifras que están libres para comprar. Úsala cuando el cliente pida ver los números disponibles.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'registrar_datos_cliente',
    description: 'Guarda nombre, apellido y/o ciudad del cliente en el sistema. Llama a esta tool cuando el cliente comparta cualquiera de esos datos (aunque sea solo uno).',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Primer y segundo nombre del cliente' },
        apellido: { type: 'string', description: 'Uno o dos apellidos del cliente' },
        ciudad: { type: 'string', description: 'Ciudad (y departamento si lo mencionó)' },
      },
      required: [],
    },
  },
  {
    name: 'mostrar_medios_pago',
    description: 'Envía al cliente los medios de pago (Nequi, Daviplata, Bancolombia). Úsala SOLO cuando el cliente ya tiene número elegido y datos registrados, y está listo para pagar.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'enviar_boleta_digital',
    description: 'Envía al cliente el link de su boleta digital. Úsala solo cuando el cliente ya tiene una boleta activa (el humano verificó el pago) y pregunta por su boleta.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_boleta_existente',
    description: 'Consulta las boletas, saldo y deuda del cliente que escribe. Úsala cuando el cliente pregunte por su saldo, cuánto debe, cuánto ha abonado o su estado de cuenta.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'escalar_a_humano',
    description: 'Pausa el bot, aplica el tag "Escalado" y guarda la razón para que un asesor humano tome la conversación. Úsala en los casos definidos: comprobante de pago, rifa diaria 2/3 cifras, cliente inconforme, pide asesor, pregunta fuera de base, consulta número específico.',
    input_schema: {
      type: 'object',
      properties: {
        razon: { type: 'string', description: 'Motivo corto del escalamiento (ej: "Posible comprobante", "Cliente inconforme")' },
      },
      required: ['razon'],
    },
  },
];

// ────── Helpers ──────

function tokenDeLinea(userNs) {
  if (typeof userNs !== 'string') return null;
  if (userNs.startsWith('f159929')) return process.env.CHATEA_TOKEN_LINEA_1;
  if (userNs.startsWith('f166221')) return process.env.CHATEA_TOKEN_LINEA_2;
  return null;
}

function extraerUserNs(body) {
  if (!body || typeof body !== 'object') return '';
  return String(body.user_ns ?? body.userNs ?? body.subscriber_ns ?? '').trim();
}

function authOk(req) {
  const secret = process.env.CAMILA_TOOLS_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === secret;
}

async function chateaGet(token, path) {
  const r = await fetch(`https://chateapro.app/api${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`ChateaPro GET ${path}: ${r.status}`);
  return r.json();
}

async function chateaPostText(token, user_ns, text) {
  const r = await fetch('https://chateapro.app/api/subscriber/send-text', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ user_ns, text }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// ────── Traer contexto ──────

async function traerHistorial(token, user_ns) {
  const d = await chateaGet(token, `/subscriber/chat-messages?user_ns=${encodeURIComponent(user_ns)}&limit=${LIMITE_MENSAJES_HISTORIAL}`);
  const msgs = (d.data || []).slice().reverse(); // cronológico

  // Convertir a formato Claude: user (cliente) / assistant (bot)
  const mensajes = [];
  for (const m of msgs) {
    const role = m.type === 'in' ? 'user' : 'assistant';
    let texto;
    if (m.msg_type === 'image') {
      texto = '[imagen adjunta]';
    } else {
      texto = m.content || m.payload?.text || `[${m.msg_type || 'media'}]`;
    }
    texto = String(texto).slice(0, 2000);
    if (!texto.trim()) continue;

    // Consolidar con el mensaje anterior si es del mismo rol
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo && ultimo.role === role && typeof ultimo.content === 'string') {
      ultimo.content += '\n' + texto;
    } else {
      mensajes.push({ role, content: texto });
    }
  }

  // Claude requiere que el primer mensaje sea 'user'. Si arranca con assistant, lo quitamos.
  while (mensajes.length > 0 && mensajes[0].role !== 'user') mensajes.shift();

  return mensajes;
}

async function traerInfoSuscriptor(token, user_ns) {
  try {
    const d = await chateaGet(token, `/subscriber/get-info?user_ns=${encodeURIComponent(user_ns)}`);
    const s = d.data ?? d;
    return {
      nombre: s.name || [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || null,
      telefono: s.phone || null,
      first_name: s.first_name || null,
      last_name: s.last_name || null,
    };
  } catch {
    return { nombre: null, telefono: null, first_name: null, last_name: null };
  }
}

async function traerBotFields(token) {
  const valores = {};
  const nombreANuestraKey = Object.fromEntries(
    Object.entries(BOT_FIELDS_REQUERIDOS).map(([k, v]) => [v, k])
  );
  for (let page = 1; page <= 5; page++) {
    const d = await chateaGet(token, `/flow/bot-fields?limit=50&page=${page}`);
    const arr = d.data || [];
    for (const f of arr) {
      const clave = nombreANuestraKey[f.name];
      if (clave) valores[clave] = f.value ?? '';
    }
    if (!d.links?.next) break;
  }
  return valores;
}

async function traerBoletasCliente(telefono) {
  if (!telefono) return null;
  try {
    const API_BASE = process.env.API_BASE_URL;
    if (!API_BASE) return null;
    const r = await fetch(`${API_BASE}/api/cliente?telefono=${encodeURIComponent(telefono)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.boletas_cliente) return null;
    return {
      boletas: d.boletas_cliente,
      deuda: d.deuda_cliente,
      abonado: d.abonado_cliente,
      nombre: d.nombre_cliente,
      resumen: d.resumen,
      fecha_ultimo_abono: d.fecha_ultimo_abono,
    };
  } catch {
    return null;
  }
}

// ────── Ejecutar tools ──────

async function ejecutarTool(toolName, toolInput, { user_ns, telefono }) {
  const API_BASE = process.env.API_BASE_URL;
  const SECRET = process.env.CAMILA_TOOLS_SECRET;
  const headersAuth = { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

  switch (toolName) {
    case 'consultar_numeros_disponibles': {
      const r = await fetch(`${API_BASE}/api/disponibles`);
      return await r.json();
    }
    case 'consultar_boleta_existente': {
      if (!telefono) return { ok: false, error: 'No hay teléfono del cliente' };
      const r = await fetch(`${API_BASE}/api/cliente?telefono=${encodeURIComponent(telefono)}`);
      return await r.json();
    }
    case 'registrar_datos_cliente': {
      const r = await fetch(`${API_BASE}/api/chateapro/registrar-datos-cliente`, {
        method: 'POST',
        headers: headersAuth,
        body: JSON.stringify({ user_ns, ...toolInput }),
      });
      return await r.json();
    }
    case 'mostrar_medios_pago': {
      const r = await fetch(`${API_BASE}/api/chateapro/mostrar-medios-pago`, {
        method: 'POST',
        headers: headersAuth,
        body: JSON.stringify({ user_ns, ...toolInput }),
      });
      return await r.json();
    }
    case 'enviar_boleta_digital': {
      const r = await fetch(`${API_BASE}/api/chateapro/enviar-boleta-digital`, {
        method: 'POST',
        headers: headersAuth,
        body: JSON.stringify({ user_ns, telefono }),
      });
      return await r.json();
    }
    case 'escalar_a_humano': {
      const r = await fetch(`${API_BASE}/api/chateapro/escalar-a-humano`, {
        method: 'POST',
        headers: headersAuth,
        body: JSON.stringify({ user_ns, razon: toolInput?.razon || 'Sin razón' }),
      });
      return await r.json();
    }
    default:
      return { ok: false, error: `Tool desconocida: ${toolName}` };
  }
}

// ────── Llamada a Claude ──────

async function llamarClaude(systemBlocks, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CAMILA_MODELO,
      max_tokens: MAX_TOKENS_RESPUESTA,
      system: systemBlocks,
      messages,
      tools: TOOLS_DEFINICION,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 500)}`);
  }
  return r.json();
}

// ────── Handler principal ──────

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usa POST' });
  }
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });
  }
  if (!process.env.API_BASE_URL) {
    return res.status(500).json({ ok: false, error: 'Falta API_BASE_URL' });
  }

  const user_ns = extraerUserNs(req.body);
  if (!user_ns) return res.status(400).json({ ok: false, error: 'Falta user_ns' });

  const token = tokenDeLinea(user_ns);
  if (!token) return res.status(400).json({ ok: false, error: 'user_ns no reconocido o token no configurado' });

  try {
    // 1. Traer contexto en paralelo
    const [historial, subInfo, botFields] = await Promise.all([
      traerHistorial(token, user_ns),
      traerInfoSuscriptor(token, user_ns),
      traerBotFields(token),
    ]);

    if (historial.length === 0) {
      return res.status(200).json({ ok: false, error: 'Sin mensajes en el historial' });
    }

    // 2. Traer boletas (depende del teléfono que vino de subInfo)
    const boletaExistente = await traerBoletasCliente(subInfo.telefono);

    // 3. Construir system prompt (cacheable) + contexto dinámico (no cacheable)
    const systemPrompt = construirSystemPrompt(botFields);

    const fechaHoy = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'short' });
    let contextoDinamico = `# CONTEXTO ACTUAL\n\nFecha y hora: ${fechaHoy}\n\n`;
    if (subInfo.first_name || subInfo.last_name) {
      contextoDinamico += `Nombre del cliente según Chatea Pro: ${[subInfo.first_name, subInfo.last_name].filter(Boolean).join(' ')}\n`;
    }
    if (subInfo.telefono) contextoDinamico += `Teléfono: ${subInfo.telefono}\n`;
    if (boletaExistente) {
      contextoDinamico += `\n**ATENCIÓN: este cliente YA TIENE BOLETA.** No intentes venderle otra.\n`;
      contextoDinamico += `Boleta(s): ${boletaExistente.boletas}\n`;
      contextoDinamico += `Deuda actual: $${Number(boletaExistente.deuda).toLocaleString('es-CO')}\n`;
      contextoDinamico += `Ya abonó: $${Number(boletaExistente.abonado).toLocaleString('es-CO')}\n`;
      if (boletaExistente.fecha_ultimo_abono) contextoDinamico += `Último abono: ${boletaExistente.fecha_ultimo_abono}\n`;
    } else {
      contextoDinamico += `\nCliente SIN boleta aún (es venta nueva).\n`;
    }

    const systemBlocks = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextoDinamico },
    ];

    // 4. Loop de tool use
    const messages = historial.map((m) => ({ role: m.role, content: m.content }));
    const llamadasTools = [];
    let textoFinal = null;
    let escaloAHumano = false;

    for (let iter = 0; iter < MAX_ITERACIONES_TOOL_USE; iter++) {
      const resp = await llamarClaude(systemBlocks, messages);

      if (resp.stop_reason === 'end_turn' || resp.stop_reason === 'stop_sequence') {
        textoFinal = (resp.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n')
          .trim();
        break;
      }

      if (resp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: resp.content });
        const toolUses = (resp.content || []).filter((c) => c.type === 'tool_use');
        const resultados = await Promise.all(
          toolUses.map(async (tu) => {
            const resultado = await ejecutarTool(tu.name, tu.input || {}, { user_ns, telefono: subInfo.telefono });
            llamadasTools.push({ name: tu.name, input: tu.input, resultado });
            if (tu.name === 'escalar_a_humano' && resultado?.ok) escaloAHumano = true;
            return { tool_use_id: tu.id, resultado };
          })
        );
        messages.push({
          role: 'user',
          content: resultados.map((r) => ({
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: JSON.stringify(r.resultado).slice(0, 2000),
          })),
        });
        continue;
      }

      // stop_reason inesperado (max_tokens, etc.)
      break;
    }

    // 5. Enviar respuesta al cliente
    //    Si escaló a humano, NO enviar mensaje (la tool ya pausó el bot).
    let enviado = false;
    if (!escaloAHumano && textoFinal) {
      const e = await chateaPostText(token, user_ns, textoFinal);
      enviado = e.ok;
    }

    return res.status(200).json({
      ok: true,
      version_prompt: CAMILA_PROMPT_VERSION,
      modelo: CAMILA_MODELO,
      texto_enviado: escaloAHumano ? null : textoFinal,
      enviado,
      escalado: escaloAHumano,
      llamadas_tools: llamadasTools.map((t) => ({ name: t.name, input: t.input })),
    });
  } catch (e) {
    console.error('[camila-motor]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
