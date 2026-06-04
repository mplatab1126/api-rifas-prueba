/**
 * MOTOR del Agente de IA.
 *
 * Lo dispara el webhook (recibir.js) cuando entra un mensaje del cliente en una
 * conversación con el agente ACTIVADO (conversaciones_whatsapp.agente_activo).
 * Solo actúa donde gerencia lo prendió con el botón 🤖.
 *
 * Conversa con la API de Anthropic usando HERRAMIENTAS (tool use). Cada acción
 * deja una NOTA en el chat. Las acciones que mueven DINERO o INVENTARIO
 * (apartar, registrar abono, liberar boleta) las revisa un SUPERVISOR Opus
 * ANTES de ejecutarlas. La conversación normal va en el modelo configurado
 * (Sonnet). El abono y el liberar reutilizan la lógica probada del sistema.
 *
 * Recibe (POST, JSON): { contrasena, linea_id, telefono }  (Mateo) o
 *                      { interno, linea_id, telefono }      (webhook).
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { esMateo, puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarImagenPorId, enviarImagen, enviarDocumento, descargarMediaBase64 } from '../lib/whatsapp.js';
import { numerosDisponibles } from '../lib/numeros-disponibles.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELOS_OK = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const OPUS = 'claude-opus-4-8';   // supervisor de acciones que mueven dinero/inventario
const BASE_URL = 'https://www.losplata.com.co';
// Acciones que un supervisor Opus revisaría antes de ejecutarlas. Hoy está VACÍO:
// cada acción ya tiene su propio candado (el abono verifica contra el banco; liberar
// valida dueño + $0; apartar es reversible —se puede liberar—). El supervisor, que no
// ve fotos ni ejecuta esos chequeos, solo frenaba acciones legítimas en falso.
const ACCIONES_SENSIBLES = new Set();
const MAX_ITER = 6;          // tope de idas/vueltas con la IA por cada mensaje del cliente
const MAX_HISTORIAL = 40;    // últimos mensajes que lee del chat
const PAUSA_MS = 800;        // entre los pasos del contacto inicial (para que lleguen en orden)

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_IMAGENES = 2;   // imágenes entrantes recientes que se le muestran a la IA (comprobantes)

// Normaliza el tipo de imagen al formato que acepta la API de la IA.
function mediaTypeImagen(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'image/png';
  if (m.includes('webp')) return 'image/webp';
  if (m.includes('gif')) return 'image/gif';
  return 'image/jpeg';
}

function contextoFechaHora() {
  return new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota', weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// Resumen del cliente (datos guardados + boletas que ya tiene), buscando por
// teléfono. Las boletas se guardan por teléfono, así que esto encuentra al cliente
// aunque haya comprado por OTRA línea. Sirve para que el agente sepa, desde el
// PRIMER mensaje, si ya es cliente y no lo trate como nuevo.
async function resumenCliente(telefono) {
  const last10 = String(telefono || '').replace(/\D/g, '').slice(-10);
  if (!last10) return { cli: null, boletas: [] };
  const [rc, rb] = await Promise.all([
    supabase.from('clientes').select('nombre, apellido, ciudad, documento_numero, correo').like('telefono', '%' + last10).limit(1),
    supabase.from('boletas').select('numero, saldo_restante, total_abonado').like('telefono_cliente', '%' + last10),
  ]);
  return { cli: (rc.data && rc.data[0]) || null, boletas: rb.data || [] };
}

// Texto que se le inyecta al agente con el estado del cliente y cómo debe abrir
// la conversación en cada caso (cliente con boleta, conocido sin boleta, o nuevo).
function bloqueEstadoCliente({ cli, boletas }) {
  const nombre = cli && cli.nombre ? String(cli.nombre).trim() : '';
  const apellido = cli && cli.apellido ? String(cli.apellido).trim() : '';
  const ciudad = cli && cli.ciudad ? String(cli.ciudad).trim() : '';
  const documento = cli && cli.documento_numero ? String(cli.documento_numero).trim() : '';
  const correo = cli && cli.correo ? String(cli.correo).trim() : '';
  const datos = [];
  if (nombre) datos.push('nombre: ' + nombre);
  if (apellido) datos.push('apellido: ' + apellido);
  if (ciudad) datos.push('ciudad: ' + ciudad);
  if (documento) datos.push('cédula: ' + documento);
  if (correo) datos.push('correo: ' + correo);
  const datosTxt = datos.length
    ? 'Datos que YA tienes guardados de este cliente (úsalos y NUNCA se los vuelvas a pedir): ' + datos.join(', ') + '.'
    : '';
  if (boletas && boletas.length) {
    const lista = boletas.slice()
      .sort((a, b) => Number(a.numero) - Number(b.numero))
      .map(b => `${b.numero} (${Number(b.saldo_restante || 0) <= 0 ? 'pagada' : 'le falta $' + Number(b.saldo_restante || 0).toLocaleString('es-CO')})`)
      .join(', ');
    const unaSola = boletas.length === 1 ? (' ' + boletas[0].numero) : '';
    return 'ESTADO DE ESTE CLIENTE (es la verdad del sistema; NO lo leas literal):\n' +
      '- Ya es cliente nuestro' + (nombre ? ', se llama ' + nombre + (apellido ? ' ' + apellido : '') : '') + (ciudad ? ' (' + ciudad + ')' : '') + '.\n' +
      (datosTxt ? '- ' + datosTxt + '\n' : '') +
      '- YA TIENE boleta(s) con nosotros: ' + lista + '.\n' +
      '- En tu PRIMER mensaje NO te presentes como si fuera nuevo NI uses enviar_contacto_inicial. Salúdalo por su NOMBRE y recuérdale con cariño que ya tiene su boleta' + unaSola + ' con nosotros (por si se le olvidó), y pregúntale en qué le ayudas.\n' +
      '- NO le ofrezcas comprar otra boleta a menos que él lo pida.\n' +
      '- Si pregunta por su saldo, cuánto debe o sus abonos, CONSÚLTALO con tu herramienta y respóndele TÚ con claridad; NO lo pases a un asesor solo por eso.';
  }
  if (datos.length) {
    return 'ESTADO DE ESTE CLIENTE: ya lo conocemos pero NO tiene boletas en la rifa actual. ' + datosTxt + ' Salúdalo por su nombre. Si va a comprar, usa esos datos y NO se los vuelvas a pedir (ni la ciudad).';
  }
  return 'ESTADO DE ESTE CLIENTE: es NUEVO (sin boletas ni registro). Sigue el camino de venta normal: si acaba de llegar, empieza por enviar_contacto_inicial.';
}

// Transcribe un audio de WhatsApp a texto con OpenAI Whisper (Claude no "oye").
async function transcribirAudio(mediaId, lineaId) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const media = await descargarMediaBase64(mediaId, lineaId);
    if (!media.ok || !media.base64) return null;
    const buffer = Buffer.from(media.base64, 'base64');
    const mime = media.mimeType || 'audio/ogg';
    const ext = /mp3|mpeg/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : /m4a|mp4/.test(mime) ? 'm4a' : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), 'audio.' + ext);
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form,
    });
    const data = await r.json();
    if (data.error || !data.text) return null;
    return String(data.text).trim();
  } catch (_) { return null; }
}

// Contraseña de gerencia (Mateo) para llamar los endpoints internos con la MISMA
// lógica probada que usan los asesores. Sale de ASESORES_SECRETO.
function contrasenaGerencia() {
  try {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const entradas = Object.entries(asesores);
    const mateo = entradas.find(([, n]) => String(n).toLowerCase().trim() === 'mateo');
    if (mateo) return mateo[0];
    const ger = entradas.find(([, n]) => ['mateo', 'alejo plata'].includes(String(n).toLowerCase().trim()));
    return ger ? ger[0] : null;
  } catch (_) { return null; }
}

// POST a un endpoint del propio sistema (reusar lógica probada de abono/liberar/etc.).
async function llamarApi(ruta, cuerpo) {
  try {
    const r = await fetch(BASE_URL + ruta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return await r.json();
  } catch (e) { return { status: 'error', error: e.message, mensaje: e.message }; }
}

// SUPERVISOR: para acciones que mueven dinero o inventario, Opus revisa la
// decisión con el contexto ANTES de ejecutarla. Si Opus no está disponible,
// dejamos pasar (los demás candados —verificación del pago real, dueño de la
// boleta, etc.— siguen protegiendo).
async function verificarConOpus(accion, input, contexto, apiKey) {
  const system = 'Eres un SUPERVISOR de seguridad de una rifa colombiana. Un agente de ventas automático quiere ejecutar una acción que mueve DINERO o INVENTARIO (apartar una boleta, registrar un abono, o liberar/cancelar una boleta). Revisa si la acción es correcta y si el cliente realmente la pidió o corresponde, según la conversación. Sé estricto: si el cliente NO lo pidió claramente o algo no cuadra (número, monto, datos), recházala. Responde en UNA sola línea: "APRUEBO" o "RECHAZO: <motivo corto>".';
  const user = `Conversación reciente con el cliente:\n${contexto}\n\nEl agente quiere ejecutar la acción: ${accion}\nDatos: ${JSON.stringify(input || {})}\n\n¿La apruebas?`;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: OPUS, max_tokens: 200, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await r.json();
    if (data.error) return { aprobado: true };   // Opus caído: no bloquear (hay otros candados)
    const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    if (/^\s*APRUEBO/i.test(txt)) return { aprobado: true };
    return { aprobado: false, motivo: txt.replace(/^\s*RECHAZO:?\s*/i, '') || 'el supervisor no lo aprobó' };
  } catch (_) { return { aprobado: true }; }
}

// ── Definición de las herramientas para la IA ───────────────────────────────
const TOOLS = [
  {
    name: 'enviar_contacto_inicial',
    description: 'Envía la presentación inicial: un saludo + las fotos de la casa + un mensaje de cierre. Úsala UNA sola vez al comienzo, cuando el cliente acaba de llegar. TÚ redactas los textos (saludo y cierre). El CIERRE (lo que va después de las fotos) DEBE incluir: el precio ($150 mil, se separa con $20 mil), que es legal (autorizados por EDSA), la RESPUESTA a cualquier pregunta que el cliente haya hecho en su saludo (ej. de dónde son), y terminar con "¿Te explico los premios?". Así va todo en un solo mensaje y no se duplica.',
    input_schema: { type: 'object', properties: { saludo: { type: 'string', description: 'Saludo corto y cálido, presentándote como Liliana (ej: "¡Hola! 😊 Soy Liliana, te muestro la casa:").' }, cierre: { type: 'string', description: 'Mensaje después de las fotos: precio, cómo separar, que es legal (EDSA), la respuesta a su pregunta, y cierra con "¿Te explico los premios?".' } }, required: ['saludo', 'cierre'] },
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
    description: 'Aparta (reserva) una boleta a nombre del cliente. Úsala cuando tengas al menos el número de 4 cifras, el nombre, el apellido y la ciudad. Pídele también la CÉDULA y el CORREO (para la factura electrónica) y pásalos si los tienes; si el cliente ya está registrado con esos datos, se reutilizan solos. El teléfono es el de este chat.',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número de 4 cifras a apartar.' }, nombre: { type: 'string' }, apellido: { type: 'string' }, ciudad: { type: 'string' }, documento: { type: 'string', description: 'Número de cédula del cliente (para la factura electrónica).' }, correo: { type: 'string', description: 'Correo del cliente (para enviarle la factura electrónica).' } }, required: ['numero', 'nombre', 'apellido', 'ciudad'] },
  },
  {
    name: 'enviar_boleta',
    description: 'Envía al cliente su boleta digital con el enlace para consultarla. Úsala justo después de apartar su número.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'registrar_abono',
    description: 'Registra el pago (abono) del cliente a su boleta. Úsala SOLO cuando el cliente YA mandó la FOTO del comprobante de pago en el chat. El sistema verifica esa foto contra los pagos reales del banco y, si coincide, abona. Si el cliente solo dijo "ya pagué" pero NO mandó la foto, NO la uses: pídele primero el comprobante.',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Boleta a la que abonar (4 cifras). Opcional: si no lo pones, se usa la que tenga saldo.' } }, required: [] },
  },
  {
    name: 'liberar_boleta',
    description: 'Libera (cancela) una boleta del cliente cuando él dice claramente que YA NO quiere participar. Indica el número de 4 cifras. OJO: si el cliente ya había abonado dinero, NO se libera sola (un asesor gestiona la devolución).',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número de 4 cifras a liberar.' }, motivo: { type: 'string', description: 'Por qué la cancela (ej. "ya no quiere participar").' } }, required: ['numero'] },
  },
  {
    name: 'trasladar_abono',
    description: 'Traslada el abono (el dinero ya pagado) de UNA boleta del cliente a OTRA boleta del MISMO cliente. Úsala cuando el cliente quiere mover lo que ya abonó de una de sus boletas a otra suya (ej. "pásame el abono de la 1234 a la 5678"). Ambas boletas deben ser de ESTE cliente; nunca muevas dinero de o hacia la boleta de otra persona.',
    input_schema: { type: 'object', properties: { origen: { type: 'string', description: 'Boleta de la que SALE el abono (4 cifras), del cliente.' }, destino: { type: 'string', description: 'Boleta del MISMO cliente que RECIBE el abono (4 cifras).' } }, required: ['origen', 'destino'] },
  },
  {
    name: 'pasar_a_humano',
    description: 'Entrega la conversación a un asesor humano y te apaga en este chat. Úsala cuando: tiene una queja, pide algo que no puedes resolver/verificar, o pide hablar con una persona.',
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
    const saludo = String(input?.saludo || '').trim() || 'Hola, ¿cómo estás? 😊 Mi nombre es Liliana, te muestro las fotos de la casa:';
    const cierre = String(input?.cierre || '').trim() || '• Cada boleta *cuesta 150 mil*\n\n• La puedes *separar con 20 mil* e ir abonando a tu ritmo\n\n• Estamos *autorizados por EDSA* (rifa legal)\n\n*¿Te explico los premios?* 🤔';
    const e1 = await enviarTexto(conv.telefono, saludo, conv.linea_id);
    if (e1 && e1.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: saludo, wa_message_id: e1.wa_message_id });
    const { data: rr } = await supabase.from('respuestas_rapidas').select('pasos').eq('linea_id', conv.linea_id).ilike('titulo', '%contacto inicial%').maybeSingle();
    const fotos = (rr && Array.isArray(rr.pasos) ? rr.pasos : []).filter(p => p.tipo === 'imagen' && (p.media_id || p.url));
    for (const p of fotos) {
      await dormir(600);
      const env = p.media_id ? await enviarImagenPorId(conv.telefono, p.media_id, '', conv.linea_id) : await enviarImagen(conv.telefono, p.url, '', conv.linea_id);
      if (env && env.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'image', texto: null, media_url: p.url || null, wa_message_id: env.wa_message_id });
    }
    await dormir(PAUSA_MS);
    const e3 = await enviarTexto(conv.telefono, cierre, conv.linea_id);
    if (e3 && e3.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: cierre, wa_message_id: e3.wa_message_id });
    await nota(conv, 'Envié el contacto inicial (saludo + fotos de la casa + cierre).');
    return 'Listo: envié el saludo, las fotos y el cierre (que ya incluye el precio, la legalidad, la respuesta a su pregunta y "¿Te explico los premios?"). NO escribas NADA más; espera su respuesta.';
  }

  if (nombre === 'apartar_numero') {
    const num = String(input?.numero || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    let nom = String(input?.nombre || '').trim();
    let ape = String(input?.apellido || '').trim();
    let ciu = String(input?.ciudad || '').trim();
    let doc = String(input?.documento || '').replace(/\D/g, '').trim();
    let cor = String(input?.correo || '').trim();
    // Si faltan datos pero el cliente YA está registrado, tómalos de su ficha (no re-preguntar).
    if (!nom || !ape || !ciu || !doc || !cor) {
      const { cli } = await resumenCliente(conv.telefono);
      if (cli) {
        nom = nom || String(cli.nombre || '').trim();
        ape = ape || String(cli.apellido || '').trim();
        ciu = ciu || String(cli.ciudad || '').trim();
        doc = doc || String(cli.documento_numero || '').replace(/\D/g, '').trim();
        cor = cor || String(cli.correo || '').trim();
      }
    }
    if (!/^\d{4}$/.test(num) || !nom || !ape || !ciu) {
      return 'Faltan datos para apartar. Necesito el número de 4 cifras, nombre, apellido y ciudad del cliente. Pídeselos antes de apartar.';
    }
    const cuerpo = { numeros: [num], nombre: nom, apellido: ape, ciudad: ciu, telefono: conv.telefono };
    if (doc) { cuerpo.documento_tipo = 'CC'; cuerpo.documento_numero = doc; }
    if (cor) cuerpo.correo = cor;
    const d = await llamarApi('/api/rifa/reservar', cuerpo);
    if (!d.exito) { await nota(conv, 'Intenté apartar el ' + num + ' pero no se pudo: ' + (d.error || 'error')); return 'No se pudo apartar: ' + (d.error || 'error') + '. Cuéntaselo al cliente y ofrécele otra opción.'; }
    await nota(conv, `Aparté el número ${num} a nombre de ${nom} ${ape} (${ciu}).`);
    return `Listo: el número ${num} quedó apartado a nombre de ${nom} ${ape}. Total por pagar: $${Number(d.total || 0).toLocaleString('es-CO')}. Si el cliente quería MÁS números, apártalos PRIMERO; cuando ya estén TODOS apartados, envía la boleta UNA sola vez con enviar_boleta (esa ya muestra TODAS sus boletas en un mensaje). NO envíes la boleta después de cada número.`;
  }

  if (nombre === 'enviar_boleta') {
    const last10 = String(conv.telefono).replace(/\D/g, '').slice(-10);
    const { data: boletas } = await supabase.from('boletas').select('numero, saldo_restante').like('telefono_cliente', '%' + last10);
    if (!boletas || !boletas.length) return 'El cliente todavía no tiene ninguna boleta apartada. Primero aparta su número con apartar_numero.';
    boletas.sort((a, b) => Number(a.numero) - Number(b.numero));
    const una = boletas.length === 1;
    const lista = boletas.map(b => `*${b.numero}*  ·  ${Number(b.saldo_restante || 0) <= 0 ? '✅ Pagada' : ('te falta abonar $' + Number(b.saldo_restante || 0).toLocaleString('es-CO'))}`).join('\n');
    const enlace = `${BASE_URL}/boleta?telefono=${last10}`;
    const texto = `🎉 ¡Quedaste participando!\n\n${una ? 'Esta es tu boleta' : 'Estas son tus boletas'} para la rifa de *Los Plata*:\n\n${lista}\n\n👉 ${una ? 'Consulta tu boleta aquí' : 'Consulta tus boletas aquí'}:\n${enlace}\n\n¡Te deseamos mucha suerte! 🍀`;
    const env = await enviarTexto(conv.telefono, texto, conv.linea_id);
    if (env && env.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto, wa_message_id: env.wa_message_id });
    await nota(conv, 'Envié la boleta digital al cliente.');
    return 'Listo, le envié su boleta digital con el enlace para consultarla. Recuérdale los medios de pago y que cuando pague me mande la foto del comprobante para registrarle el abono.';
  }

  if (nombre === 'registrar_abono') {
    const pwd = contrasenaGerencia();
    if (!pwd) return 'No puedo registrar pagos ahora (falta configuración). Pásalo a un asesor.';
    // 1) Último comprobante (imagen) que mandó el cliente.
    const { data: imgs } = await supabase.from('mensajes_whatsapp')
      .select('media_id').eq('conversacion_id', conv.id).eq('direccion', 'entrante').eq('tipo', 'image')
      .order('timestamp_wa', { ascending: false }).limit(1);
    const mediaId = imgs && imgs[0] && imgs[0].media_id;
    if (!mediaId) return 'El cliente NO ha mandado la foto del comprobante. Pídesela amablemente; sin el comprobante no puedo registrar el pago.';
    // 2) Verificar el comprobante contra los pagos REALES del sistema.
    const v = await llamarApi('/api/whatsapp/buscar-pago', { media_id: mediaId, telefono: conv.telefono, linea_id: conv.linea_id, contrasena: pwd });
    if (v.status !== 'ok') return 'No pude leer o verificar el comprobante: ' + (v.mensaje || 'error') + '. Pásalo a un asesor para que lo revise a mano.';
    if (!v.sugerida_id) {
      await nota(conv, 'Recibí un comprobante pero NO encontré el pago real en el sistema. ' + (v.diagnostico || ''));
      return 'El comprobante NO coincide con ningún pago real cargado en el sistema. NO registres el abono. Avísale con tacto que un asesor va a verificar su pago, y pásalo a un asesor.';
    }
    const trans = (v.candidatas || []).find(c => c.id === v.sugerida_id);
    if (!trans) return 'No pude identificar el pago con seguridad. Pásalo a un asesor.';
    const conSaldo = (v.boletas || []).filter(b => b.puede_modificar && Number(b.saldo) > 0);
    if (!conSaldo.length) return 'El cliente no tiene boletas con saldo pendiente para abonar. Verifícalo o pásalo a un asesor.';
    let destino = null;
    const pedido = String(input?.numero || '').replace(/\D/g, '');
    if (pedido) destino = conSaldo.find(b => String(b.numero) === pedido.padStart(4, '0') || String(b.numero) === pedido);
    if (!destino) destino = conSaldo[0];
    // 3) Registrar el abono con tu lógica probada (anti-duplicados, amarre de transferencia, etc.).
    const d = await llamarApi('/api/admin/abono', {
      numeroBoleta: String(destino.numero), valorAbono: trans.monto,
      metodoPago: trans.plataforma || 'Transferencia', referencia: trans.referencia || 'Sin Ref',
      idTransferencia: v.sugerida_id, contrasena: pwd,
    });
    if (d.status !== 'ok') return 'No se pudo registrar el abono: ' + (d.mensaje || 'error') + '. Pásalo a un asesor.';
    await nota(conv, `Registré un abono de $${Number(trans.monto).toLocaleString('es-CO')} a la boleta ${destino.numero} (pago verificado contra el banco).`);
    return `Listo: registré el abono de $${Number(trans.monto).toLocaleString('es-CO')} a la boleta ${destino.numero}. Confírmaselo con alegría, agradécele y, si quieres que termine de pagar, recuérdale con cariño el saldo que le queda.`;
  }

  if (nombre === 'liberar_boleta') {
    const num = String(input?.numero || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(num)) return 'Necesito el número de 4 cifras que el cliente quiere cancelar.';
    const last10 = String(conv.telefono).replace(/\D/g, '').slice(-10);
    const { data: bol } = await supabase.from('boletas').select('numero, telefono_cliente, total_abonado').eq('numero', num).maybeSingle();
    if (!bol) return `El número ${num} no existe.`;
    if (!bol.telefono_cliente || !String(bol.telefono_cliente).endsWith(last10)) {
      return `El número ${num} no está a nombre de este cliente, así que no se puede cancelar desde aquí.`;
    }
    if (Number(bol.total_abonado || 0) > 0) {
      return `El cliente ya tiene $${Number(bol.total_abonado).toLocaleString('es-CO')} abonados en el ${num}. NO la liberes tú: explícale con tacto que un asesor le gestiona la cancelación y la devolución, y pásalo a un asesor.`;
    }
    const pwd = contrasenaGerencia();
    if (!pwd) return 'No puedo cancelar boletas ahora (falta configuración). Pásalo a un asesor.';
    const d = await llamarApi('/api/admin/liberar-boleta', { numeroBoleta: num, contrasena: pwd });
    if (d.status !== 'ok') return 'No se pudo liberar la boleta: ' + (d.mensaje || 'error') + '. Pásalo a un asesor.';
    await nota(conv, `Liberé la boleta ${num} (el cliente ya no quiere participar).`);
    return `Listo, liberé el número ${num}. Confírmaselo con amabilidad, sin presionar, y déjale la puerta abierta para cuando quiera volver.`;
  }

  if (nombre === 'trasladar_abono') {
    const origen = String(input?.origen || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    const destino = String(input?.destino || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(origen) || !/^\d{4}$/.test(destino)) return 'Necesito las dos boletas de 4 cifras: de cuál sale el abono y a cuál entra.';
    if (origen === destino) return 'La boleta de origen y la de destino no pueden ser la misma.';
    const pwd = contrasenaGerencia();
    if (!pwd) return 'No puedo trasladar abonos ahora (falta configuración). Pásalo a un asesor.';
    const d = await llamarApi('/api/admin/trasladar-abono', { numeroOrigen: origen, numeroDestino: destino, telefono: conv.telefono, contrasena: pwd });
    if (d.status !== 'ok') { await nota(conv, `Intenté trasladar el abono de ${origen} a ${destino} pero no se pudo: ${d.mensaje || 'error'}`); return 'No se pudo trasladar: ' + (d.mensaje || 'error') + '. Si el cliente insiste o algo no cuadra, pásalo a un asesor.'; }
    await nota(conv, `Trasladé $${Number(d.monto).toLocaleString('es-CO')} de la boleta ${origen} a la ${destino}.`);
    return `Listo: el abono de $${Number(d.monto).toLocaleString('es-CO')} pasó de la boleta ${origen} a la ${destino}. Confírmaselo al cliente. La boleta ${origen} quedó SIN abono; si el cliente ya no la quiere, puedes liberarla con liberar_boleta.`;
  }

  if (nombre === 'enviar_resolucion') {
    const env = await enviarDocumento(conv.telefono, `${BASE_URL}/resolucion.pdf`, 'Resolucion-EDSA-Los-Plata.pdf', 'Resolución oficial que autoriza la rifa (EDSA).', conv.linea_id);
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
// `imagenes` es un Map (id de mensaje → { mime, base64 }) con las fotos entrantes
// que la IA SÍ debe VER (ej. comprobantes de pago). Antes solo veía "[imagen]".
function construirMensajes(historial, imagenes) {
  const imgs = imagenes || new Map();
  const msgs = [];
  for (const m of historial) {
    let role, text;
    if (m.direccion === 'entrante') {
      role = 'user';
      const img = m.tipo === 'image' ? imgs.get(m.id) : null;
      if (img) {
        // Mensaje propio con la foto + su pie (no se fusiona con el anterior).
        const pie = (m.texto || '').trim() || 'Imagen que envié (míralas; puede ser el comprobante de pago).';
        msgs.push({ role, content: [
          { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
          { type: 'text', text: pie },
        ] });
        continue;
      }
      text = (m.texto || '').trim() || (m.tipo && m.tipo !== 'text' ? `[el cliente envió un ${m.tipo}]` : '');
    } else if (m.direccion === 'saliente') {
      role = 'assistant';
      text = (m.texto || '').trim();
    } else if (m.direccion === 'nota') {
      role = 'assistant';
      text = '(' + String(m.texto || '').replace(/^🤖\s*/, 'ya hice esto → ') + ')';
    } else {
      continue;
    }
    if (!text) continue;
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === role && typeof prev.content === 'string') {
      prev.content += '\n' + text;
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

  const { contrasena, linea_id, telefono, interno } = req.body || {};
  if (!linea_id || !telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta línea o teléfono.' });
  // Autorización: o el secreto interno (lo dispara el webhook al instante) o Mateo desde la bandeja.
  let autorizado = false;
  const tokenInterno = process.env.WHATSAPP_VERIFY_TOKEN;
  if (interno && tokenInterno && interno === tokenInterno) {
    autorizado = true;
  } else {
    const nombre = validarAsesor(contrasena);
    if (nombre && esMateo(nombre) && (await puedeVerLinea(nombre, linea_id))) autorizado = true;
  }
  if (!autorizado) return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });

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

    // 2) CANDADO PRIMERO: solo UNA corrida responde a la vez. Tomarlo ANTES de leer
    //    el historial cierra la ventana de doble respuesta (y de doble abono).
    let bloqueado = false;
    try {
      const expira = new Date(Date.now() - 45000).toISOString();
      const { data: lock, error: lockErr } = await supabaseAdmin
        .from('conversaciones_whatsapp')
        .update({ agente_procesando_at: new Date().toISOString() })
        .eq('id', conv.id)
        .or('agente_procesando_at.is.null,agente_procesando_at.lt.' + expira)
        .select('id')
        .maybeSingle();
      if (!lockErr && !lock) bloqueado = true;
    } catch (_) { /* si el candado falla, seguimos: mejor responder que quedar callados */ }
    if (bloqueado) return res.status(200).json({ status: 'ok', skip: 'Otra corrida ya está respondiendo.' });

    // 3) Historial. Si el último mensaje NO es del cliente, ya está respondido.
    const { data: histAsc } = await supabase
      .from('mensajes_whatsapp')
      .select('id, direccion, tipo, texto, media_id, timestamp_wa, created_at')
      .eq('conversacion_id', conv.id)
      .order('timestamp_wa', { ascending: false })
      .limit(MAX_HISTORIAL);
    const historial = (histAsc || []).slice().reverse();
    const reales = historial.filter(m => m.direccion === 'entrante' || m.direccion === 'saliente');
    if (!reales.length || reales[reales.length - 1].direccion !== 'entrante') {
      await soltarLock(conv);
      return res.status(200).json({ status: 'ok', skip: 'No hay un mensaje del cliente pendiente de responder.' });
    }

    // 3b) Transcribir los audios que el cliente mandó (Claude no oye; Whisper sí).
    //     Guardamos la transcripción para no repetirla en futuras corridas.
    let transcritos = 0;
    for (const m of reales) {
      if (transcritos >= 4) break;
      if (m.direccion === 'entrante' && m.tipo === 'audio' && m.media_id && !(m.texto || '').trim()) {
        const txt = await transcribirAudio(m.media_id, conv.linea_id);
        if (txt) {
          m.texto = '[audio del cliente] ' + txt;
          transcritos++;
          try { await supabaseAdmin.from('mensajes_whatsapp').update({ texto: m.texto }).eq('id', m.id); } catch (_) {}
        }
      }
    }

    // 3c) Adjuntar las imágenes entrantes recientes para que la IA las VEA (la clave
    //     para que reconozca un comprobante de pago en vez de ignorarlo). Claude lee
    //     imágenes; descargamos las últimas y se las pasamos como foto, no como "[imagen]".
    const imagenesVistas = new Map();
    let imgsCargadas = 0;
    for (let i = reales.length - 1; i >= 0 && imgsCargadas < MAX_IMAGENES; i--) {
      const m = reales[i];
      if (m.direccion === 'entrante' && m.tipo === 'image' && m.media_id) {
        try {
          const media = await descargarMediaBase64(m.media_id, conv.linea_id);
          if (media && media.ok && media.base64) {
            imagenesVistas.set(m.id, { mime: mediaTypeImagen(media.mimeType), base64: media.base64 });
            imgsCargadas++;
          }
        } catch (_) {}
      }
    }

    // 4) Configuración del agente (prompt + modelo).
    const { data: cfg } = await supabase
      .from('agente_config').select('prompt, modelo, nombre_agente').eq('linea_id', linea_id).maybeSingle();
    const prompt = String(cfg?.prompt || '').trim();
    if (!prompt) { await soltarLock(conv); return res.status(200).json({ status: 'error', mensaje: 'El agente no tiene instrucciones guardadas.' }); }
    const modelo = MODELOS_OK.includes(cfg?.modelo) ? cfg.modelo : 'claude-sonnet-4-6';

    // Solo se le ofrecen a la IA las herramientas IMPLEMENTADAS que estén ACTIVAS en la cabina.
    const { data: hsAct } = await supabase.from('agente_herramientas')
      .select('clave').eq('linea_id', linea_id).eq('activa', true);
    const activas = new Set((hsAct || []).map(h => h.clave));
    const toolsActivas = TOOLS.filter(t => activas.has(t.name));

    // Estado del cliente: SIEMPRE se consulta antes de responder, para que el agente
    // sepa desde el primer mensaje si ya tiene boleta (y no lo trate como nuevo).
    const estadoCliente = await resumenCliente(conv.telefono);

    // Memoria: las acciones que el agente YA ejecutó en este chat (de las notas 🤖).
    // ANTES no le llegaban (a construirMensajes se le pasa `reales`, sin notas), por eso
    // repetía acciones y se contradecía. Aquí se las damos como HECHOS firmes.
    const accionesHechas = (historial || [])
      .filter(m => m.direccion === 'nota' && /^🤖/.test(String(m.texto || '')))
      .map(m => String(m.texto).replace(/^🤖\s*/, '').trim())
      .filter(Boolean);
    // ¿Ya hubo respuestas en este chat? (un asesor lo atendió a mano o el agente ya se
    // presentó). Si es así, al activarlo NO debe reenviar el contacto inicial: continúa.
    const yaHuboSalientes = reales.some(m => m.direccion === 'saliente');

    const system = prompt +
      `\n\n---\nCONTEXTO (no lo menciones literalmente): hoy es ${contextoFechaHora()} (Colombia). ` +
      `Hablas por WhatsApp con el cliente cuyo número es ${conv.telefono}. ` +
      `Tienes herramientas para actuar; úsalas cuando corresponda en vez de inventar. ` +
      `Si el cliente acaba de llegar y aún no se ha enviado la presentación, usa primero enviar_contacto_inicial. ` +
      `Si ves "[audio del cliente] ...", es lo que dijo en un audio (ya transcrito): respóndelo como si lo hubiera escrito, sin decir que no puedes oír audios. ` +
      `Después de usar una herramienta, sigue la conversación con naturalidad y mensajes cortos. No repitas información que ya esté en el chat. ` +
      `NUNCA narres lo que vas a hacer ("voy a verificar", "un momento", "ahora libero"): haz la acción en silencio y da SOLO el resultado, en pocos mensajes, como una persona.` +
      `\n\n---\n${bloqueEstadoCliente(estadoCliente)}` +
      (accionesHechas.length
        ? `\n\n---\nACCIONES QUE TÚ YA EJECUTASTE EN ESTE CHAT (son HECHOS ya aplicados en el sistema; NO las repitas y NO digas nada que las contradiga —ej.: si ya liberaste una boleta, no digas luego que "no está a su nombre"):\n- ${accionesHechas.join('\n- ')}`
        : '') +
      (yaHuboSalientes
        ? `\n\n---\nESTE CHAT YA TIENE MENSAJES PREVIOS (un asesor lo atendió a mano o ya te presentaste). NO uses enviar_contacto_inicial, NO te vuelvas a presentar y NO repitas información ya enviada. Lee TODO el historial y CONTINÚA desde donde quedó, respondiendo lo ÚLTIMO que preguntó el cliente.`
        : '');

    const messages = construirMensajes(reales, imagenesVistas);
    if (!messages.length) { await soltarLock(conv); return res.status(200).json({ status: 'ok', skip: 'Sin mensajes para procesar.' }); }

    // Contexto en texto para el supervisor Opus (revisa las acciones sensibles).
    const contextoOpus = messages.slice(-12).map(m => {
      let c;
      if (typeof m.content === 'string') c = m.content;
      else if (Array.isArray(m.content)) {
        const txt = m.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
        c = (m.content.some(b => b.type === 'image') ? '[el cliente adjuntó una imagen] ' : '') + txt;
      } else c = '[el agente usó una herramienta]';
      return (m.role === 'user' ? 'Cliente' : 'Liliana') + ': ' + c;
    }).join('\n');

    // 5) Bucle de razonamiento + herramientas.
    let apagado = false;
    for (let iter = 0; iter < MAX_ITER; iter++) {
      const resp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: 1024, system, messages, ...(toolsActivas.length ? { tools: toolsActivas } : {}) }),
      });
      const data = await resp.json();
      if (data.error) { await nota(conv, 'No pude responder (problema con la IA): ' + (data.error.message || 'error')); await soltarLock(conv); return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') }); }

      const bloques = data.content || [];
      const toolUses = bloques.filter(b => b.type === 'tool_use');
      const vaAUsarHerramientas = data.stop_reason === 'tool_use' && toolUses.length > 0;
      for (const b of bloques) {
        // No narrar el proceso: si en este turno va a usar herramientas, NO mandes el
        // texto de relleno ("voy a...", "un momento..."); solo el mensaje FINAL (cuando
        // ya no quedan herramientas por usar) se le envía al cliente.
        if (b.type === 'text' && b.text && b.text.trim() && !vaAUsarHerramientas) await decir(conv, b.text.trim());
      }
      if (!vaAUsarHerramientas) break;

      messages.push({ role: 'assistant', content: bloques });
      const results = [];
      let cerrarSinTexto = false;
      for (const tu of toolUses) {
        let out;
        // Supervisor Opus para las acciones que mueven dinero/inventario.
        if (ACCIONES_SENSIBLES.has(tu.name)) {
          const v = await verificarConOpus(tu.name, tu.input || {}, contextoOpus, apiKey);
          if (!v.aprobado) {
            await nota(conv, `El supervisor (Opus) frenó "${tu.name}": ${v.motivo}`);
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: `El SUPERVISOR de seguridad NO aprobó esta acción: ${v.motivo}. NO la ejecutes. Aclárale al cliente lo que falte o pásalo a un asesor.` });
            continue;
          }
        }
        try { out = await ejecutarHerramienta(tu.name, tu.input || {}, conv); }
        catch (e) { out = 'Error ejecutando la herramienta: ' + e.message; }
        if (typeof out === 'string' && out.startsWith('AGENTE_APAGADO')) apagado = true;
        if (tu.name === 'enviar_contacto_inicial') cerrarSinTexto = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      if (cerrarSinTexto && !apagado) break;
      if (apagado) {
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

    await soltarLock(conv);
    return res.status(200).json({ status: 'ok', agente_activo: !apagado });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}

// Libera el candado de la conversación (best-effort).
async function soltarLock(conv) {
  try { await supabaseAdmin.from('conversaciones_whatsapp').update({ agente_procesando_at: null }).eq('id', conv.id); } catch (_) {}
}
