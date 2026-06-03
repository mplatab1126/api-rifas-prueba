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
import { esMateo, puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarImagenPorId, enviarImagen, enviarDocumento } from '../lib/whatsapp.js';
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
    name: 'verificar_disponibilidad',
    description: 'Verifica si UN número de boleta específico (4 cifras) está libre u ocupado. Úsala cuando el cliente pregunta por un número puntual, por ejemplo "¿tienes el 1234?".',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'El número de 4 cifras a verificar.' } }, required: ['numero'] },
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
    name: 'enviar_resolucion',
    description: 'Envía al cliente el PDF de la resolución oficial de EDSA que autoriza la rifa. Úsala cuando el cliente pide ver la resolución, el documento legal, o pruebas concretas de que la rifa es legal o está autorizada.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'apartar_numero',
    description: 'Aparta (reserva) una boleta a nombre del cliente. Úsala SOLO cuando ya tengas los CUATRO datos: el número de 4 cifras, el nombre, el apellido y la ciudad del cliente. El teléfono es el de este chat.',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número de 4 cifras a apartar.' }, nombre: { type: 'string' }, apellido: { type: 'string' }, ciudad: { type: 'string' } }, required: ['numero', 'nombre', 'apellido', 'ciudad'] },
  },
  {
    name: 'enviar_boleta',
    description: 'Envía al cliente su boleta digital con el enlace para consultarla. Úsala justo después de apartar su número.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pasar_a_humano',
    description: 'Entrega la conversación a un asesor humano y te apaga en este chat. Úsala cuando: el cliente dice que YA PAGÓ o manda un comprobante (para que un asesor confirme el abono), tiene una queja, pide algo que no puedes resolver, o pide hablar con una persona.',
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
    return 'Esta es una MUESTRA de números libres (NO son todos y CAMBIA cada vez que la pides). Muéstrasela al cliente para que elija. NUNCA digas que "son los únicos" ni la filtres por terminación. Si el cliente quiere un número puntual o con cierta terminación, pídele que te diga uno y verifícalo con verificar_disponibilidad. Muestra: ' + texto;
  }

  if (nombre === 'verificar_disponibilidad') {
    const num = String(input?.numero || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(num)) return 'El número no es válido. Pídele al cliente un número de 4 cifras (0000-9999).';
    const { data: bol } = await supabase.from('boletas').select('telefono_cliente').eq('numero', num).maybeSingle();
    await nota(conv, 'Verifiqué el número ' + num + '.');
    if (!bol) return `El número ${num} no existe en esta rifa.`;
    return bol.telefono_cliente ? `El número ${num} ya está OCUPADO (no disponible).` : `El número ${num} está LIBRE y disponible.`;
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

  if (nombre === 'apartar_numero') {
    const num = String(input?.numero || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    const nom = String(input?.nombre || '').trim();
    const ape = String(input?.apellido || '').trim();
    const ciu = String(input?.ciudad || '').trim();
    if (!/^\d{4}$/.test(num) || !nom || !ape || !ciu) {
      return 'Faltan datos para apartar. Necesito el número de 4 cifras, nombre, apellido y ciudad del cliente. Pídeselos antes de apartar.';
    }
    try {
      const r = await fetch('https://www.losplata.com.co/api/rifa/reservar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeros: [num], nombre: nom, apellido: ape, ciudad: ciu, telefono: conv.telefono }),
      });
      const d = await r.json();
      if (!d.exito) { await nota(conv, 'Intenté apartar el ' + num + ' pero no se pudo: ' + (d.error || 'error')); return 'No se pudo apartar: ' + (d.error || 'error') + '. Cuéntaselo al cliente y ofrécele otra opción.'; }
      await nota(conv, `Aparté el número ${num} a nombre de ${nom} ${ape} (${ciu}).`);
      return `Listo: el número ${num} quedó apartado a nombre de ${nom} ${ape}. Total por pagar: $${Number(d.total || 0).toLocaleString('es-CO')}. Ahora envíale la boleta con enviar_boleta y explícale cómo abonar.`;
    } catch (e) {
      return 'No se pudo apartar (error de conexión): ' + e.message + '. Mejor pasa a un asesor.';
    }
  }

  if (nombre === 'enviar_boleta') {
    const last10 = String(conv.telefono).replace(/\D/g, '').slice(-10);
    const { data: boletas } = await supabase.from('boletas').select('numero, saldo_restante').like('telefono_cliente', '%' + last10);
    if (!boletas || !boletas.length) return 'El cliente todavía no tiene ninguna boleta apartada. Primero aparta su número con apartar_numero.';
    boletas.sort((a, b) => Number(a.numero) - Number(b.numero));
    const una = boletas.length === 1;
    const lista = boletas.map(b => `*${b.numero}*  ·  ${Number(b.saldo_restante || 0) <= 0 ? '✅ Pagada' : ('te falta abonar $' + Number(b.saldo_restante || 0).toLocaleString('es-CO'))}`).join('\n');
    const enlace = `https://www.losplata.com.co/boleta?telefono=${last10}`;
    const texto = `🎉 ¡Quedaste participando!\n\n${una ? 'Esta es tu boleta' : 'Estas son tus boletas'} para la rifa de *Los Plata*:\n\n${lista}\n\n👉 ${una ? 'Consulta tu boleta aquí' : 'Consulta tus boletas aquí'}:\n${enlace}\n\n¡Te deseamos mucha suerte! 🍀`;
    const env = await enviarTexto(conv.telefono, texto, conv.linea_id);
    if (env && env.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto, wa_message_id: env.wa_message_id });
    await nota(conv, 'Envié la boleta digital al cliente.');
    return 'Listo, le envié su boleta digital con el enlace para consultarla. Si va a abonar, recuérdale los medios de pago y avísale que un asesor le confirma el pago.';
  }

  if (nombre === 'enviar_resolucion') {
    const env = await enviarDocumento(conv.telefono, 'https://www.losplata.com.co/resolucion.pdf', 'Resolucion-EDSA-Los-Plata.pdf', 'Resolución oficial que autoriza la rifa (EDSA).', conv.linea_id);
    if (!env || !env.ok) { await nota(conv, 'Intenté enviar la resolución pero no se pudo: ' + ((env && env.error) || 'error')); return 'No se pudo enviar el documento. Dile que en un momento se lo hace llegar un asesor.'; }
    await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: '📄 Resolución oficial de EDSA (PDF enviado)', wa_message_id: env.wa_message_id });
    await nota(conv, 'Envié la resolución oficial (PDF de EDSA).');
    return 'Listo, le envié el PDF de la resolución oficial de EDSA. Aprovecha para reforzar la confianza y retomar la venta.';
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
    } else if (m.direccion === 'nota') {
      // Las acciones que el agente YA ejecutó: se las recordamos para que no las repita ni las olvide.
      role = 'assistant';
      text = '(' + String(m.texto || '').replace(/^🤖\s*/, 'ya hice esto → ') + ')';
    } else {
      continue;
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
  if (!esMateo(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo.' });
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

    // Solo se le ofrecen a la IA las herramientas IMPLEMENTADAS que estén ACTIVAS en la cabina.
    const { data: hsAct } = await supabase.from('agente_herramientas')
      .select('clave').eq('linea_id', linea_id).eq('activa', true);
    const activas = new Set((hsAct || []).map(h => h.clave));
    const toolsActivas = TOOLS.filter(t => activas.has(t.name));

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
        body: JSON.stringify({ model: modelo, max_tokens: 1024, system, messages, ...(toolsActivas.length ? { tools: toolsActivas } : {}) }),
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
      let cerrarSinTexto = false;
      for (const tu of toolUses) {
        let out;
        try { out = await ejecutarHerramienta(tu.name, tu.input || {}, conv); }
        catch (e) { out = 'Error ejecutando la herramienta: ' + e.message; }
        if (typeof out === 'string' && out.startsWith('AGENTE_APAGADO')) apagado = true;
        // El contacto inicial YA termina con "¿Te explico los premios?": cerramos
        // el turno aquí para que el agente NO escriba otro mensaje repitiéndola.
        if (tu.name === 'enviar_contacto_inicial') cerrarSinTexto = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      if (cerrarSinTexto && !apagado) break;
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

    return res.status(200).json({ status: 'ok', agente_activo: !apagado });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
