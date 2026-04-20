import { aplicarCors } from '../lib/cors.js';
import { supabase } from '../lib/supabase.js';
import { construirSystemPrompt, CAMILA_MODELO, CAMILA_PROMPT_VERSION } from './camila-prompt.js';

/**
 * Motor de Camila — arquitectura híbrida (v3).
 *
 * Chatea Pro llama a este endpoint por cada mensaje entrante del cliente,
 * pasando TODO el contexto en el Body. El motor:
 *   1. NO consulta nada a la API pública de Chatea Pro (cero rate limit).
 *   2. Sí consulta Supabase para boletas y números disponibles (esas llamadas
 *      van a nuestro propio Vercel, no a Chatea Pro).
 *   3. Llama a Claude Sonnet 4.6 con el prompt + historial + tools.
 *   4. Devuelve un JSON con `texto` (para que Chatea Pro lo envíe con nodo
 *      Send Message nativo) y `comandos` (para que Chatea Pro ejecute
 *      acciones como escalar o registrar datos con nodos nativos).
 *
 * Seguridad: header Authorization: Bearer <CAMILA_TOOLS_SECRET>
 *
 * Body JSON esperado (lo arma el subflujo de Chatea Pro):
 *   {
 *     "user_ns": "f159929u602921253",              // obligatorio
 *     "mensaje_cliente": "quiero ver los números",  // último mensaje del cliente
 *     "historial": "CLIENTE: hola\nBOT: ¡Qué bueno!\nCLIENTE: ...",  // opcional
 *     "nombre_cliente": "Mateo Plata",              // opcional
 *     "telefono": "+573123354789",                  // opcional
 *     "tags": "La perla roja, [LPR] ...",           // opcional
 *     "bot_fields": {                               // recomendado
 *       "NOMBRE_RIFA": "La Perla Roja",
 *       "VALOR_BOLETA": "80 mil pesos",
 *       "INFO_PREMIO_MAYOR": "...",
 *       "PREMIOS_RIFA": "...",
 *       "CONDICIONES_PREMIOS": "...",
 *       "FLEXIBILIDAD_PREMIOS": "...",
 *       "FECHA_SORTEO": "..."
 *     }
 *   }
 *
 * Respuesta JSON:
 *   {
 *     "ok": true,
 *     "version_prompt": "v3",
 *     "modelo": "claude-sonnet-4-6",
 *     "texto": "Respuesta de Camila (vacío si escaló)",
 *     "comandos": {
 *       "escalar": null | { "razon": "..." },
 *       "registrar_datos": null | { "nombre": "...", "apellido": "...", "ciudad": "..." }
 *     },
 *     "llamadas_tools": [...]  // para debug
 *   }
 *
 * Variables de entorno requeridas en Vercel:
 *   - CAMILA_TOOLS_SECRET
 *   - ANTHROPIC_API_KEY
 *   - API_BASE_URL        (para llamadas a /api/disponibles y /api/cliente)
 */

const MAX_TOKENS_RESPUESTA = 500;
const MAX_ITERACIONES_TOOL_USE = 5;

// ────── Definiciones de tools para Claude ──────

const TOOLS_DEFINICION = [
  {
    name: 'consultar_numeros_disponibles',
    description: 'Obtiene la lista de boletas de 4 cifras que están libres para comprar. Úsala cuando el cliente pida ver los números disponibles. Después de recibir la lista, inclúyela en tu respuesta al cliente (no uses comandos ni nada extra).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_boleta_existente',
    description: 'Consulta boletas, saldo y deuda del cliente actual. Úsala si necesitas datos frescos (aunque el contexto inicial ya suele incluirlos). Devuelve el estado actual en Supabase.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'registrar_datos_cliente',
    description: 'Registra en el sistema los datos del cliente (nombre, apellido y/o ciudad). Llámala cuando el cliente te comparta estos datos. No ejecuta directamente — el subflujo de Chatea Pro se encarga de guardarlos en los user fields después de tu respuesta.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Primer y segundo nombre' },
        apellido: { type: 'string', description: 'Uno o dos apellidos' },
        ciudad: { type: 'string', description: 'Ciudad (y departamento si lo dio)' },
      },
      required: [],
    },
  },
  {
    name: 'escalar_a_humano',
    description: 'Marca la conversación para que un asesor humano la atienda. Úsala según las reglas de escalamiento del prompt (comprobante, rifa diaria 2/3 cifras, inconformidad, pide asesor, fuera de base, consulta número específico). Cuando escales, NO incluyas texto de respuesta al cliente — el bot queda en pausa y el humano retoma.',
    input_schema: {
      type: 'object',
      properties: {
        razon: { type: 'string', description: 'Motivo corto (ej: "Posible comprobante", "Cliente inconforme")' },
      },
      required: ['razon'],
    },
  },
];

// ────── Helpers ──────

function authOk(req) {
  const secret = process.env.CAMILA_TOOLS_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === secret;
}

async function traerBoletasCliente(telefono) {
  if (!telefono) return null;
  try {
    const last10 = String(telefono).replace(/\D/g, '').slice(-10);
    const { data, error } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, total_abonado, clientes(nombre)')
      .like('telefono_cliente', '%' + last10);
    if (error || !data || data.length === 0) return null;
    const nombre = data[0].clientes?.nombre || null;
    const deuda = data.reduce((s, b) => s + Number(b.saldo_restante || 0), 0);
    const abonado = Math.min(...data.map((b) => Number(b.total_abonado || 0)));
    const enlaces = data
      .map((b) => `🎟️ *Boleta ${b.numero}:* https://www.losplata.com.co/boleta/${b.numero}`)
      .join('\n');
    return {
      boletas: data.map((b) => b.numero).join(', '),
      deuda,
      abonado,
      nombre,
      enlaces,
    };
  } catch {
    return null;
  }
}

function parseHistorial(historial) {
  // Chatea Pro lo pasa como string tipo "CLIENTE: ...\nBOT: ...\n..."
  // Lo convertimos a formato Claude (role/content)
  if (!historial || typeof historial !== 'string') return [];
  const lineas = historial.split('\n').filter((l) => l.trim());
  const mensajes = [];
  let buffer = null;
  for (const linea of lineas) {
    const m = linea.match(/^(CLIENTE|BOT|ASESOR|AGENTE):\s*(.*)$/i);
    if (m) {
      const role = m[1].toUpperCase() === 'CLIENTE' ? 'user' : 'assistant';
      const content = (m[2] || '').trim();
      if (!content) continue;
      if (buffer && buffer.role === role) {
        buffer.content += '\n' + content;
      } else {
        if (buffer) mensajes.push(buffer);
        buffer = { role, content };
      }
    } else if (buffer) {
      // Línea de continuación del mensaje anterior
      buffer.content += '\n' + linea.trim();
    }
  }
  if (buffer) mensajes.push(buffer);
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();
  return mensajes;
}

// ────── Ejecutar tools ──────

async function ejecutarTool(toolName, toolInput, ctx) {
  const API_BASE = process.env.API_BASE_URL;

  switch (toolName) {
    case 'consultar_numeros_disponibles': {
      try {
        const r = await fetch(`${API_BASE}/api/disponibles`);
        return await r.json();
      } catch (e) {
        return { ok: false, error: String(e.message) };
      }
    }
    case 'consultar_boleta_existente': {
      const boletas = await traerBoletasCliente(ctx.telefono);
      if (!boletas) return { tiene_boleta: false };
      return { tiene_boleta: true, ...boletas };
    }
    case 'registrar_datos_cliente': {
      // NO ejecuta — registra el comando para que Chatea Pro lo haga
      ctx.comandos.registrar_datos = {
        nombre: toolInput.nombre || null,
        apellido: toolInput.apellido || null,
        ciudad: toolInput.ciudad || null,
      };
      return { ok: true, registrado: 'Chatea Pro guardará los datos en los user fields' };
    }
    case 'escalar_a_humano': {
      // NO ejecuta — registra el comando para que Chatea Pro lo haga
      ctx.comandos.escalar = { razon: String(toolInput.razon || 'Sin razón').slice(0, 500) };
      return { ok: true, escalado: 'Chatea Pro pausará el bot y aplicará el tag. NO envíes texto al cliente.' };
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

  const body = req.body || {};
  const { user_ns, mensaje_cliente, historial, nombre_cliente, telefono, tags, bot_fields } = body;

  if (!user_ns) return res.status(400).json({ ok: false, error: 'Falta user_ns' });
  if (!mensaje_cliente || !String(mensaje_cliente).trim()) {
    return res.status(400).json({ ok: false, error: 'Falta mensaje_cliente' });
  }

  try {
    // 1. Traer boletas del cliente (Supabase, 0 rate limit en Chatea Pro)
    const boletaExistente = telefono ? await traerBoletasCliente(telefono) : null;

    // 2. System prompt + contexto dinámico
    const systemPrompt = construirSystemPrompt(bot_fields || {});
    const fechaHoy = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'short' });

    let contextoDinamico = `# CONTEXTO ACTUAL\n\nFecha y hora: ${fechaHoy}\n`;
    if (nombre_cliente) contextoDinamico += `Nombre del cliente según Chatea Pro: ${nombre_cliente}\n`;
    if (telefono) contextoDinamico += `Teléfono: ${telefono}\n`;
    if (tags) contextoDinamico += `Tags actuales del cliente: ${tags}\n`;
    if (boletaExistente) {
      contextoDinamico += `\n**ATENCIÓN: este cliente YA TIENE BOLETA.** No intentes venderle otra.\n`;
      contextoDinamico += `Boleta(s): ${boletaExistente.boletas}\n`;
      contextoDinamico += `Deuda actual: $${Number(boletaExistente.deuda).toLocaleString('es-CO')}\n`;
      contextoDinamico += `Ya abonó: $${Number(boletaExistente.abonado).toLocaleString('es-CO')}\n`;
      if (boletaExistente.enlaces) contextoDinamico += `Links:\n${boletaExistente.enlaces}\n`;
    } else {
      contextoDinamico += `\nCliente SIN boleta (es venta nueva).\n`;
    }

    const systemBlocks = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextoDinamico },
    ];

    // 3. Mensajes: parsear historial + agregar el mensaje actual si no está
    const mensajesPrevios = parseHistorial(historial);
    const ultimoPrevio = mensajesPrevios[mensajesPrevios.length - 1];
    const mensajeActualEsUltimo =
      ultimoPrevio && ultimoPrevio.role === 'user' &&
      ultimoPrevio.content.trim() === String(mensaje_cliente).trim();

    const messages = mensajesPrevios.slice();
    if (!mensajeActualEsUltimo) {
      // Agregar el mensaje actual al final
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        // Consolidar con el anterior si también es user
        messages[messages.length - 1].content += '\n' + String(mensaje_cliente);
      } else {
        messages.push({ role: 'user', content: String(mensaje_cliente) });
      }
    }

    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay mensaje del cliente para responder' });
    }

    // 4. Loop de tool use
    const ctx = { telefono, comandos: {} };
    const llamadasTools = [];
    let textoFinal = '';

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
            const resultado = await ejecutarTool(tu.name, tu.input || {}, ctx);
            llamadasTools.push({ name: tu.name, input: tu.input });
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

      break;
    }

    // 5. Si escaló, suprimir texto (el prompt lo dice pero por seguridad)
    if (ctx.comandos.escalar) textoFinal = '';

    return res.status(200).json({
      ok: true,
      version_prompt: CAMILA_PROMPT_VERSION,
      modelo: CAMILA_MODELO,
      texto: textoFinal,
      comandos: {
        escalar: ctx.comandos.escalar || null,
        registrar_datos: ctx.comandos.registrar_datos || null,
      },
      llamadas_tools: llamadasTools,
    });
  } catch (e) {
    console.error('[camila-motor]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
