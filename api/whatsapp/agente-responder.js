/**
 * MOTOR del Agente de IA.
 *
 * Lo dispara el webhook (recibir.js) cuando entra un mensaje del cliente en una
 * conversación con el agente ACTIVADO (conversaciones_whatsapp.agente_activo).
 * Solo actúa donde gerencia lo prendió con el botón 🤖.
 *
 * Conversa con la API de Anthropic usando HERRAMIENTAS (tool use). Cada acción
 * deja una NOTA en el chat. Las acciones que mueven DINERO o INVENTARIO
 * (apartar, registrar abono, liberar boleta) tienen cada una su propio candado
 * (el abono se verifica contra el banco; liberar valida dueño + saldo $0; apartar
 * es reversible). La conversación va en el modelo configurado (Sonnet). El abono
 * y el liberar reutilizan la lógica probada del sistema.
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
import { ponerEtiqueta } from '../lib/etiquetas.js';
import { verificarYAbonar, asesorDeLinea } from '../lib/abono-agente.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELOS_OK = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const BASE_URL = 'https://www.losplata.com.co';
const MAX_ITER = 6;          // tope de idas/vueltas con la IA por cada mensaje del cliente
const MAX_HISTORIAL = 300;   // TOPE de seguridad de mensajes; el corte normal es por RIFA (ver abajo)
const PAUSA_MS = 800;        // entre los pasos del contacto inicial (para que lleguen en orden)
const DEBOUNCE_MS = 30000;     // silencio que esperamos desde el ÚLTIMO mensaje del cliente antes de responder (se reinicia con cada mensaje)
const DEBOUNCE_MAX_MS = 240000; // límite invisible (4 min) — el servidor no puede esperar infinito; en la práctica ningún cliente lo alcanza

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_IMAGENES = 2;   // imágenes entrantes recientes que se le muestran a la IA (comprobantes)

// Precios de la IA por MILLÓN de tokens (USD). Caché de escritura = 1.25× entrada,
// caché de lectura = 0.1× entrada. Sirve para calcular cuánto costó atender cada chat.
const PRECIOS = {
  'claude-opus-4-8':   { in: 5, out: 25, cw: 6.25, cr: 0.5 },
  'claude-sonnet-4-6': { in: 3, out: 15, cw: 3.75, cr: 0.3 },
  'claude-haiku-4-5':  { in: 1, out: 5,  cw: 1.25, cr: 0.1 },
};

// Convierte los tokens que devuelve Claude (usage) a dólares, según el modelo.
function costoUSD(modelo, usage) {
  const p = PRECIOS[modelo] || PRECIOS['claude-sonnet-4-6'];
  const inp = usage.input_tokens || 0;
  const out = usage.output_tokens || 0;
  const cw = usage.cache_creation_input_tokens || 0;
  const cr = usage.cache_read_input_tokens || 0;
  return (inp * p.in + out * p.out + cw * p.cw + cr * p.cr) / 1e6;
}

// Guarda lo que costó UNA respuesta de la IA en este chat (tokens + dólares).
// Best-effort: si falla, no rompe la conversación. Lo suma luego la ficha y el panel del día.
async function registrarUso(conv, modelo, usage) {
  if (!usage) return;
  try {
    await supabaseAdmin.from('agente_uso').insert({
      linea_id: conv.linea_id, telefono: conv.telefono, conversacion_id: conv.id, modelo,
      input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0,
      cache_write_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
      costo_usd: costoUSD(modelo, usage), origen: 'agente',
    });
  } catch (_) { /* el registro de costo nunca debe frenar al agente */ }
}

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

// "2026-07-04" → "sábado 4 de julio" (se parte la fecha a mano para no descuadrar por zona horaria).
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function etiquetaFecha(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3];
  const dia = DIAS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${dia} ${d} de ${MESES[mo - 1] || ''}`;
}

// Reemplaza las variables {{clave}} del libreto por su valor (el nombre del agente,
// los datos de pago, etc.). El prompt base es IGUAL para todas las líneas; solo
// cambian estas variables. Lo que no esté definido queda vacío.
function aplicarVariables(texto, vars) {
  const v = vars || {};
  return String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, clave) => {
    const val = v[clave];
    return (val == null || val === '') ? '' : String(val);
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
    supabase.from('boletas').select('numero, saldo_restante, total_abonado, asesor, fecha_venta').like('telefono_cliente', '%' + last10),
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
      .map(b => {
        const ab = Number(b.total_abonado || 0), fa = Number(b.saldo_restante || 0);
        return `${b.numero} (abonado $${ab.toLocaleString('es-CO')}, ${fa <= 0 ? 'PAGADA' : 'le falta $' + fa.toLocaleString('es-CO')})`;
      })
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

// ── Remisión: ¿este cliente le compró a OTRO punto de venta? ─────────────────
// Si el cliente que escribe a esta línea ya tiene boleta(s) vendida(s) por un
// asesor que NO es dueño de esta línea (ej. escribe a la línea de Liliana pero
// su boleta la vendió el equipo Los Plata u otro independiente), Liliana NO lo
// atiende: lo remite al número del punto donde compró. El número de cada asesor
// vive en `asesores_config.numero_remision` (editable sin desplegar código).
// Devuelve null si no hay que remitir (boleta propia de la línea, o sin boletas).
const normNombre = (s) => String(s || '').toLowerCase().trim();

async function analizarRemision(boletas, lineaId) {
  if (!boletas || !boletas.length || !lineaId) return null;
  // Asesor(es) DUEÑOS de esta línea (para Lili: 'Liliana'). Una boleta es "ajena"
  // si su asesor no está en este conjunto.
  const { data: owners } = await supabase
    .from('lineas_asesores').select('asesor').eq('phone_number_id', lineaId);
  const setOwners = new Set((owners || []).map(o => normNombre(o.asesor)));
  const ajenas = boletas.filter(b => b.asesor && !setOwners.has(normNombre(b.asesor)));
  if (!ajenas.length) return null;
  // Si hay boletas de varios vendedores distintos, remitir al de la MÁS RECIENTE.
  ajenas.sort((a, b) => String(b.fecha_venta || '').localeCompare(String(a.fecha_venta || '')));
  const asesorAjeno = ajenas[0].asesor;
  // Número del punto donde compró (puede no estar cargado todavía).
  const { data: ac } = await supabase
    .from('asesores_config').select('numero_remision')
    .ilike('asesor_nombre', asesorAjeno).maybeSingle();
  const numero = ac && ac.numero_remision ? String(ac.numero_remision).trim() : null;
  return { asesor: asesorAjeno, numero, numeros: ajenas.map(b => b.numero) };
}

// Bloque que se le inyecta al agente cuando el cliente debe REMITIRSE a su punto
// de venta. Reemplaza al bloqueEstadoCliente normal (no debe vender NI remitir a
// la vez). Si no hay número cargado, cae a pasar_a_humano.
function bloqueRemision(remision, { cli }) {
  const nombre = cli && cli.nombre ? String(cli.nombre).trim() : '';
  const saludo = nombre ? ('Salúdalo por su nombre (' + nombre + ') con cariño. ') : 'Salúdalo con cariño. ';
  const boletasTxt = remision.numeros && remision.numeros.length
    ? ('su(s) boleta(s) ' + remision.numeros.join(', '))
    : 'su boleta';
  if (!remision.numero) {
    return 'ATENCIÓN — ESTE CLIENTE NO ES DE ESTA LÍNEA (REMISIÓN OBLIGATORIA):\n' +
      '- ' + boletasTxt + ' la vendió OTRO punto de venta (no esta línea), y todavía no tengo a mano su número.\n' +
      '- NO lo atiendas tú: NO le vendas, NO le apartes números y NO le registres abonos.\n' +
      '- ' + saludo + 'Dile con tacto que su boleta la maneja otro punto de venta y que un asesor lo contacta para darle el contacto correcto. Luego usa pasar_a_humano. No hagas nada más.';
  }
  return 'ATENCIÓN — ESTE CLIENTE NO ES DE ESTA LÍNEA (REMISIÓN OBLIGATORIA):\n' +
    '- ' + boletasTxt + ' la vendió OTRO punto de venta (no esta línea): ' + remision.asesor + '.\n' +
    '- NO lo atiendas tú para vender, abonar ni apartar: NO uses enviar_contacto_inicial, NO te presentes como venta, NO le apartes números, NO le registres abonos ni uses esas herramientas con él.\n' +
    '- ' + saludo + 'Explícale con amabilidad y en pocas palabras que para CUALQUIER cosa de su boleta (pagar lo que falta, dudas, o incluso comprar otra) debe continuar por WhatsApp con el punto donde la compró, en este número: ' + remision.numero + '.\n' +
    '- Dale el número CLARO y solo, en una línea, para que lo pueda copiar/tocar (ej.: "Escríbeles a este número: ' + remision.numero + '"). Sé breve y cálida.\n' +
    '- Después de darle el número, NO sigas vendiéndole ni insistas: tu trabajo con este cliente terminó.';
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
    description: 'Aparta (reserva) una boleta a nombre del cliente. Lo OBLIGATORIO es: número de 4 cifras, nombre, apellido y ciudad. La CÉDULA y el CORREO son OPCIONALES (para la factura electrónica): pídelos UNA vez y pásalos si el cliente los da, pero si NO los tiene o NO los quiere dar, aparta IGUAL sin ellos (no insistas ni condiciones la reserva a eso). Si el cliente ya está registrado con esos datos, se reutilizan solos. El teléfono es el de este chat.',
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
    description: 'Traslada abono (dinero ya pagado) de UNA boleta del cliente a OTRA del MISMO cliente. Puedes mover TODO el abono o solo una PARTE: para DIVIDIR (ej. dejar $40.000 en una boleta y pasar $20.000 a otra) indica el "monto" a mover. Ejemplos: "pásame el abono de la 1234 a la 5678" = mueve todo; "deja $40.000 en la 1234 y pasa $20.000 a la 5678" = origen 1234, destino 5678, monto 20000. Ambas boletas deben ser de ESTE cliente; nunca muevas dinero de o hacia la boleta de otra persona.',
    input_schema: { type: 'object', properties: { origen: { type: 'string', description: 'Boleta de la que SALE el abono (4 cifras), del cliente.' }, destino: { type: 'string', description: 'Boleta del MISMO cliente que RECIBE el abono (4 cifras).' }, monto: { type: 'number', description: '(Opcional) cuánto mover. Si no lo pones, mueve TODO el abono de la boleta origen.' } }, required: ['origen', 'destino'] },
  },
  {
    name: 'actualizar_datos_cliente',
    description: 'Corrige o completa los datos de ESTE cliente (el del chat): nombre, apellido, ciudad, cédula o correo. Úsala cuando el cliente pide cambiar/corregir un dato ("mi correo es X", "mi cédula está mal", "soy de Medellín, no Cali") o cuando necesitas completar la cédula/correo para la factura electrónica. Pasa SOLO los campos que cambian; los demás se conservan solos. NO sirve para cambiar el número de teléfono.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' }, apellido: { type: 'string' }, ciudad: { type: 'string' }, documento: { type: 'string', description: 'Número de cédula del cliente.' }, correo: { type: 'string', description: 'Correo del cliente (para la factura electrónica).' } }, required: [] },
  },
  {
    name: 'programar_recordatorio',
    description: 'Agenda que TÚ MISMO le vuelvas a escribir al cliente más tarde, cuando él pide tiempo. Para HOY (en unas horas) usa "minutos" (ej. "escríbeme en 20 minutos" → minutos:20). Para OTRO DÍA usa "dias" (ej. "escríbeme el martes" → calcula cuántos días faltan desde HOY usando la fecha que tienes en el contexto, ej. dias:3; "en una semana" → dias:7). Pon también el motivo en una frase corta DIRIGIDA AL CLIENTE (en segunda persona, ej. "me dijiste que hoy ibas a separar tu boleta"): si la conversación se cierra y hay que reabrirla días después, esa misma frase es la que verá el cliente. Cuando agendes, díselo al cliente por WhatsApp ("dale, te escribo el martes por aquí"); NUNCA le ofrezcas una llamada ni otro medio. Si el cliente vuelve a escribir antes, el recordatorio se cancela solo. Un solo recordatorio activo por chat.',
    input_schema: { type: 'object', properties: { minutos: { type: 'number', description: 'Para HOY: en cuántos minutos volver a escribirle (ej. 20, 60).' }, dias: { type: 'number', description: 'Para OTRO DÍA: en cuántos días desde hoy volver a escribirle (ej. 3 = en 3 días). Úsalo en vez de minutos cuando el cliente pida en días.' }, motivo: { type: 'string', description: 'Por qué le vas a volver a escribir, en una frase corta DIRIGIDA AL CLIENTE (segunda persona, natural y clara, como si se la fueras a decir). Ej: "me dijiste que hoy ibas a separar tu boleta" o "quedaste de avisarme qué número te gustó". Esta frase puede mostrársele tal cual al cliente para reabrir la conversación, así que escríbela bien.' } }, required: [] },
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
      // no_leidos: 0 → cuando el agente responde, el chat queda "atendido" y se apaga
      // el contador verde de mensajes sin leer (antes solo se apagaba si un humano abría el chat).
      .update({ ultimo_mensaje: String(texto || '📷').slice(0, 200), ultimo_at: ts, ultimo_entrante: false, no_leidos: 0 })
      .eq('id', conv.id);
  } else {
    // Las notas (acciones del agente, reales o de modo sombra) también van al registro central
    // de actividad, para que Mateo las vea todas juntas en la cabina, no chat por chat.
    try {
      await supabaseAdmin.from('agente_actividad').insert({
        linea_id: conv.linea_id, telefono: conv.telefono, tipo: 'nota', resumen: String(texto || '').slice(0, 500),
      });
    } catch (_) { /* no es crítico */ }
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
  // MODO SOMBRA: no le escribe al cliente; deja una nota con lo que diría.
  if (conv.sombra) { await guardarEnChat(conv, { direccion: 'nota', tipo: 'nota', texto: '🌓 (modo sombra) le diría: «' + t + '»' }); return; }
  const env = await enviarTexto(conv.telefono, t, conv.linea_id);
  await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: t, wa_message_id: env.wa_message_id || null });
}

// Envía el "contacto inicial": saludo + fotos de la casa + cierre (precio/legalidad/"¿te explico
// los premios?"). Lo usan la herramienta enviar_contacto_inicial Y el atajo SIN IA del primer
// contacto genérico (ahorro de tokens). Todo se guarda en el chat (guardarEnChat marca el chat
// como respondido: ultimo_entrante=false, no_leidos=0).
async function enviarContactoInicial(conv, { saludo, cierre } = {}) {
  const sal = String(saludo || '').trim() || 'Hola, ¿cómo estás? 😊 Mi nombre es Liliana, te muestro las fotos de la casa:';
  const cie = String(cierre || '').trim() || '• Cada boleta *cuesta 150 mil*\n\n• La puedes *separar con 20 mil* e ir abonando a tu ritmo\n\n• Estamos *autorizados por EDSA* (rifa legal)\n\n*¿Te explico los premios?* 🤔';
  const e1 = await enviarTexto(conv.telefono, sal, conv.linea_id);
  if (e1 && e1.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: sal, wa_message_id: e1.wa_message_id });
  const { data: rr } = await supabase.from('respuestas_rapidas').select('pasos').eq('linea_id', conv.linea_id).ilike('titulo', '%contacto inicial%').maybeSingle();
  const fotos = (rr && Array.isArray(rr.pasos) ? rr.pasos : []).filter(p => p.tipo === 'imagen' && (p.media_id || p.url));
  for (const p of fotos) {
    await dormir(600);
    const env = p.media_id ? await enviarImagenPorId(conv.telefono, p.media_id, '', conv.linea_id) : await enviarImagen(conv.telefono, p.url, '', conv.linea_id);
    if (env && env.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'image', texto: null, media_url: p.url || null, wa_message_id: env.wa_message_id });
  }
  await dormir(PAUSA_MS);
  const e3 = await enviarTexto(conv.telefono, cie, conv.linea_id);
  if (e3 && e3.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: cie, wa_message_id: e3.wa_message_id });
}

// ¿El primer contacto es un saludo genérico SIN pregunta? (el ~88% es el texto del anuncio de
// Meta: "¡Hola! quiero más información."). Lista BLANCA conservadora: SOLO estos textos exactos
// disparan el saludo sin IA. Cualquier otra cosa (una pregunta, un número, un audio, etc.) la
// atiende la IA con normalidad. Así ahorramos sin robotizar ni ignorar preguntas reales.
function esContactoGenerico(reales) {
  const entrantes = (reales || []).filter(m => m.direccion === 'entrante');
  if (!entrantes.length || entrantes.length > 2) return false;
  const t = entrantes.map(m => String(m.texto || '')).join(' ').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')          // quita tildes
    .replace(/[¡!¿?.,:;*\-_/()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  const GENERICOS = new Set([
    'hola', 'hola hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
    'hola buenas', 'hola buenos dias', 'hola buenas tardes', 'hola buenas noches',
    'info', 'informacion', 'mas informacion', 'mas info', 'quiero info', 'quiero informacion',
    'quiero mas informacion', 'quiero mas info', 'hola quiero mas informacion',
    'hola quiero informacion', 'me interesa', 'hola me interesa', 'interesado', 'interesada',
    'buenas quiero mas informacion', 'buenos dias quiero mas informacion',
    'buenas tardes quiero mas informacion', 'buenas noches quiero mas informacion',
  ]);
  return GENERICOS.has(t);
}

// Herramientas que ENVÍAN mensajes o mueven plata/inventario. En MODO SOMBRA estas NO se
// ejecutan (se deja una nota de "qué haría"); las de solo lectura sí corren para que la prueba
// sea realista.
const HERRAMIENTAS_CON_EFECTO = new Set([
  'enviar_contacto_inicial', 'enviar_boleta', 'enviar_resolucion', 'apartar_numero',
  'registrar_abono', 'liberar_boleta', 'trasladar_abono', 'programar_recordatorio',
  'actualizar_datos_cliente', 'pasar_a_humano',
]);

// ── Ejecutores de cada herramienta. Devuelven texto-resultado para la IA. ────
async function ejecutarHerramienta(nombre, input, conv) {
  // MODO SOMBRA: no ejecutar las herramientas con efecto real; solo registrar qué haría.
  if (conv.sombra && HERRAMIENTAS_CON_EFECTO.has(nombre)) {
    const det = (input && Object.keys(input).length) ? ' → ' + JSON.stringify(input) : '';
    await guardarEnChat(conv, { direccion: 'nota', tipo: 'nota', texto: '🌓 (modo sombra) habría usado «' + nombre + '»' + det });
    return '[MODO SOMBRA] La acción "' + nombre + '" NO se ejecutó (es una prueba). Continúa la conversación como si hubiera salido bien.';
  }
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
    // SIEMPRE el teléfono del chat (privacidad: que el cliente no pueda consultar datos de otro).
    const tel = String(conv.telefono || '').replace(/\D/g, '');
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
    await enviarContactoInicial(conv, { saludo: input?.saludo, cierre: input?.cierre });
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
    // La boleta SIEMPRE se registra con el número de WhatsApp del chat, sea del país que sea
    // (esColombia:false usa el camino internacional de reservar.js: no exige número colombiano).
    const cuerpo = { numeros: [num], nombre: nom, apellido: ape, ciudad: ciu, telefono: conv.telefono, esColombia: false };
    if (doc) { cuerpo.documento_tipo = 'CC'; cuerpo.documento_numero = doc; }
    if (cor) cuerpo.correo = cor;
    cuerpo.asesor = await asesorDeLinea(conv.linea_id);   // la venta queda a nombre del agente (Liliana)
    const d = await llamarApi('/api/rifa/reservar', cuerpo);
    if (!d.exito) { await nota(conv, 'Intenté apartar el ' + num + ' pero no se pudo: ' + (d.error || 'error')); return 'No se pudo apartar: ' + (d.error || 'error') + '. Cuéntaselo al cliente y ofrécele otra opción.'; }
    await nota(conv, `Aparté el número ${num} a nombre de ${nom} ${ape} (${ciu}).`);
    return `Listo: el número ${num} quedó apartado a nombre de ${nom} ${ape}. Total por pagar: $${Number(d.total || 0).toLocaleString('es-CO')}. AHORA, en este MISMO turno, envíale la boleta con enviar_boleta — es OBLIGATORIO: el cliente SIEMPRE debe recibir su boleta con el enlace (esa herramienta muestra TODAS sus boletas en un solo mensaje). Si el cliente quería MÁS números, apártalos PRIMERO y recién entonces envía la boleta UNA sola vez; NO la envíes después de cada número.`;
  }

  if (nombre === 'enviar_boleta') {
    const last10 = String(conv.telefono).replace(/\D/g, '').slice(-10);
    const { data: boletas } = await supabase.from('boletas').select('numero, saldo_restante, total_abonado').like('telefono_cliente', '%' + last10);
    if (!boletas || !boletas.length) return 'El cliente todavía no tiene ninguna boleta apartada. Primero aparta su número con apartar_numero.';
    boletas.sort((a, b) => Number(a.numero) - Number(b.numero));
    const una = boletas.length === 1;
    const lista = boletas.map(b => `*${b.numero}*  ·  ${Number(b.saldo_restante || 0) <= 0 ? '✅ Pagada' : ('te falta abonar $' + Number(b.saldo_restante || 0).toLocaleString('es-CO'))}`).join('\n');
    const enlace = `${BASE_URL}/boleta?telefono=${last10}`;
    // El encabezado refleja la realidad: con $0 abonado la boleta SOLO está separada (aún NO
    // participa); con cualquier abono ya participa; pagada al 100% es lo máximo.
    const totalAbonado = boletas.reduce((s, b) => s + Number(b.total_abonado || 0), 0);
    const todasPagadas = boletas.every(b => Number(b.saldo_restante || 0) <= 0);
    let encabezado, cola;
    if (todasPagadas) {
      encabezado = una ? '✅ ¡Tu boleta está paga al 100%! Ya estás participando 🎉' : '✅ ¡Tus boletas están pagas al 100%! Ya estás participando 🎉';
      cola = '\n\n¡Te deseamos mucha suerte! 🍀';
    } else if (totalAbonado > 0) {
      encabezado = una ? '🎉 ¡Ya estás participando con tu boleta!' : '🎉 ¡Ya estás participando con tus boletas!';
      cola = '\n\nPuedes seguir abonando hasta completar el valor. ¡Mucha suerte! 🍀';
    } else {
      encabezado = una ? '📝 ¡Tu boleta quedó separada!' : '📝 ¡Tus boletas quedaron separadas!';
      cola = '\n\nPara *entrar al sorteo* haz tu primer abono y mándame la foto del comprobante 😊';
    }
    const texto = `${encabezado}\n\n${una ? 'Esta es tu boleta' : 'Estas son tus boletas'} para la rifa de *Los Plata*:\n\n${lista}\n\n👉 ${una ? 'Consulta tu boleta aquí' : 'Consulta tus boletas aquí'}:\n${enlace}${cola}`;
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

    // 2) Verificar contra los pagos REALES y abonar si hay coincidencia SÓLIDA (lógica probada).
    const numeroPedido = String(input?.numero || '').replace(/\D/g, '');
    const r = await verificarYAbonar({ telefono: conv.telefono, linea_id: conv.linea_id, conversacion_id: conv.id, mediaId, numeroPedido, pwd });

    if (r.tipo === 'abonado') {
      await cancelarVerificaciones(conv.id);
      await nota(conv, `Registré un abono de $${Number(r.monto).toLocaleString('es-CO')} a la boleta ${r.numero} (pago verificado contra el banco).`);
      return `Listo: registré el abono de $${Number(r.monto).toLocaleString('es-CO')} a la boleta ${r.numero}. Confírmaselo con alegría, agradécele y, si quieres que termine de pagar, recuérdale con cariño el saldo que le queda.`;
    }
    if (r.tipo === 'sin_saldo') {
      return 'El cliente no tiene boletas con saldo pendiente para abonar. Verifícalo o pásalo a un asesor.';
    }
    if (r.tipo === 'error') {
      await nota(conv, 'No pude verificar/registrar el comprobante: ' + (r.mensaje || 'error'));
      await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' });
      return 'No pude verificar el comprobante (' + (r.mensaje || 'error') + '). Avísale con tacto que un asesor lo revisa enseguida, y pásalo a un asesor.';
    }

    // 'no_encontrado' o 'misma_hora': el pago todavía NO aparece (el asesor lo sube con retraso).
    // En vez de rendirse, se agenda VERIFICACIÓN automática con reintentos (cada ~15 min, hasta ~1h);
    // si el pago aparece, el relojito abona solo. NO se pasa a un asesor todavía.
    await agendarVerificacion(conv, mediaId, numeroPedido);
    await nota(conv, 'Recibí el comprobante pero el pago aún no aparece cargado. Lo dejé en verificación automática (reintenta cada ~15 min, hasta ~1h). ' + (r.diagnostico || ''));
    return 'Recibí su comprobante. El pago todavía NO aparece en el sistema (a veces el banco o el asesor lo suben con un rato de retraso). NO lo pases a un asesor todavía: dile con calma y alegría que ya RECIBISTE su comprobante y que estás *verificando su pago*, que apenas se confirme le avisas por aquí (puede tardar un ratico). NO le pidas otro comprobante.';
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
    const d = await llamarApi('/api/admin/liberar-boleta', { numeroBoleta: num, contrasena: pwd, asesorRegistro: await asesorDeLinea(conv.linea_id) });
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
    const cuerpo = { numeroOrigen: origen, numeroDestino: destino, telefono: conv.telefono, contrasena: pwd };
    if (input?.monto != null && input.monto !== '') cuerpo.monto = input.monto;
    cuerpo.asesorRegistro = await asesorDeLinea(conv.linea_id);   // el traslado queda a nombre del agente (Liliana)
    const d = await llamarApi('/api/admin/trasladar-abono', cuerpo);
    if (d.status !== 'ok') { await nota(conv, `Intenté trasladar el abono de ${origen} a ${destino} pero no se pudo: ${d.mensaje || 'error'}`); return 'No se pudo trasladar: ' + (d.mensaje || 'error') + '. Si el cliente insiste o algo no cuadra, pásalo a un asesor.'; }
    const movido = Number(d.monto).toLocaleString('es-CO');
    await nota(conv, `Trasladé $${movido} de la boleta ${origen} a la ${destino}.`);
    return `Listo: pasé $${movido} de la boleta ${origen} a la ${destino}. Confírmaselo al cliente con los saldos nuevos. Si la ${origen} quedó SIN abono y el cliente ya no la quiere, puedes liberarla con liberar_boleta.`;
  }

  if (nombre === 'enviar_resolucion') {
    const env = await enviarDocumento(conv.telefono, `${BASE_URL}/resolucion.pdf`, 'Resolucion-EDSA-Los-Plata.pdf', 'Resolución oficial que autoriza la rifa (EDSA).', conv.linea_id);
    if (!env || !env.ok) { await nota(conv, 'Intenté enviar la resolución pero no se pudo: ' + ((env && env.error) || 'error')); return 'No se pudo enviar el documento. Dile que en un momento se lo hace llegar un asesor.'; }
    await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: '📄 Resolución oficial de EDSA (PDF enviado)', wa_message_id: env.wa_message_id });
    await nota(conv, 'Envié la resolución oficial (PDF de EDSA).');
    return 'Listo, le envié el PDF de la resolución oficial de EDSA. Aprovecha para reforzar la confianza y retomar la venta.';
  }

  if (nombre === 'actualizar_datos_cliente') {
    const pwd = contrasenaGerencia();
    if (!pwd) return 'No puedo actualizar datos ahora (falta configuración). Pásalo a un asesor.';
    // Buscar al cliente por sus últimos 10 dígitos y MEZCLAR lo nuevo con lo que ya tiene
    // (el endpoint hace upsert y exige nombre+apellido+ciudad; así no se borran ni se duplican).
    const last10 = String(conv.telefono).replace(/\D/g, '').slice(-10);
    const { data: ex } = await supabase.from('clientes')
      .select('telefono, nombre, apellido, ciudad, documento_numero, correo')
      .like('telefono', '%' + last10).limit(1).maybeSingle();
    const prev = ex || {};
    const nom = String(input?.nombre || prev.nombre || '').trim();
    const ape = String(input?.apellido || prev.apellido || '').trim();
    const ciu = String(input?.ciudad || prev.ciudad || '').trim();
    const doc = String(input?.documento || prev.documento_numero || '').replace(/\D/g, '').trim();
    const cor = String(input?.correo || prev.correo || '').trim();
    if (!nom || !ape || !ciu) {
      return 'Para guardar los datos necesito al menos nombre, apellido y ciudad. Pídele los que falten al cliente y vuelve a intentar.';
    }
    const cuerpo = { telefono: prev.telefono || conv.telefono, nombre: nom, apellido: ape, ciudad: ciu, contrasena: pwd };
    if (doc) { cuerpo.documento_tipo = 'CC'; cuerpo.documento_numero = doc; }
    if (cor) cuerpo.correo = cor;
    const d = await llamarApi('/api/admin/actualizar-cliente', cuerpo);
    if (d.status !== 'ok') {
      await nota(conv, 'Intenté actualizar los datos del cliente pero no se pudo: ' + (d.mensaje || 'error'));
      return 'No se pudo actualizar: ' + (d.mensaje || 'error') + '. Si el dato es importante, pásalo a un asesor.';
    }
    const cambios = [];
    if (input?.nombre) cambios.push('nombre');
    if (input?.apellido) cambios.push('apellido');
    if (input?.ciudad) cambios.push('ciudad');
    if (input?.documento) cambios.push('cédula');
    if (input?.correo) cambios.push('correo');
    await nota(conv, 'Actualicé los datos del cliente' + (cambios.length ? ' (' + cambios.join(', ') + ')' : '') + '.');
    return 'Listo: actualicé los datos del cliente. Confírmaselo con naturalidad y sigue la conversación.';
  }

  if (nombre === 'programar_recordatorio') {
    const minutos = Math.round(Number(input?.minutos || 0));
    const dias = Math.round(Number(input?.dias || 0));
    const motivo = String(input?.motivo || '').trim().slice(0, 300);
    if (minutos < 1 && dias < 1) return 'Dime en cuántos minutos (hoy) o en cuántos días debo volver a escribirle.';
    // Guardamos cuándo fue el último mensaje del cliente: al vencer el recordatorio, el reloj
    // mira esto para saber si la ventana de 24h sigue abierta (le escribe texto normal) o ya
    // se cerró (entonces le manda la PLANTILLA de seguimiento para reabrir). Ver recordatorios-cron.js.
    const { data: ult } = await supabase.from('mensajes_whatsapp')
      .select('timestamp_wa, created_at').eq('conversacion_id', conv.id).eq('direccion', 'entrante')
      .order('timestamp_wa', { ascending: false }).limit(1);
    const ultMs = ult && ult[0] ? new Date(ult[0].timestamp_wa || ult[0].created_at).getTime() : Date.now();
    // A DÍAS: lo dejamos a las 10:00 a.m. hora Colombia (15:00 UTC) de ese día, no a medianoche.
    // A MINUTOS (hoy): tal cual.
    let programadoMs;
    if (dias >= 1) {
      const d = Math.min(dias, 30);   // tope de seguridad: máximo 30 días
      const f = new Date(Date.now() + d * 86400000);
      f.setUTCHours(15, 0, 0, 0);
      if (f.getTime() < Date.now() + 60 * 60000) f.setTime(Date.now() + d * 86400000);   // nunca en el pasado
      programadoMs = f.getTime();
    } else {
      programadoMs = Date.now() + Math.max(1, minutos) * 60000;
    }
    // Un solo recordatorio activo por chat: si había otro pendiente, se reemplaza.
    await supabaseAdmin.from('recordatorios').update({ estado: 'cancelado' })
      .eq('linea_id', conv.linea_id).eq('telefono', conv.telefono).eq('estado', 'pendiente');
    const { error } = await supabaseAdmin.from('recordatorios').insert({
      linea_id: conv.linea_id, telefono: conv.telefono, conversacion_id: conv.id,
      programado_para: new Date(programadoMs).toISOString(), motivo: motivo || null,
      ultimo_msg_cliente_at: new Date(ultMs).toISOString(), estado: 'pendiente', creado_por: 'agente',
    });
    if (error) return 'No pude agendar el recordatorio (' + error.message + '). Sigue la conversación normal.';
    const cuando = new Date(programadoMs).toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true });
    await nota(conv, `Programé un recordatorio para el ${cuando}${motivo ? ' — ' + motivo : ''}.`);
    return `Listo: le escribirás de nuevo el ${cuando}. Confírmaselo al cliente con naturalidad y SIEMPRE por WhatsApp (ej. "Dale, te escribo el martes por aquí"), sin prometer llamadas. Si él vuelve a escribir antes, el recordatorio se cancela solo.`;
  }

  if (nombre === 'pasar_a_humano') {
    const motivo = String(input?.motivo || 'sin especificar').slice(0, 200);
    await supabaseAdmin.from('conversaciones_whatsapp')
      .update({ agente_activo: false, estado: 'humano' })
      .eq('id', conv.id);
    // Si quedaba un recordatorio pendiente, cancelarlo (ya lo atiende un humano).
    try {
      await supabaseAdmin.from('recordatorios').update({ estado: 'cancelado' })
        .eq('linea_id', conv.linea_id).eq('telefono', conv.telefono).eq('estado', 'pendiente');
    } catch (_) {}
    await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' });
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

  const { contrasena, linea_id, telefono, interno, recordatorio } = req.body || {};
  if (!linea_id || !telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta línea o teléfono.' });
  // Autorización: o el secreto interno (lo dispara el webhook al instante) o, desde la bandeja,
  // gerencia o el DUEÑO de la línea (ej. Liliana en la suya), igual que el botón 🤖.
  let autorizado = false;
  const tokenInterno = process.env.WHATSAPP_VERIFY_TOKEN;
  if (interno && tokenInterno && interno === tokenInterno) {
    autorizado = true;
  } else {
    const nombre = validarAsesor(contrasena);
    if (nombre && (await puedeVerLinea(nombre, linea_id))) autorizado = true;
  }
  if (!autorizado) return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });

  // Liliana usa su PROPIA llave de Claude (ANTHROPIC_API_KEY_LILIANA) para poder medir su
  // gasto por separado en el panel de Anthropic. Si esa no está configurada, cae a la llave
  // general (ANTHROPIC_API_KEY) para no dejar de responder nunca.
  const apiKey = process.env.ANTHROPIC_API_KEY_LILIANA || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ status: 'error', mensaje: 'Falta ANTHROPIC_API_KEY_LILIANA / ANTHROPIC_API_KEY.' });

  try {
    // 1) La conversación y su estado.
    const { data: conv } = await supabase
      .from('conversaciones_whatsapp')
      .select('id, telefono, linea_id, agente_activo')
      .eq('telefono', telefono).eq('linea_id', linea_id).maybeSingle();
    if (!conv) return res.status(200).json({ status: 'error', mensaje: 'No existe esa conversación.' });
    if (!conv.agente_activo) return res.status(200).json({ status: 'ok', skip: 'El agente no está activo en este chat.' });

    // 1b) Estado de la LÍNEA (interruptor de la cabina): 'apagado' = no responde (apaga toda la
    //     línea de golpe); 'sombra' = el agente PIENSA y deja notas pero NO le escribe al cliente
    //     ni ejecuta acciones (probar viendo errores SIN riesgo); cualquier otra cosa = en vivo.
    const { data: cfgEstado } = await supabase
      .from('agente_config').select('estado').eq('linea_id', linea_id).maybeSingle();
    const estadoLinea = (cfgEstado && cfgEstado.estado) || 'encendido';
    if (estadoLinea === 'apagado') return res.status(200).json({ status: 'ok', skip: 'La línea tiene el agente en Apagado.' });
    conv.sombra = (estadoLinea === 'sombra');

    // 2) CANDADO PRIMERO: solo UNA corrida responde a la vez. Tomarlo ANTES de leer
    //    el historial cierra la ventana de doble respuesta (y de doble abono).
    let bloqueado = false;
    try {
      // El candado vive en una función de la base (RPC) para NO depender de que PostgREST
      // tenga la columna en su caché de esquema (eso fallaba "column does not exist"). La
      // función se recupera sola a los 60s. Devuelve true si ESTA corrida tomó el candado.
      const { data: tomo, error: lockErr } = await supabaseAdmin
        .rpc('agente_tomar_lock', { p_conv: conv.id });
      if (!lockErr && tomo === false) bloqueado = true;
    } catch (_) { /* si el candado falla, seguimos: mejor responder que quedar callados */ }
    if (bloqueado) return res.status(200).json({ status: 'ok', skip: 'Otra corrida ya está respondiendo.' });

    // 2b) JUNTAR MENSAJES (debounce): la gente escribe en ráfaga ("hola" / "cómo estás" /
    //     "una pregunta") en mensajes separados. En vez de responder atropellado al primero,
    //     esperamos un silencio; si entra otro mensaje, esperamos otro poco (hasta un tope).
    //     Así juntamos toda la ráfaga en UNA sola respuesta. Solo en el disparo automático
    //     (webhook); cuando Mateo prueba manual desde la bandeja, responde de una.
    if (interno && !recordatorio) {
      const inicioEspera = Date.now();
      while (Date.now() - inicioEspera < DEBOUNCE_MAX_MS) {
        const { data: ult } = await supabase
          .from('mensajes_whatsapp')
          .select('direccion, timestamp_wa, created_at')
          .eq('conversacion_id', conv.id)
          .order('timestamp_wa', { ascending: false }).limit(1);
        const u = ult && ult[0];
        if (!u || u.direccion !== 'entrante') break;        // ya no hay nada pendiente del cliente
        const silencioMs = Date.now() - new Date(u.timestamp_wa || u.created_at).getTime();
        if (silencioMs >= DEBOUNCE_MS) break;               // ya lleva la pausa callado desde su ÚLTIMO mensaje → responder
        // Refrescar el candado para que NO se venza mientras esperamos (si no, otra corrida podría
        // arrancar y responder doble). Se revisa en trocitos de máx 3s para refrescarlo seguido.
        try { await supabaseAdmin.rpc('agente_refrescar_lock', { p_conv: conv.id }); } catch (_) {}
        await dormir(Math.min(3000, DEBOUNCE_MS - silencioMs + 250));   // espera un poco; si entra otro mensaje, su hora más nueva reinicia el conteo
      }
    }

    // Botón de pánico: si apagaron el agente en este chat durante la espera (debounce), parar ya.
    if (!(await sigueActivo(conv.id))) { await soltarLock(conv); return res.status(200).json({ status: 'ok', skip: 'Apagaron el agente antes de responder.' }); }

    // 3) Historial. El agente recuerda SOLO desde que empezó la rifa activa (no arrastra
    //    el contexto de rifas pasadas: precios, premios y números viejos ya no aplican).
    //    Al marcar una rifa nueva como 'activa', el corte se mueve solo. El límite es un
    //    colchón de seguridad por si un chat acumula muchísimos mensajes en una misma rifa.
    let desdeRifa = null;
    let rifaSorteos = [];
    try {
      const { data: rifas } = await supabase
        .from('rifas').select('fecha_inicio, sorteos').eq('estado', 'activa')
        .order('fecha_inicio', { ascending: false }).limit(1);
      if (rifas && rifas[0]) {
        if (rifas[0].fecha_inicio) desdeRifa = String(rifas[0].fecha_inicio) + 'T00:00:00-05:00';
        if (Array.isArray(rifas[0].sorteos)) rifaSorteos = rifas[0].sorteos;
      }
    } catch (_) {}
    let qHist = supabase
      .from('mensajes_whatsapp')
      .select('id, direccion, tipo, texto, media_id, timestamp_wa, created_at')
      .eq('conversacion_id', conv.id)
      .order('timestamp_wa', { ascending: false })
      .limit(MAX_HISTORIAL);
    if (desdeRifa) qHist = qHist.gte('timestamp_wa', desdeRifa);
    const { data: histAsc } = await qHist;
    const historial = (histAsc || []).slice().reverse();
    const reales = historial.filter(m => m.direccion === 'entrante' || m.direccion === 'saliente');
    // Normalmente solo respondemos si el último mensaje es del cliente. EXCEPCIÓN: un
    // recordatorio (el agente se programó volver a escribir) sí arranca aunque el último
    // mensaje sea suyo.
    if (!recordatorio && (!reales.length || reales[reales.length - 1].direccion !== 'entrante')) {
      await soltarLock(conv);
      return res.status(200).json({ status: 'ok', skip: 'No hay un mensaje del cliente pendiente de responder.' });
    }

    // 3a-bis) ANTI-DUPLICADO A PRUEBA DE BALAS: el candado de arriba (agente_procesando_at) a veces
    //     NO frena la segunda corrida cuando el cliente manda 2 mensajes muy seguidos (ráfaga) y
    //     ambas terminan respondiendo el MISMO segundo con el mismo texto. Aquí, ya pasado el
    //     debounce, marcamos de forma ATÓMICA "ya tomé hasta el último mensaje del cliente".
    //     Comparamos NÚMEROS (el momento del último mensaje en milisegundos), NO texto de fecha:
    //     las fechas con zona horaria (+00:00) rompían la consulta y dejaban pasar a las dos
    //     corridas. Con números no hay líos de formato. Las dos corridas calculan el mismo valor;
    //     solo UNA gana el UPDATE (la 2ª ve el valor ya igual y se sale). No aplica a recordatorios.
    if (!recordatorio) {
      const ultEnt = [...reales].reverse().find(m => m.direccion === 'entrante');
      const hastaMs = ultEnt ? new Date(ultEnt.timestamp_wa || ultEnt.created_at).getTime() : 0;
      if (hastaMs && Number.isFinite(hastaMs)) {
        const { data: gano, error: geClaim } = await supabaseAdmin
          .rpc('agente_claim_respuesta', { p_conv: conv.id, p_hasta_ms: hastaMs });
        if (geClaim) {
          // El candado atómico FALLÓ (raro: ahora vive en una función de la base, RPC, que NO
          // depende de la caché de esquema de PostgREST). No fallamos en silencio: (1) dejamos
          // rastro VISIBLE en la actividad, y (2) aplicamos un respaldo: si OTRA corrida ya le
          // escribió al cliente DESPUÉS de su último mensaje, esta se sale. Si nadie ha escrito
          // aún, seguimos (nunca dejar a Liliana callada).
          try {
            await supabaseAdmin.from('agente_actividad').insert({
              linea_id: conv.linea_id, telefono: conv.telefono, tipo: 'error',
              resumen: 'Candado anti-duplicado (RPC) falló: ' + (geClaim.message || 'error'),
            });
          } catch (_) {}
          const { data: yaResp } = await supabaseAdmin
            .from('mensajes_whatsapp').select('id')
            .eq('conversacion_id', conv.id).eq('direccion', 'saliente')
            .gt('timestamp_wa', new Date(hastaMs).toISOString()).limit(1);
          if (yaResp && yaResp.length) {
            await soltarLock(conv);
            return res.status(200).json({ status: 'ok', skip: 'Otra corrida ya respondió (respaldo anti-duplicado).' });
          }
        } else if (gano === false) {
          // La función corrió bien y NO ganamos: otra corrida ya tomó este mensaje. Nos salimos.
          await soltarLock(conv);
          return res.status(200).json({ status: 'ok', skip: 'Otra corrida ya respondió a este mensaje (anti-duplicado).' });
        }
      }
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
      .from('agente_config').select('prompt, modelo, nombre_agente, variables, resultados').eq('linea_id', linea_id).maybeSingle();
    const promptBase = String(cfg?.prompt || '').trim();
    if (!promptBase) { await soltarLock(conv); return res.status(200).json({ status: 'error', mensaje: 'El agente no tiene instrucciones guardadas.' }); }
    // Rellenar las variables {{nombre}}, {{pagos}}, etc. con lo configurado en esta línea.
    const prompt = aplicarVariables(promptBase, {
      nombre: (cfg?.nombre_agente || '').trim() || 'del equipo de Los Plata',
      ...(cfg?.variables && typeof cfg.variables === 'object' ? cfg.variables : {}),
    });
    const modelo = MODELOS_OK.includes(cfg?.modelo) ? cfg.modelo : 'claude-sonnet-4-6';

    // Solo se le ofrecen a la IA las herramientas IMPLEMENTADAS que estén ACTIVAS en la cabina.
    const { data: hsAct } = await supabase.from('agente_herramientas')
      .select('clave').eq('linea_id', linea_id).eq('activa', true);
    const activas = new Set((hsAct || []).map(h => h.clave));
    let toolsActivas = TOOLS.filter(t => activas.has(t.name));

    // Estado del cliente: SIEMPRE se consulta antes de responder, para que el agente
    // sepa desde el primer mensaje si ya tiene boleta (y no lo trate como nuevo).
    const estadoCliente = await resumenCliente(conv.telefono);

    // ¿La boleta de este cliente la vendió OTRO punto de venta? Entonces NO lo
    // atiende esta línea: se le da el número del punto donde compró (remisión).
    const remision = await analizarRemision(estadoCliente.boletas, linea_id);

    // DETERMINÍSTICO: si el cliente YA tiene boleta(s) o hay que remitirlo, NUNCA le
    // mandes el "contacto inicial" como si fuera nuevo. Antes esto dependía de que el
    // modelo obedeciera la instrucción del prompt y a veces se presentaba igual. Quitando
    // la herramienta, el modelo NO PUEDE presentarse: saluda por su nombre / remite.
    if (remision || (estadoCliente.boletas && estadoCliente.boletas.length)) {
      toolsActivas = toolsActivas.filter(t => t.name !== 'enviar_contacto_inicial');
    }

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

    // ── ATAJO SIN IA: saludo predefinido al PRIMER contacto genérico (ahorro de tokens) ──
    // El ~88% de los primeros mensajes es el texto del anuncio de Meta ("¡Hola! quiero más
    // información.") SIN pregunta. A esos les mandamos el contacto inicial FIJO (saludo + fotos +
    // cierre) SIN gastar una llamada a la IA. La IA entra desde el 2º mensaje, o si el 1º trae una
    // pregunta. Ya pasamos el candado atómico (arriba), así que NO hay riesgo de saludo doble.
    // Mismos frenos que la herramienta: no aplica a clientes con boleta, ni remisión, ni en sombra,
    // ni si el chat ya tiene mensajes, ni si la cabina apagó 'enviar_contacto_inicial'.
    if (!recordatorio && !conv.sombra && !yaHuboSalientes && !remision
        && !(estadoCliente.boletas && estadoCliente.boletas.length)
        && activas.has('enviar_contacto_inicial')
        && esContactoGenerico(reales)) {
      await enviarContactoInicial(conv, { saludo: '¡Hola! 😊 Soy Liliana, te muestro la casa:' });
      await nota(conv, 'Envié el contacto inicial (saludo predefinido, SIN IA — ahorro de tokens).');
      await soltarLock(conv);
      return res.status(200).json({ status: 'ok', atajo: 'contacto_inicial_predefinido' });
    }

    // Resultados de los sorteos. Las casillas (qué sorteos y sus fechas) salen del CALENDARIO
    // de la rifa activa; el ganador lo escribe Mateo en la cabina (se guarda por fecha). El
    // agente los lee SOLO para responder "¿qué número ganó?". Vacío = aún no se ha jugado.
    const datosPorFecha = {};
    for (const g of (Array.isArray(cfg?.resultados) ? cfg.resultados : [])) {
      if (g && g.fecha) datosPorFecha[g.fecha] = g;
    }
    // Describe el resultado de un sorteo a partir de los campos exactos guardados.
    const describirResultado = (g) => {
      if (!g) return '(aún no se ha jugado)';
      if (g.acumulado) {
        return 'ya se jugó, pero NO hubo ganador; el premio se ACUMULÓ para el próximo sorteo' +
          (g.acumulado_monto ? ` (el premio del próximo sube a ${String(g.acumulado_monto).trim()})` : '');
      }
      const partes = [];
      if (g.numero) partes.push('número ganador: ' + String(g.numero).trim());
      if (g.nombre) partes.push('ganador(a): ' + String(g.nombre).trim());
      if (g.ciudad) partes.push('ciudad: ' + String(g.ciudad).trim());
      return partes.length ? partes.join(', ') : '(aún no se ha jugado)';
    };
    const sorteosOrden = (rifaSorteos || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    // Fecha de hoy (Colombia), ya calculada por código (los modelos se equivocan con los días).
    const hoyCol = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });   // YYYY-MM-DD

    // RESULTADOS para "¿qué número ganó?". Mostramos uno por uno SOLO los sorteos CON ganador
    // (los que el cliente realmente pregunta). Los sábados que se ACUMULARON ya NO se enumeran
    // uno por uno: verlos en lista hacía que Liliana CONTARA ("lleva 3 sábados sin ganador",
    // que está prohibido decir). Ahora se resumen en UNA sola línea con el monto que se traslada
    // al próximo sorteo, sin revelar cuántos sábados llevan ni llamarlo "el primer sorteo".
    const conGanador = sorteosOrden.filter(s => {
      const g = datosPorFecha[s.fecha];
      return g && !g.acumulado && (g.numero || g.nombre);
    });
    // Próximo sorteo (y los que faltan). Se calcula aquí porque saber si el premio del
    // próximo está acumulado depende de QUÉ TIPO de sorteo es.
    const proximo = sorteosOrden.find(s => String(s.fecha) >= hoyCol);
    const sorteosFuturos = sorteosOrden.filter(s => String(s.fecha) >= hoyCol);

    // ¿El premio del PRÓXIMO está acumulado? SOLO si el ÚLTIMO sorteo PASADO del MISMO tipo
    // (mismo título; ej. los sábados de "Lotería de Boyacá") quedó acumulado. Si ese último ya
    // tuvo GANADOR, el acumulado se REINICIÓ → el próximo vuelve a su monto base (el del título).
    // Antes se tomaba el último acumulado de toda la historia sin mirar si después hubo ganador,
    // por eso seguía diciendo "$20.000.000" aunque el acumulado ya se hubiera ganado.
    // Agrupar por título evita mezclar el Sueldazo (sorteo aparte) con la cadena de los sábados.
    let montoAcumProximo = '';
    let acumuladoReiniciado = false;
    if (proximo) {
      const tipoProximo = String(proximo.titulo || '').trim();
      const pasadosMismoTipo = sorteosOrden.filter(s =>
        String(s.fecha) < hoyCol && String(s.titulo || '').trim() === tipoProximo);
      const ultimo = pasadosMismoTipo[pasadosMismoTipo.length - 1];   // el más reciente
      const g = ultimo ? datosPorFecha[ultimo.fecha] : null;
      if (g && g.acumulado && g.acumulado_monto) montoAcumProximo = String(g.acumulado_monto).trim();
      else if (g && !g.acumulado && (g.numero || g.nombre)) acumuladoReiniciado = true;
    }
    const lineasResultados = conGanador.map(s =>
      `- ${String(s.titulo || 'Sorteo').trim()} — ${etiquetaFecha(s.fecha)}: ${describirResultado(datosPorFecha[s.fecha])}`);
    const bloqueResultados = (lineasResultados.length || montoAcumProximo)
      ? '\n\n---\nRESULTADOS DE LOS SORTEOS (úsalos SOLO si el cliente pregunta qué número ganó, quién ganó, o si ya jugó tal premio; NO los menciones si no preguntan):\n' +
        (lineasResultados.length ? lineasResultados.join('\n') + '\n' : '') +
        (montoAcumProximo
          ? `- El premio del PRÓXIMO sorteo de los sábados está acumulado en ${montoAcumProximo}. Di SOLO ese monto; NUNCA digas cuántos sábados ni semanas lleva acumulado, ni "sin ganador", ni lo llames "el primer sorteo".\n`
          : '') +
        'Si el cliente pregunta por un sorteo que no aparece aquí, no inventes: dile con cariño que todavía no se ha realizado o que un asesor le confirma.'
      : '';

    // FECHAS ya calculadas por código (los modelos se equivocan con los días de la semana).
    // Mostramos SOLO los sorteos de HOY en adelante: ver los sábados YA jugados hacía que
    // Liliana CONTARA el acumulado ("lleva 3 sábados sin ganador", prohibido). Los sorteos
    // pasados, si el cliente pregunta qué número ganó, ya están cubiertos por bloqueResultados.
    // Al PRÓXIMO sorteo le pegamos el monto acumulado para que no se confunda con el título $5M.
    const bloqueFechas = sorteosFuturos.length
      ? '\n\n---\nFECHAS EXACTAS (ya calculadas; ÚSALAS TAL CUAL. NUNCA calcules tú el día de la semana de una fecha, ni digas "este sábado" con una fecha que no esté aquí):\n' +
        '- Hoy es ' + etiquetaFecha(hoyCol) + '.\n' +
        (proximo ? '- El PRÓXIMO sorteo es: ' + String(proximo.titulo).trim() + ' — ' + etiquetaFecha(proximo.fecha) +
          (montoAcumProximo
            ? ' (este premio está ACUMULADO en ' + montoAcumProximo + ': di SOLO ese monto)'
            : (acumuladoReiniciado ? ' (OJO: el acumulado ANTERIOR ya tuvo ganador, así que este premio YA NO está acumulado; va por el monto de su TÍTULO. NUNCA menciones montos acumulados viejos como si siguieran vigentes)' : '')) + '.\n' : '') +
        '- Próximos sorteos de esta rifa (solo los que faltan):\n' +
        sorteosFuturos.map(s => '   · ' + String(s.titulo || 'Sorteo').trim() + ' — ' + etiquetaFecha(s.fecha)).join('\n')
      : '';

    const systemVolatil =
      `\n\n---\nCONTEXTO (no lo menciones literalmente): hoy es ${contextoFechaHora()} (Colombia). ` +
      `Hablas por WhatsApp con el cliente cuyo número es ${conv.telefono}. ` +
      `Tienes herramientas para actuar; úsalas cuando corresponda en vez de inventar. ` +
      (remision ? '' : `Si el cliente acaba de llegar y aún no se ha enviado la presentación, usa primero enviar_contacto_inicial. `) +
      `Si ves "[audio del cliente] ...", es lo que dijo en un audio (ya transcrito): respóndelo como si lo hubiera escrito, sin decir que no puedes oír audios. ` +
      `Después de usar una herramienta, sigue la conversación con naturalidad y mensajes cortos. No repitas información que ya esté en el chat. ` +
      `NUNCA narres lo que vas a hacer ("voy a verificar", "un momento", "ahora libero"): haz la acción en silencio y da SOLO el resultado, en pocos mensajes, como una persona. ` +
      `NUNCA le preguntes al cliente algo que YA sabes (está en el ESTADO DE ESTE CLIENTE de abajo, o lo dijiste tú mismo hace poco en el chat). Ejemplo: si una boleta ya tiene abono, NO preguntes "¿ya abonaste?"; ya sabes que sí, úsalo y actúa.` +
      `\n\n---\n${remision ? bloqueRemision(remision, estadoCliente) : bloqueEstadoCliente(estadoCliente)}` +
      (accionesHechas.length
        ? `\n\n---\nACCIONES QUE TÚ YA EJECUTASTE EN ESTE CHAT (son HECHOS ya aplicados en el sistema; NO las repitas y NO digas nada que las contradiga —ej.: si ya liberaste una boleta, no digas luego que "no está a su nombre"):\n- ${accionesHechas.join('\n- ')}`
        : '') +
      (yaHuboSalientes
        ? `\n\n---\nESTE CHAT YA TIENE MENSAJES PREVIOS (un asesor lo atendió a mano o ya te presentaste). NO uses enviar_contacto_inicial, NO te vuelvas a presentar y NO repitas información ya enviada. Lee TODO el historial y CONTINÚA desde donde quedó, respondiendo lo ÚLTIMO que preguntó el cliente.`
        : '') +
      bloqueResultados +
      bloqueFechas;

    // Caché de prompt: el manual de Liliana y la lista de herramientas son idénticos en
    // CADA llamada y CADA vuelta del bucle. Marcamos el manual (lo más grande y fijo) con
    // cache_control para que Claude lo cobre 10× más barato (lectura 0.1× en vez de precio
    // lleno). Usamos TTL de 1 HORA (ttl:'1h' + cabecera beta extended-cache-ttl) en vez de los
    // 5 min por defecto: con tráfico espaciado, así el manual se reescribe MUCHO menos (un cliente
    // nuevo a los 40 min reusa el caché del anterior en vez de reescribirlo). NO cambia NADA de lo
    // que responde Liliana: ve el mismo prompt, solo más barato. El breakpoint en el PRIMER bloque
    // cachea herramientas + manual juntos (orden: tools → system → messages); el contexto volátil
    // (fecha, teléfono, estado del cliente, fechas) va en un 2º bloque SIN caché.
    const system = [
      { type: 'text', text: prompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: systemVolatil },
    ];

    const messages = construirMensajes(reales, imagenesVistas);
    // Disparo por RECORDATORIO: no hay mensaje nuevo del cliente; le inyectamos una nota
    // interna (que el cliente NO ve) pidiéndole retomar la conversación él mismo.
    if (recordatorio) {
      const motivoTxt = String(recordatorio.motivo || '').trim();
      const nudge = '[NOTA INTERNA DEL SISTEMA — el cliente NO ve esto] Pasó el tiempo que acordaste con el cliente para volver a escribirle. Escríbele TÚ ahora un mensaje de seguimiento corto, cálido y natural para retomar la conversación' +
        (motivoTxt ? ' (lo que ibas a hacer/preguntar: ' + motivoTxt + ')' : '') +
        '. No menciones que es un recordatorio automático ni esta nota interna. Si la conversación ya quedó cerrada y no tiene sentido escribir, no mandes nada.';
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && typeof last.content === 'string') last.content += '\n\n' + nudge;
      else if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push({ type: 'text', text: nudge });
      else messages.push({ role: 'user', content: nudge });
    }
    if (!messages.length) { await soltarLock(conv); return res.status(200).json({ status: 'ok', skip: 'Sin mensajes para procesar.' }); }

    // 5) Bucle de razonamiento + herramientas.
    let apagado = false;
    let apartoNumero = false;   // ¿se apartó algún número en este turno?
    let envioBoleta = false;    // ¿se envió la boleta en este turno?
    for (let iter = 0; iter < MAX_ITER; iter++) {
      // Botón de pánico a mitad de la respuesta: si apagaron el agente en este chat, parar ya
      // (no mandar más mensajes ni ejecutar más acciones).
      if (iter > 0 && !(await sigueActivo(conv.id))) { await soltarLock(conv); return res.status(200).json({ status: 'ok', skip: 'Apagaron el agente a mitad de la respuesta.' }); }
      const resp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'extended-cache-ttl-2025-04-11' },
        body: JSON.stringify({ model: modelo, max_tokens: 1024, system, messages, ...(toolsActivas.length ? { tools: toolsActivas } : {}) }),
      });
      const data = await resp.json();
      if (data.error) { await nota(conv, 'No pude responder (problema con la IA): ' + (data.error.message || 'error')); await soltarLock(conv); return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') }); }
      await registrarUso(conv, modelo, data.usage);   // anotar lo que costó esta respuesta

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
        try { out = await ejecutarHerramienta(tu.name, tu.input || {}, conv); }
        catch (e) { out = 'Error ejecutando la herramienta: ' + e.message; }
        if (typeof out === 'string' && out.startsWith('AGENTE_APAGADO')) apagado = true;
        if (tu.name === 'apartar_numero' && typeof out === 'string' && out.startsWith('Listo: el número')) apartoNumero = true;
        if (tu.name === 'enviar_boleta') envioBoleta = true;
        if (tu.name === 'enviar_contacto_inicial') cerrarSinTexto = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      if (cerrarSinTexto && !apagado) break;
      if (apagado) {
        const resp2 = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'extended-cache-ttl-2025-04-11' },
          body: JSON.stringify({ model: modelo, max_tokens: 400, system, messages }),
        });
        const d2 = await resp2.json();
        if (!d2.error) { await registrarUso(conv, modelo, d2.usage); for (const b of (d2.content || [])) if (b.type === 'text' && b.text?.trim()) await decir(conv, b.text.trim()); }
        break;
      }
    }

    // Red de seguridad: si en este turno se apartó boleta(s) pero NO se envió la boleta, se envía
    // sola (el cliente SIEMPRE debe recibir su boleta con el enlace). enviar_boleta muestra TODAS.
    if (apartoNumero && !envioBoleta && !apagado && (await sigueActivo(conv.id))) {
      try { await ejecutarHerramienta('enviar_boleta', {}, conv); } catch (_) {}
    }

    await soltarLock(conv);
    return res.status(200).json({ status: 'ok', agente_activo: !apagado });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}

// Libera el candado de la conversación (best-effort).
async function soltarLock(conv) {
  try { await supabaseAdmin.rpc('agente_soltar_lock', { p_conv: conv.id }); } catch (_) {}
}

// Cancela cualquier verificación de pago pendiente de este chat (best-effort).
async function cancelarVerificaciones(convId) {
  try {
    await supabaseAdmin.from('verificaciones_pago')
      .update({ estado: 'cancelado', actualizado_at: new Date().toISOString() })
      .eq('conversacion_id', convId).eq('estado', 'pendiente');
  } catch (_) {}
}

// Agenda (o reemplaza) la verificación de pago con reintentos: el relojito reintenta cada
// ~15 min, hasta ~1 hora, buscar el pago y abonar si aparece. Una sola activa por chat.
async function agendarVerificacion(conv, mediaId, numeroPedido) {
  try {
    await cancelarVerificaciones(conv.id);
    await supabaseAdmin.from('verificaciones_pago').insert({
      linea_id: conv.linea_id, telefono: conv.telefono, conversacion_id: conv.id,
      media_id: mediaId, numero_pedido: numeroPedido || null,
      intentos: 0, max_intentos: 4,
      proximo_intento_at: new Date(Date.now() + 15 * 60000).toISOString(),
      estado: 'pendiente',
    });
  } catch (_) {}
}

// ¿El agente SIGUE prendido en este chat? (para el "botón de pánico": si lo apagaron a mitad
// de la respuesta, dejamos de escribir/actuar). Ante duda (error de consulta), asumimos que sí.
async function sigueActivo(convId) {
  try {
    const { data } = await supabase.from('conversaciones_whatsapp').select('agente_activo').eq('id', convId).maybeSingle();
    return !data || data.agente_activo !== false;
  } catch (_) { return true; }
}
