import {
  CLASIFICADOR_SYSTEM_DEFAULT,
  CATEGORIAS_VALIDAS,
  TAG_POR_CATEGORIA,
} from './clasificador-prompt.js';
import { aplicarCors } from '../lib/cors.js';
import { supabase } from '../lib/supabase.js';

/**
 * Clasificación de intenciones para el subflujo "Plantilla" (difusiones).
 * ChateaPro llama este endpoint desde un nodo de solicitud HTTP en lugar del nodo de IA nativo.
 *
 * Seguridad: header Authorization: Bearer <CHATEAPRO_CLASIFICAR_SECRET>
 *
 * Cuerpo JSON — 2 modos aceptados:
 *
 *   Modo A (recomendado) — pasa el user_ns y el endpoint trae la ráfaga:
 *     { "user_ns": "f159929u602921253" }
 *
 *   Modo B (fallback) — pasa el texto directo:
 *     { "mensaje": "texto del cliente" }
 *
 * También acepta: message, text, contenido, o el string en req.body si viene plano.
 *
 * Respuesta 200:
 *   { "ok": true, "categoria": "PAGO", "tag": "Plantilla pago", "texto_analizado": "..." }
 * Si falla:
 *   { "ok": false, "categoria": "NINGUNO", "tag": "Plantilla ninguno", "error": "..." }
 */

function extraerMensaje(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body.trim();
  const b = body;
  const raw =
    b.mensaje ??
    b.message ??
    b.text ??
    b.contenido ??
    b.texto ??
    b.mensaje_cliente ??
    (b.data && (b.data.mensaje || b.data.message || b.data.text));
  if (raw == null) return '';
  return String(raw).trim();
}

function extraerUserNs(body) {
  if (!body || typeof body !== 'object') return '';
  const v = body.user_ns ?? body.userNs ?? body.user_id ?? body.subscriber_ns ?? '';
  return String(v || '').trim();
}

// Fecha/hora en que se envió la plantilla al cliente (variable f159929v13249699).
// ChateaPro lo manda como ISO: "2026-04-18T23:36:14Z". Devolvemos timestamp Unix en segundos.
// Si no llega o es inválida, retornamos null y el corte cae al fallback de brecha temporal.
function extraerFechaPlantillaTs(body) {
  if (!body || typeof body !== 'object') return null;
  const raw = body.fecha_plantilla ?? body.fechaPlantilla ?? body.plantilla_enviada_en ?? '';
  const s = String(raw || '').trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

// Dado un user_ns (ej: f159929u602921253), detecta a qué línea pertenece
function tokenDeLinea(userNs) {
  if (userNs.startsWith('f159929')) return process.env.CHATEA_TOKEN_LINEA_1;
  if (userNs.startsWith('f166221')) return process.env.CHATEA_TOKEN_LINEA_2;
  return process.env.CHATEA_TOKEN_LINEA_1; // default L1
}
function nombreLinea(userNs) {
  if (userNs.startsWith('f159929')) return 'L1';
  if (userNs.startsWith('f166221')) return 'L2';
  return 'L?';
}

function textoMensaje(m) {
  if (m.msg_type === 'image') return '[imagen adjunta]';
  return (m.content || m.payload?.text || `[${m.msg_type || 'media'}]`).substring(0, 800);
}

// Trae la conversación relevante del cliente: últimos mensajes in + agent (bot)
// desde la última brecha temporal de más de 1 hora (inicio de la interacción actual).
//
// Chatea Pro no expone la plantilla HSM de difusión en /chat-messages, por eso no
// intentamos detectarla. En su lugar usamos brecha temporal para delimitar "esta
// conversación" vs "conversaciones anteriores".
async function traerRafagaCliente(userNs, fechaPlantillaTs = null) {
  const token = tokenDeLinea(userNs);
  if (!token) throw new Error('Falta CHATEA_TOKEN_LINEA_1/2 en el servidor');

  const res = await fetch(
    `https://chateapro.app/api/subscriber/chat-messages?user_ns=${encodeURIComponent(userNs)}&limit=25`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`ChateaPro /chat-messages → ${res.status}`);
  const d = await res.json();
  const msgs = d.data || [];  // más reciente primero

  const BRECHA_CONVERSACION_SEG = 60 * 60;  // 1 hora → separa conversaciones distintas (fallback)
  const BRECHA_RAFAGA_SEG = 15 * 60;         // 15 min → delimita la última ráfaga del cliente

  // 1) Delimitar "conversación actual":
  //    - Si llegó fecha_plantilla → tomar SOLO mensajes posteriores a ese momento
  //      (eso nos da exactamente la interacción que siguió a la difusión).
  //    - Si no llegó (difusiones viejas o fallback) → usar brecha temporal de 1h.
  const conversacionActual = [];
  if (fechaPlantillaTs) {
    for (const m of msgs) {
      if ((m.ts || 0) > fechaPlantillaTs) conversacionActual.push(m);
    }
  } else {
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (conversacionActual.length > 0) {
        const prev = conversacionActual[conversacionActual.length - 1];
        const brecha = Math.abs((prev.ts || 0) - (m.ts || 0));
        if (brecha > BRECHA_CONVERSACION_SEG) break;
      }
      conversacionActual.push(m);
    }
  }
  conversacionActual.reverse(); // orden cronológico

  // 2) Construir conversación estructurada + recolectar imágenes
  const imagenes = [];
  const turnos = [];
  let ultimoMensajeBot = null;
  for (const m of conversacionActual) {
    const quien = m.type === 'in' ? 'CLIENTE' : 'BOT';
    const txt = textoMensaje(m);
    turnos.push(`${quien}: ${txt}`);
    if (m.type === 'in' && m.msg_type === 'image' && m.payload?.url) {
      imagenes.push(m.payload.url);
    }
    if (m.type !== 'in') ultimoMensajeBot = txt;  // guardar último "agent"/"out"
  }
  const conversacion = turnos.join('\n');

  // 3) Texto actual = última ráfaga consecutiva del cliente (para dedup)
  const rafagaReciente = [];
  for (const m of msgs) {
    if (m.type === 'in') {
      if (rafagaReciente.length > 0) {
        const prev = rafagaReciente[rafagaReciente.length - 1];
        if (Math.abs((prev.ts || 0) - (m.ts || 0)) > BRECHA_RAFAGA_SEG) break;
      }
      rafagaReciente.push(m);
    } else break;
  }
  rafagaReciente.reverse();
  const textoActual = rafagaReciente.map(textoMensaje).filter(Boolean).join(' ').trim();

  return {
    texto: textoActual,
    imagenes: imagenes.slice(-3),
    conversacion: turnos.length >= 2 ? conversacion : '',  // solo si hay al menos 2 turnos
    ultimoMensajeBot,
  };
}

// Trae datos del suscriptor (nombre, teléfono, tags) para guardar contexto
async function traerDatosSuscriptor(userNs) {
  const token = tokenDeLinea(userNs);
  if (!token) return null;
  try {
    const res = await fetch(
      `https://chateapro.app/api/subscriber/get-info?user_ns=${encodeURIComponent(userNs)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const s = d.data ?? d;
    const tagsRaw = s.tags ?? [];
    const lprTag = tagsRaw.find((t) => typeof t.name === 'string' && t.name.startsWith('[LPR]'))?.name || null;
    // Lista de tag_ns del cliente (para buscar plantilla coincidente)
    const tagsNs = tagsRaw.map(t => t.tag_ns).filter(Boolean);
    return {
      nombre: s.name || [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || null,
      telefono: s.phone || null,
      lpr_tag: lprTag,
      tags_ns: tagsNs,
    };
  } catch {
    return null;
  }
}

// Busca la plantilla de difusión que coincide con los tags del cliente
// Devuelve el texto de la plantilla (o null si el cliente no tiene ninguna plantilla activa aplicable)
async function buscarPlantillaPorTags(tagsNs) {
  if (!tagsNs || tagsNs.length === 0) return null;
  try {
    const { data } = await supabase
      .from('plantillas_difusion')
      .select('tag_ns, texto_plantilla, nombre')
      .eq('activa', true)
      .in('tag_ns', tagsNs)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

// Guarda cada clasificación en Supabase (await para asegurar que Vercel no corte antes)
async function guardarClasificacion(row) {
  try {
    const { error } = await supabase.from('clasificaciones_plantilla').insert([row]);
    if (error) console.error('[clasificar-plantilla] supabase error:', error.message, error.details);
  } catch (e) {
    console.error('[clasificar-plantilla] supabase insert error:', e.message);
  }
}

// Verifica si ya existe una clasificación reciente (últimos 5 min) del mismo cliente
// con mensaje similar. Si sí, devuelve la categoría/tag existentes para evitar duplicados.
//
// Regla de similitud: si el mensaje nuevo es igual al anterior O uno contiene al otro
// (ej: "Consigno Hola" → "Consigno Hola [imagen]"), se considera el mismo contexto.
async function buscarClasificacionReciente(userNs, mensaje) {
  if (!userNs || !mensaje) return null;
  const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('clasificaciones_plantilla')
    .select('categoria, tag_aplicado, mensaje_analizado, created_at')
    .eq('user_ns', userNs)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  const prev = data[0];
  const m1 = (prev.mensaje_analizado || '').slice(0, 1000).trim().toLowerCase();
  const m2 = (mensaje || '').slice(0, 1000).trim().toLowerCase();
  if (!m1 || !m2) return null;
  // 1) Idéntico
  if (m1 === m2) return prev;
  // 2) Uno contiene al otro y la diferencia es pequeña (<50 chars extra)
  if (m2.includes(m1) && m2.length - m1.length < 200) return prev;
  if (m1.includes(m2) && m1.length - m2.length < 200) return prev;
  // 3) Similaridad alta (80%+ palabras en común) — fallback conservador
  const words1 = new Set(m1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(m2.split(/\s+/).filter(w => w.length > 2));
  if (words1.size > 0 && words2.size > 0) {
    const comunes = [...words1].filter(w => words2.has(w)).length;
    const minSize = Math.min(words1.size, words2.size);
    if (minSize > 0 && comunes / minSize >= 0.8) return prev;
  }
  return null;
}

function authOk(req) {
  const secret = process.env.CHATEAPRO_CLASIFICAR_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer && bearer === secret) return true;
  const h = req.headers['x-chateapro-secret'];
  if (h && String(h) === secret) return true;
  return false;
}

function parseJsonFromModel(text) {
  const t = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Sin JSON en respuesta');
  return JSON.parse(t.slice(start, end + 1));
}

function normalizarCategoria(val) {
  const s = String(val || '').trim().toUpperCase();
  const map = {
    'MEDIODEPAGO': 'MEDIO DE PAGO',
    'MEDIO_DE_PAGO': 'MEDIO DE PAGO',
    'MEDIO DE PAGO': 'MEDIO DE PAGO',
  };
  if (map[s]) return map[s];
  const found = CATEGORIAS_VALIDAS.find((c) => c.toUpperCase() === s);
  return found || null;
}

async function clasificarConClaude(mensaje, imagenes, systemPrompt, ultimoMensajeBot, conversacion, plantillaTexto) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en el servidor');

  const model =
    process.env.ANTHROPIC_CLASIFICADOR_MODEL || 'claude-haiku-4-5-20251001';

  // Contexto: plantilla (si hay mapeada por tag) + conversación + último mensaje bot
  let bloqueContexto = '';

  if (plantillaTexto) {
    bloqueContexto = `PLANTILLA DE DIFUSIÓN QUE EL CLIENTE RECIBIÓ (es el punto de inicio de la conversación):
"""
${plantillaTexto.slice(0, 3000)}
"""

`;
  }

  if (conversacion && conversacion.length > 20) {
    bloqueContexto += `CONVERSACIÓN POSTERIOR A LA PLANTILLA (en orden cronológico):
"""
${conversacion.slice(0, 6000)}
"""

IMPORTANTE:
- La plantilla arriba fue lo que disparó esta conversación.
- Los mensajes siguientes son la interacción real: cliente responde, bot responde, etc.
- Clasifica SOLO el ÚLTIMO mensaje del CLIENTE (el más reciente). Los anteriores ya fueron respondidos — úsalos solo como contexto.
- Si el cliente responde a algo específico del bot (ej: bot dio cuenta → cliente mandó imagen), usa ese contexto.

`;
  } else if (ultimoMensajeBot) {
    bloqueContexto += `CONTEXTO — Último mensaje que el bot le envió al cliente:
"""
${ultimoMensajeBot}
"""

IMPORTANTE: clasifica SOLO el mensaje actual del cliente. Los anteriores ya fueron respondidos.

`;
  }

  const userBlock = `${bloqueContexto}MENSAJE ACTUAL DEL CLIENTE (ráfaga más reciente, puede ser corto o coloquial colombiano):
"""
${(mensaje || '(sin texto, solo imagen)').slice(0, 8000)}
"""
${imagenes && imagenes.length ? `\nEl cliente también envió ${imagenes.length} imagen(es). Revísalas: si son comprobante/captura de transferencia o pago → PAGO. Si son ilegibles o no relacionadas → ignora la imagen y clasifica por el texto.` : ''}

Devuelve SOLO el JSON {"categoria":"..."} con una de las categorías permitidas en el system prompt.`;

  // Construir content: primero imágenes (recomendación Anthropic), luego texto
  const content = [];
  if (imagenes && imagenes.length) {
    for (const url of imagenes) {
      content.push({ type: 'image', source: { type: 'url', url } });
    }
  }
  content.push({ type: 'text', text: userBlock });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const parsed = parseJsonFromModel(text);
  const cat = normalizarCategoria(parsed.categoria);
  if (!cat) throw new Error(`Categoría inválida: ${parsed.categoria}`);
  return cat;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type, Authorization, x-chateapro-secret')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, mensaje: 'Usa POST' });
  }

  if (!authOk(req)) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado' });
  }

  const systemPrompt =
    process.env.CHATEAPRO_CLASIFICADOR_SYSTEM || CLASIFICADOR_SYSTEM_DEFAULT;

  // Prioridad: si mandan user_ns, traemos la ráfaga completa. Si no, texto directo.
  let mensaje = '';
  let imagenes = [];
  let ultimoMensajeBot = null;
  let conversacion = '';
  let plantillaTexto = null;        // texto de la plantilla identificada por tag
  let plantillaNombre = null;
  let fuente = '';
  let userNs = '';
  let datosSub = null;
  try {
    userNs = extraerUserNs(req.body);
    if (userNs) {
      // Corte temporal exacto: momento en que se envió la plantilla de difusión.
      // Viene como ISO en el payload (ej: "2026-04-18T23:36:14Z"). Si no llega, cae al fallback.
      const fechaPlantillaTs = extraerFechaPlantillaTs(req.body);

      // Paralelo: ráfaga + datos del suscriptor
      const [rafaga, datos] = await Promise.all([
        traerRafagaCliente(userNs, fechaPlantillaTs),
        traerDatosSuscriptor(userNs),
      ]);
      mensaje = rafaga.texto;
      imagenes = rafaga.imagenes || [];
      ultimoMensajeBot = rafaga.ultimoMensajeBot || null;
      conversacion = rafaga.conversacion || '';
      datosSub = datos;

      // Buscar la plantilla activa que coincida con algún tag del cliente
      if (datos?.tags_ns?.length) {
        const plantilla = await buscarPlantillaPorTags(datos.tags_ns);
        if (plantilla) {
          plantillaTexto = plantilla.texto_plantilla;
          plantillaNombre = plantilla.nombre;
        }
      }
      fuente = plantillaTexto
        ? `plantilla-${plantillaNombre}`
        : (conversacion ? `conversacion-${userNs}` : `rafaga-${userNs}`);
      if (!mensaje && imagenes.length === 0) {
        return res.status(200).json({
          ok: false,
          categoria: 'NINGUNO',
          tag: TAG_POR_CATEGORIA.NINGUNO,
          texto_analizado: '',
          error: 'No se encontraron mensajes entrantes recientes del cliente',
        });
      }
    } else {
      mensaje = extraerMensaje(req.body);
      fuente = 'mensaje-directo';
    }
  } catch (e) {
    return res.status(200).json({
      ok: false,
      categoria: 'NINGUNO',
      tag: TAG_POR_CATEGORIA.NINGUNO,
      error: `Error trayendo ráfaga: ${String(e.message || e).slice(0, 300)}`,
    });
  }

  if (!mensaje && imagenes.length === 0) {
    return res.status(400).json({
      ok: false,
      categoria: 'NINGUNO',
      tag: TAG_POR_CATEGORIA.NINGUNO,
      mensaje: 'Falta user_ns o texto del cliente (mensaje / message / text)',
    });
  }

  // Deduplicación: si el mismo cliente ya tiene clasificación con este mensaje en los últimos 2 min,
  // devolver la categoría existente sin consultar a Claude ni crear duplicado en Supabase
  if (userNs && mensaje) {
    const previa = await buscarClasificacionReciente(userNs, mensaje);
    if (previa) {
      return res.status(200).json({
        ok: true,
        categoria: previa.categoria,
        tag: previa.tag_aplicado,
        texto_analizado: mensaje.slice(0, 500),
        fuente: 'cache-deduplicacion',
        duplicado: true,
      });
    }
  }

  try {
    const categoria = await clasificarConClaude(mensaje, imagenes, systemPrompt, ultimoMensajeBot, conversacion, plantillaTexto);
    const tag = TAG_POR_CATEGORIA[categoria] || TAG_POR_CATEGORIA.NINGUNO;

    // Guardar en Supabase (await para que Vercel no corte antes de terminar el insert)
    if (userNs) {
      await guardarClasificacion({
        user_ns: userNs,
        linea: nombreLinea(userNs),
        nombre: datosSub?.nombre ?? null,
        telefono: datosSub?.telefono ?? null,
        mensaje_analizado: (mensaje || '').slice(0, 4000),
        fuente,
        categoria,
        tag_aplicado: tag,
        lpr_tag: datosSub?.lpr_tag ?? null,
        imagenes_urls: imagenes.length ? imagenes : null,
      });
    }

    return res.status(200).json({
      ok: true,
      categoria,
      tag,
      texto_analizado: (mensaje || '').slice(0, 500),
      imagenes_analizadas: imagenes.length,
      fuente,
    });
  } catch (e) {
    console.error('[clasificar-plantilla]', e);
    return res.status(200).json({
      ok: false,
      categoria: 'NINGUNO',
      tag: TAG_POR_CATEGORIA.NINGUNO,
      error: String(e.message || e).slice(0, 500),
    });
  }
}
