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

// Precios de la IA por MILLÓN de tokens (USD). OJO (H29): la escritura de caché a
// 1 HORA (el ttl que usa este motor) cuesta 2× la entrada — NO 1.25×, que es solo
// para el ttl de 5 minutos. El panel subfacturaba ~16-22% del gasto real por esto.
// Caché de lectura = 0.1× entrada.
const PRECIOS = {
  'claude-opus-4-8':   { in: 5, out: 25, cw: 10, cr: 0.5 },
  'claude-sonnet-4-6': { in: 3, out: 15, cw: 6,  cr: 0.3 },
  'claude-haiku-4-5':  { in: 1, out: 5,  cw: 2,  cr: 0.1 },
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

// ── Festivos de Colombia ──────────────────────────────────────────────────
// El modelo NO sabe qué días son festivos en Colombia; se los calculamos y se los inyectamos
// (para que sepa, p. ej., que la casa no se puede visitar hoy si es festivo). Incluye los fijos,
// los de la Ley Emiliani (se trasladan al lunes siguiente) y los basados en la Pascua.
function _pascua(anio) {   // algoritmo de Meeus/Butcher (domingo de Pascua)
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4),
    e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}
function _ymd(date) { return date.toISOString().slice(0, 10); }
function _masDias(date, n) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + n); return d; }
function _aLunes(date) { const d = new Date(date); return _masDias(d, (1 - d.getUTCDay() + 7) % 7); } // traslado Emiliani al lunes
function festivosDeAnio(anio) {
  const f = {};
  const fijo = (m, d, n) => { f[_ymd(new Date(Date.UTC(anio, m - 1, d)))] = n; };
  const lunes = (m, d, n) => { f[_ymd(_aLunes(new Date(Date.UTC(anio, m - 1, d))))] = n; };
  fijo(1, 1, 'Año Nuevo'); fijo(5, 1, 'Día del Trabajo'); fijo(7, 20, 'Día de la Independencia');
  fijo(8, 7, 'Batalla de Boyacá'); fijo(12, 8, 'Inmaculada Concepción'); fijo(12, 25, 'Navidad');
  lunes(1, 6, 'Reyes Magos'); lunes(3, 19, 'San José'); lunes(6, 29, 'San Pedro y San Pablo');
  lunes(8, 15, 'Asunción'); lunes(10, 12, 'Día de la Raza'); lunes(11, 1, 'Todos los Santos');
  lunes(11, 11, 'Independencia de Cartagena');
  const p = _pascua(anio);
  f[_ymd(_masDias(p, -3))] = 'Jueves Santo';
  f[_ymd(_masDias(p, -2))] = 'Viernes Santo';
  f[_ymd(_aLunes(_masDias(p, 39)))] = 'Ascensión del Señor';
  f[_ymd(_aLunes(_masDias(p, 60)))] = 'Corpus Christi';
  f[_ymd(_aLunes(_masDias(p, 68)))] = 'Sagrado Corazón';
  return f;
}
// Devuelve el NOMBRE del festivo si la fecha 'YYYY-MM-DD' es festivo en Colombia, o null.
function festivoColombia(yyyymmdd) {
  const y = Number(String(yyyymmdd).slice(0, 4));
  return y ? (festivosDeAnio(y)[yyyymmdd] || null) : null;
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

// ── TEXTOS DE LA RIFA ACTUAL (H17) ───────────────────────────────────────────
// Textos que usan los atajos SIN IA y la herramienta del contacto inicial. Son
// los RESPALDOS: si en `agente_config.variables` existe la misma clave, MANDA la
// de la base — así, al rotar de rifa, se cambian desde la cabina SIN desplegar
// código. Checklist completo de rotación: docs/CHECKLIST-RIFA-NUEVA.md.
const TEXTOS_RIFA = {
  saludo_inicial: '¡Hola! 😊 Soy Liliana, te muestro la casa:',
  cierre_inicial: '• Cada boleta *cuesta 150 mil*\n\n• La puedes *separar con 20 mil* e ir abonando a tu ritmo\n\n• Estamos *autorizados por EDSA* (rifa legal)',
  texto_premios: 'Con una sola boleta de *4 cifras* (de 0000 a 9999) participas por todo esto:\n\n' +
    '*Premio Mayor{{fecha_mayor}}:* la casa de dos plantas totalmente amoblada, en Chinchiná (Caldas), con la Lotería de Boyacá.\n' +
    'Y si la ganas pero prefieres el dinero, te conseguimos un comprador que te paga *$300.000.000 en efectivo* por ella.\n\n' +
    '*Cada sábado:* *$5.000.000* en bonos, también con la Lotería de Boyacá.{{acumulado}}\n\n' +
    '*¿Te muestro los números disponibles?*',
  texto_pedir_datos: '¡Perfecto! 😊 Para apartarte el *{{numero}}* necesito tus datos para la factura:\n\n' +
    '*Nombre completo, apellido, ciudad, cédula y correo.*',
  condiciones_venta: 'el precio ($150 mil, se separa con $20 mil), que es legal (autorizados por EDSA)',
};

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
// (exportadas para que la suite dorada —probar-suite.js— pruebe el manual con las
//  MISMAS herramientas que ve el agente real, en modo seco, sin ejecutarlas)
export const TOOLS = [
  {
    name: 'enviar_contacto_inicial',
    // {{condiciones_venta}} se rellena al cargar la config de la línea (H17): al rotar
    // de rifa, el precio/condiciones se cambian en agente_config.variables sin desplegar.
    description: 'Envía la presentación inicial: un saludo + las fotos de la casa + un mensaje de cierre. Úsala UNA sola vez al comienzo, cuando el cliente acaba de llegar. TÚ redactas los textos (saludo y cierre). El CIERRE (lo que va después de las fotos) DEBE incluir: {{condiciones_venta}}, la RESPUESTA a cualquier pregunta que el cliente haya hecho en su saludo (ej. de dónde son), y terminar con "¿Te explico los premios?". Así va todo en un solo mensaje y no se duplica.',
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
    // OJO (H23): NO acepta teléfono — el ejecutor SIEMPRE consulta el del chat (privacidad).
    // Antes la descripción prometía consultar "otro teléfono", la IA lo creía y presentaba
    // las boletas de ESTE chat como si fueran del otro número (información falsa).
    description: 'Consulta las boletas, abonos y saldo del cliente de ESTE chat (siempre el teléfono de este chat; NO puede consultar otros números). Si el cliente pide datos de las boletas de OTRA persona u otro número, NO uses esta herramienta: dile con cariño que por privacidad cada cliente consulta lo suyo desde su propio WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {},
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
async function guardarEnChat(conv, { direccion, tipo = 'text', texto = null, media_url = null, wa_message_id = null, predefinido = false, fallido = false }) {
  const ts = new Date().toISOString();
  await supabaseAdmin.from('mensajes_whatsapp').insert({
    conversacion_id: conv.id, telefono: conv.telefono, linea_id: conv.linea_id,
    direccion, tipo, texto, media_url, wa_message_id,
    // raw.predefinido = el mensaje salió de un atajo SIN IA (saludo/premios/números/datos);
    // la bandeja lo muestra como "Mensaje predefinido" en vez de "🤖 Liliana".
    // fallido=true → WhatsApp RECHAZÓ el envío: se guarda como 'fallido' para que la IA no
    // "recuerde" haber dicho algo que el cliente nunca recibió (H10).
    estado_envio: direccion === 'nota' ? 'nota' : (fallido ? 'fallido' : 'enviado'), timestamp_wa: ts,
    raw: predefinido ? { agente: true, predefinido: true } : { agente: true },
  });
  // Un envío FALLIDO no marca el chat como "atendido": debe seguir saliendo en
  // "sin respuesta" para que un humano lo vea.
  if (direccion !== 'nota' && !fallido) {
    await supabaseAdmin.from('conversaciones_whatsapp')
      // no_leidos: 0 → cuando el agente responde, el chat queda "atendido" y se apaga
      // el contador verde de mensajes sin leer (antes solo se apagaba si un humano abría el chat).
      .update({ ultimo_mensaje: String(texto || '📷').slice(0, 200), ultimo_at: ts, ultimo_entrante: false, no_leidos: 0 })
      .eq('id', conv.id);
  } else if (direccion === 'nota') {
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

// ── CANDADO ANTI "PAGO FALSO" ────────────────────────────────────────────────
// La IA NUNCA debe decirle al cliente que su boleta quedó "pagada" o que se
// "registró el abono" si el abono NO se ejecutó de verdad (caso real 9-jun: dijo
// "pagada al 100%" sin registrar nada y dejó un pago de $100.000 sin asignar).
// Esta función detecta SOLO afirmaciones de un pago YA HECHO/registrado. No frena
// frases normales ("para pagar...", "cuando pagues...", "te falta abonar $X").
function afirmaPagoHecho(texto) {
  // Quitamos tildes para que las reglas no dependan de acentos (qued ó/quedo, registr é/registre).
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Marcadores de frase CONDICIONAL/FUTURA justo antes de la frase de pago: "cuando esté
  // pagada", "para quedar pagada al 100%", "una vez pagada", "te faltan $X para quedar
  // pagada"... NO son afirmaciones de un pago hecho — son frases normales de venta.
  // (Caso real 9-jun: la versión vieja bloqueaba "es 100% legal" y "cuando esté pagada
  // al 100% te enviamos la factura", y respondía hablando de un comprobante inexistente.)
  const COND = /\b(cuando|si|para|una vez|apenas|despues|hasta|antes|al estar|estar|este|estes|esten|quedar|quede|quedes|queden|falta|faltan|debe|debes|deben|necesita|necesitas)\b[^.,!?\n]{0,38}$/;
  // Marcador de NEGACIÓN justo antes (H31): "aún NO recibimos tu pago" es una verdad
  // de venta normal, no una afirmación de pago — no se bloquea.
  const NEG = /\b(no|aun no|todavia no|nunca|sin)\b[^.,!?\n]{0,30}$/;
  // Frases que SÍ afirman un pago ya hecho/registrado (pasado o estado actual).
  // OJO: "comprobante" se queda FUERA a propósito (el mensaje seguro dice "recibí tu comprobante").
  const PATRONES = [
    /pagad[ao]\s*al\s*100/g,                                                        // "pagada al 100%"
    /qued(o|aste)\s+(totalmente\s+|completamente\s+)?(pagad|abonad|al\s+dia)/g,     // "quedó pagada/abonada"
    /ya\s+(esta|estas|quedo|quedaste)\s+(totalmente\s+|completamente\s+)?(paga\b|pagad|abonad|al\s+dia)/g, // "ya está pagada"
    /(boleta|numero)\s+(ya\s+)?esta\s+(totalmente\s+|completamente\s+)?pagad/g,     // "tu boleta está pagada"
    /\bregistre\s+(tu|su|el)?\s*(abono|pago)/g,                                     // "registré tu abono" (pasado)
    /(tu|su|el)\s+(pago|abono)\s+(ya\s+)?(quedo|fue|esta)\s+(registrad|aplicad|confirmad|abonad)/g,
    /pago\s+confirmad/g,                                                            // "pago confirmado"
    // ── v2 (H31): formulaciones naturales que la versión 1 no cubría ──
    /\brecib(i|imos)\s+(tu|su|el)\s+(pago|abono|transferencia|consignacion)/g,      // "recibí tu pago"
    /(tu|su|el)\s+(pago|abono|transferencia)\s+(ya\s+)?(entro|llego|ingreso)\b/g,   // "tu pago ya entró"
    /se\s+(aplico|acredito|abono|registro)\s+(tu|su|el)\s+(pago|abono|transferencia)/g, // "se acreditó tu pago"
    /(tu|su)\s+(plata|dinero)\s+ya\s+qued(o|aron)\s+(en|aplicad|abonad|registrad)/g, // "tu plata ya quedó en..."
    /todo\s+en\s+orden\s+con\s+(tu|su|el)\s+(pago|abono)/g,                         // "todo en orden con tu pago"
  ];
  // Una frase cuenta SOLO si en la misma oración no viene precedida de un marcador
  // condicional NI de una negación.
  return PATRONES.some((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const antes = t.slice(Math.max(0, m.index - 45), m.index);
      if (!COND.test(antes) && !NEG.test(antes)) return true;
    }
    return false;
  });
}

// ¿El turno gira alrededor de un PAGO? (en los últimos mensajes el cliente mandó una
// FOTO —comprobante— o dijo que ya pagó/transfirió). El candado anti "pago falso" SOLO
// se arma en este contexto: fuera de él, una afirmación de pago es improbable y el
// mensaje seguro ("recibí tu comprobante...") no tendría ningún sentido para el cliente.
function esContextoPago(reales) {
  return (reales || []).slice(-12).some((m) => {
    if (m.direccion !== 'entrante') return false;
    if (m.tipo === 'image' && m.media_id) return true;
    const t = String(m.texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /(comprobante|soporte|captura|recibo|ya\s+(te\s+|le\s+)?(pague|pago\b|transferi|consigne|envie)|acabo\s+de\s+(pagar|transferir|consignar)|hice\s+(el|la|una)\s+(pago|transferencia|consignacion)|(te|le)\s+(pague|transferi|consigne))/.test(t);
  });
}

// Cuando el candado bloquea una confirmación de pago no verificada: en vez del texto
// de la IA, manda el mensaje SEGURO (nunca afirma el pago), avisa con una nota, marca
// el chat para revisión y deja el último comprobante en verificación automática.
async function manejarPagoNoVerificado(conv, reales) {
  // ¿Hay una FOTO (comprobante) reciente del cliente? Define el texto seguro y la verificación.
  const ult = [...(reales || [])].reverse().find(m => m.direccion === 'entrante' && m.tipo === 'image' && m.media_id);
  await decir(conv, ult
    ? '¡Gracias! 😊 Ya recibí tu comprobante y estoy *verificando tu pago*. Apenas me lo confirmen te aviso por aquí mismo. 🙏'
    : '😊 Estoy *verificando tu pago* en el sistema. Apenas me lo confirmen te aviso por aquí mismo. 🙏');
  await nota(conv, '⚠️ BLOQUEÉ una confirmación de pago NO verificada: la IA iba a decir que la boleta estaba pagada/abonada SIN haberse registrado el abono. Le respondí que estoy verificando y marqué el chat para revisión.');
  try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
  // Si el cliente mandó un comprobante (imagen) reciente, dejarlo en verificación
  // automática (el relojito reintenta y abona solo si el pago aparece de verdad).
  if (ult) { try { await agendarVerificacion(conv, ult.media_id, ''); } catch (_) {} }
}

// Marca la FOTO del comprobante del cliente como "pago asignado a la boleta NNNN"
// (escribe raw.pago_asignado en ese mensaje). La bandeja muestra un chip verde encima
// de la foto y la lista de comprobantes la cuenta como asignada. Best-effort.
async function marcarComprobanteAsignado(convId, mediaId, boleta, monto) {
  if (!convId || !mediaId) return;
  try {
    const { data: msg } = await supabaseAdmin.from('mensajes_whatsapp')
      .select('id, raw').eq('conversacion_id', convId).eq('media_id', mediaId)
      .order('timestamp_wa', { ascending: false }).limit(1).maybeSingle();
    if (!msg) return;
    const raw = (msg.raw && typeof msg.raw === 'object') ? msg.raw : {};
    raw.pago_asignado = { boleta: String(boleta || ''), monto: Number(monto || 0), at: new Date().toISOString() };
    await supabaseAdmin.from('mensajes_whatsapp').update({ raw }).eq('id', msg.id);
  } catch (_) { /* no es crítico */ }
}

// Envía un texto al cliente por WhatsApp y lo guarda en el chat. `predefinido`=true cuando
// el texto viene de un atajo SIN IA (para que la bandeja lo marque como "Mensaje predefinido").
async function decir(conv, texto, { predefinido = false } = {}) {
  const t = String(texto || '').trim();
  if (!t) return true;
  // MODO SOMBRA: no le escribe al cliente; deja una nota con lo que diría.
  if (conv.sombra) { await guardarEnChat(conv, { direccion: 'nota', tipo: 'nota', texto: '🌓 (modo sombra) le diría: «' + t + '»' }); return true; }
  const env = await enviarTexto(conv.telefono, t, conv.linea_id);
  const ok = !!(env && env.ok);
  // Si WhatsApp RECHAZÓ el envío (token vencido, límite, número bloqueado), se guarda como
  // 'fallido' (la IA no lo "recuerda" como dicho), se deja rastro y se marca el chat (H10).
  await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: t, wa_message_id: ok ? (env.wa_message_id || null) : null, predefinido, fallido: !ok });
  if (!ok) {
    await nota(conv, '⚠️ WhatsApp RECHAZÓ un mensaje al cliente (NO le llegó): «' + t.slice(0, 120) + '…». Marqué el chat para un asesor.');
    try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
  }
  return ok;
}

// Envía el "contacto inicial": saludo + fotos de la casa + cierre (precio/legalidad/"¿te explico
// los premios?"). Lo usan la herramienta enviar_contacto_inicial Y el atajo SIN IA del primer
// contacto genérico (ahorro de tokens). Todo se guarda en el chat (guardarEnChat marca el chat
// como respondido: ultimo_entrante=false, no_leidos=0).
async function enviarContactoInicial(conv, { saludo, cierre, predefinido = false } = {}) {
  // Respaldos por si el llamador no manda textos (los normales vienen del atajo o de la IA).
  const sal = String(saludo || '').trim() || TEXTOS_RIFA.saludo_inicial;
  const cie = String(cierre || '').trim() || (TEXTOS_RIFA.cierre_inicial + '\n\n*¿Te explico los premios?* 🤔');
  const e1 = await enviarTexto(conv.telefono, sal, conv.linea_id);
  if (e1 && e1.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: sal, wa_message_id: e1.wa_message_id, predefinido });
  const { data: rr } = await supabase.from('respuestas_rapidas').select('pasos').eq('linea_id', conv.linea_id).ilike('titulo', '%contacto inicial%').maybeSingle();
  const fotos = (rr && Array.isArray(rr.pasos) ? rr.pasos : []).filter(p => p.tipo === 'imagen' && (p.media_id || p.url));
  for (const p of fotos) {
    await dormir(600);
    const env = p.media_id ? await enviarImagenPorId(conv.telefono, p.media_id, '', conv.linea_id) : await enviarImagen(conv.telefono, p.url, '', conv.linea_id);
    if (env && env.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'image', texto: null, media_url: p.url || null, wa_message_id: env.wa_message_id, predefinido });
  }
  await dormir(PAUSA_MS);
  const e3 = await enviarTexto(conv.telefono, cie, conv.linea_id);
  if (e3 && e3.ok) await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto: cie, wa_message_id: e3.wa_message_id, predefinido });
  // La verdad del envío (H10): el saludo y el cierre son los textos críticos. Si alguno
  // falló, quien llamó debe saberlo para NO afirmar que el cliente recibió el contacto.
  return { ok: !!(e1 && e1.ok && e3 && e3.ok) };
}

// ¿El primer contacto lo RESUELVE el saludo predefinido? El saludo responde: precio, separar/abono,
// legalidad y el PRÓXIMO sorteo. El ~88% llega con el texto del anuncio ("¡Hola! quiero más
// información.") y muchos solo agregan "¿cuánto vale?" / "¿es legal?" / "¿cuándo juega?", que el
// saludo YA contesta → se los manda SIN IA. Solo va a la IA si piden algo que el saludo NO cubre:
// un número puntual de boleta, cómo/dónde pagar, números disponibles, ubicación o la lista de
// premios; también si es multimedia (audio/imagen) o un mensaje largo (tiene sustancia). Conservador:
// ante cualquiera de esos marcadores → IA, para no responder en falso ni sonar robot.
function primerContactoLoResuelveSaludo(reales) {
  const entrantes = (reales || []).filter(m => m.direccion === 'entrante');
  if (!entrantes.length || entrantes.length > 3) return false;
  const t = entrantes.map(m => String(m.texto || '')).join(' ').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');          // quita tildes
  if (!t.trim() || t.length > 180) return false;       // vacío o largo (con sustancia) → IA
  if (/\[(audio|imagen|foto|video|sticker|ubicacion|documento|gif)/.test(t)) return false;   // multimedia → IA
  if (/\d{3,4}/.test(t)) return false;                                                        // pide un número puntual
  if (/(numero|numeros|disponible|disponibil)/.test(t)) return false;                         // números disponibles
  if (/(consign|cuenta|nequi|daviplata|bancolombia|transferen|deposit|\bllave\b|bre[ -]?b|pagar|como pago|donde pago|metodo de pago|a nombre de quien|a que numero)/.test(t)) return false;  // pago
  if (/(donde queda|donde esta|donde es|direccion|ubicacion|que ciudad|en que ciudad)/.test(t)) return false;  // ubicación
  if (/(que premios|cuales premios|cuales son los premios|que me gano|cuanto me gano)/.test(t)) return false;  // lista de premios
  return true;   // saludo genérico o pregunta básica (precio/abono/legal/cuándo) → saludo predefinido
}

// ── ATAJOS SIN IA para los pasos del embudo (premios, números, datos) ─────────
// La misma idea del saludo predefinido, extendida a los siguientes pasos. Si el
// cliente SOLO asiente a lo que se le preguntó (sí / dale / muéstrame…) SIN meter
// una pregunta nueva ni algo distinto, mandamos el mensaje FIJO del paso siguiente
// sin llamar a la IA (ahorro de tokens). Ante cualquier señal de que se sale del
// libreto (una pregunta, un número que no sea de "separar", datos, audio/imagen,
// texto con sustancia) NO se usa el atajo y responde la IA. Conservador a propósito.
function normTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
// Palabras que DISPARAN "asentir/seguir" (al menos una debe aparecer) y palabras de
// RELLENO permitidas, por paso. Si aparece CUALQUIER palabra fuera de estas dos listas
// → el mensaje tiene sustancia → responde la IA.
const ASENT = {
  premios: {
    disp: new Set(['si','sii','siii','sip','sisas','claro','dale','bueno','ok','oka','okay','okey','vale','listo','porfa','please','obvio','perfecto','correcto','quiero','explicame','explica','explicas','expliques','explicarme','explicar','explicamelos','cuentame','cuenta','cuentame','contame','cuentas','cuentamelos','dime','digame','hagale','hagamos']),
    fill: new Set(['por','favor','gracias','de','una','los','el','premios','premio','me','gustaria','encantaria','saber','ya','va','vamos','sobre','acuerdo','esta','bien','y','senora','senor','muchas','mil','q','si']),
  },
  numeros: {
    disp: new Set(['si','sii','siii','sip','sisas','claro','dale','bueno','ok','oka','okay','okey','vale','listo','porfa','please','obvio','perfecto','quiero','muestrame','muestreme','muestra','muestramelos','muestrenme','ensename','ver','verlos','mostrar','miremos','veamos','mira']),
    fill: new Set(['por','favor','gracias','de','una','los','el','numeros','numero','disponibles','libres','me','a','que','hay','ya','y','muchas','mil','q','si','porfis']),
  },
};
function esAsentir(texto, paso) {
  const t = normTxt(texto);
  if (!t) return false;
  if (t.includes('?') || t.includes('¿')) return false;            // pregunta → IA
  if (/\d{3,}/.test(t)) return false;                              // menciona un número → IA
  const conf = ASENT[paso];
  if (!conf) return false;
  const palabras = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!palabras.length || palabras.length > 6) return false;       // vacío o con sustancia → IA
  let disparo = false;
  for (const w of palabras) {
    if (conf.disp.has(w)) { disparo = true; continue; }
    if (conf.fill.has(w)) continue;
    return false;                                                  // palabra desconocida = sustancia → IA
  }
  return disparo;
}
// ¿El cliente dice claramente que quiere SEPARAR un número puntual? (ej. "quiero el
// 7185", "el 7185 separalo"). Devuelve el número de 4 cifras, o null. Si es una
// PREGUNTA por un número ("¿el 1121?") o ya viene dando datos (correo), devuelve null
// para que lo maneje la IA.
function intentoSeparar(texto) {
  const t = normTxt(texto);
  if (!t || t.includes('?') || t.includes('¿') || t.includes('@')) return null;
  const palabras = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (palabras.length > 8) return null;                            // mensaje con sustancia → IA
  const num = (t.match(/\b(\d{4})\b/) || [])[1];
  if (!num) return null;
  if (!/(quiero|separa|separar|separal|separarlo|separamelo|aparta|apartar|apartal|apartarlo|apartamelo|guarda|guardar|guardal|reserv|me lo|lo quiero|lo separo|dame|escojo|elijo|tomo|me quedo)/.test(t)) return null;
  return num;
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
    if (!boletas || boletas.length === 0) return 'El cliente de ESTE chat NO tiene boletas registradas (es cliente nuevo).';
    const nombre = boletas[0].clientes?.nombre || 'Cliente';
    const detalle = boletas.map(b => `boleta ${b.numero}: abonado $${Number(b.total_abonado||0).toLocaleString('es-CO')}, debe $${Number(b.saldo_restante||0).toLocaleString('es-CO')}`).join('; ');
    // "de ESTE chat" a propósito (H23): que la IA nunca atribuya estos datos a otro número.
    return `Cliente de ESTE chat: ${nombre}. Boletas: ${detalle}.`;
  }

  if (nombre === 'enviar_contacto_inicial') {
    const envio = await enviarContactoInicial(conv, { saludo: input?.saludo, cierre: input?.cierre });
    if (!envio || !envio.ok) {
      await nota(conv, '⚠️ NO se pudo enviar el contacto inicial (WhatsApp rechazó el envío). Marqué el chat para un asesor.');
      try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
      return 'NO se pudo enviar el saludo (WhatsApp rechazó el envío; el cliente NO recibió nada). NO afirmes que le llegó algo. Un asesor revisará el chat; no escribas nada más.';
    }
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
    if (!env || !env.ok) {
      // H10: antes devolvía "Listo, le envié su boleta" aunque WhatsApp rechazara el envío
      // → la IA "recordaba" haberla mandado y el cliente nunca la recibía.
      await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto, wa_message_id: null, fallido: true });
      await nota(conv, '⚠️ NO se pudo enviar la boleta digital (WhatsApp rechazó el envío). Marqué el chat para un asesor.');
      try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
      return 'NO se pudo enviar la boleta (WhatsApp rechazó el envío; el cliente NO la recibió). NO afirmes que la recibió. Un asesor revisará el chat.';
    }
    await guardarEnChat(conv, { direccion: 'saliente', tipo: 'text', texto, wa_message_id: env.wa_message_id });
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

    // 2) Candado contra el cron de reintentos: si la verificación de este chat está
    // 'en_proceso' AHORA MISMO (el relojito la está revisando en este instante), NO
    // verificamos en paralelo — eso podía producir doble abono y mensajes contradictorios.
    const hace10min = new Date(Date.now() - 10 * 60000).toISOString();
    const { data: enProceso } = await supabaseAdmin
      .from('verificaciones_pago')
      .select('id').eq('conversacion_id', conv.id).eq('estado', 'en_proceso')
      .gte('actualizado_at', hace10min).limit(1);
    if (enProceso && enProceso.length) {
      return 'Ese pago YA se está verificando en este preciso momento (el sistema lo está revisando contra el banco). NO intentes registrarlo otra vez: dile al cliente con calma que estás confirmando su pago y que le avisas por aquí apenas quede registrado.';
    }
    // Y al revés: si hay una verificación 'pendiente' agendada, la reclamamos nosotros
    // (pasa a 'en_proceso') para que el cron no la procese mientras verificamos aquí.
    const { data: claimRows } = await supabaseAdmin
      .from('verificaciones_pago')
      .update({ estado: 'en_proceso', actualizado_at: new Date().toISOString() })
      .eq('conversacion_id', conv.id).eq('estado', 'pendiente')
      .select('id');
    const claimVerifId = claimRows && claimRows[0] && claimRows[0].id;
    // Suelta el claim (si lo tomamos) en los caminos que no lo cierran ni lo reemplazan.
    const soltarClaimVerif = async () => {
      if (!claimVerifId) return;
      try {
        await supabaseAdmin.from('verificaciones_pago')
          .update({ estado: 'pendiente', actualizado_at: new Date().toISOString() })
          .eq('id', claimVerifId).eq('estado', 'en_proceso');
      } catch (_) {}
    };

    // 3) Verificar contra los pagos REALES y abonar si hay coincidencia SÓLIDA (lógica probada).
    const numeroPedido = String(input?.numero || '').replace(/\D/g, '');
    const r = await verificarYAbonar({ telefono: conv.telefono, linea_id: conv.linea_id, conversacion_id: conv.id, mediaId, numeroPedido, pwd });

    if (r.tipo === 'abonado') {
      await cancelarVerificaciones(conv.id);
      await marcarComprobanteAsignado(conv.id, mediaId, r.numero, r.monto);   // marca la foto: "✅ pago asignado"
      await nota(conv, `Registré un abono de $${Number(r.monto).toLocaleString('es-CO')} a la boleta ${r.numero} (pago verificado contra el banco).`);
      return `Listo: registré el abono de $${Number(r.monto).toLocaleString('es-CO')} a la boleta ${r.numero}. Confírmaselo con alegría, agradécele y, si quieres que termine de pagar, recuérdale con cariño el saldo que le queda.`;
    }
    if (r.tipo === 'sin_saldo') {
      await soltarClaimVerif();
      return 'El cliente no tiene boletas con saldo pendiente para abonar. Verifícalo o pásalo a un asesor.';
    }
    if (r.tipo === 'error') {
      await soltarClaimVerif();
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

  // `redisparo`: la corrida anterior detectó que el cliente escribió MIENTRAS ella respondía
  // y se re-disparó a sí misma para atender ese mensaje (ver el cierre del handler).
  const { contrasena, linea_id, telefono, interno, recordatorio, redisparo } = req.body || {};
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

  // `conv` vive FUERA del try para que el catch global pueda soltar el candado y dejar
  // rastro si algo revienta a mitad de la corrida (antes el cliente quedaba en silencio
  // sin que nadie se enterara — H4/H11).
  let conv = null;
  let claimHastaMs = 0;   // momento (ms) del último mensaje del cliente que tomó esta corrida
  try {
    // 1) La conversación y su estado.
    const { data: convData } = await supabase
      .from('conversaciones_whatsapp')
      .select('id, telefono, linea_id, agente_activo')
      .eq('telefono', telefono).eq('linea_id', linea_id).maybeSingle();
    conv = convData;
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
      // Los envíos que WhatsApp RECHAZÓ no cuentan como dichos: si la IA los "recuerda",
      // no repite la boleta/confirmación que el cliente nunca recibió (H10). Cubre tanto
      // los rechazos síncronos (decir/enviar_boleta) como los que reporta el webhook de Meta.
      .or('estado_envio.is.null,estado_envio.neq.fallido')
      .order('timestamp_wa', { ascending: false })
      .limit(MAX_HISTORIAL);
    if (desdeRifa) qHist = qHist.gte('timestamp_wa', desdeRifa);
    const { data: histAsc } = await qHist;
    const historial = (histAsc || []).slice().reverse();
    const reales = historial.filter(m => m.direccion === 'entrante' || m.direccion === 'saliente');
    // Normalmente solo respondemos si el último mensaje es del cliente. EXCEPCIONES: un
    // recordatorio (el agente se programó volver a escribir) sí arranca aunque el último
    // mensaje sea suyo; y un RE-DISPARO (el cliente escribió mientras la corrida anterior
    // redactaba) también: ahí el último mensaje puede ser nuestro aunque haya un entrante
    // sin atender — el claim anti-duplicado de abajo decide si de verdad está pendiente.
    if (!recordatorio) {
      const pendiente = redisparo
        ? reales.some(m => m.direccion === 'entrante')
        : (reales.length && reales[reales.length - 1].direccion === 'entrante');
      if (!pendiente) {
        await soltarLock(conv);
        return res.status(200).json({ status: 'ok', skip: 'No hay un mensaje del cliente pendiente de responder.' });
      }
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
        claimHastaMs = hastaMs;   // lo usa el cierre para detectar mensajes que llegaron mientras respondíamos
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
        // Transcribir toma segundos; refrescar el candado para que no se venza (H5).
        try { await supabaseAdmin.rpc('agente_refrescar_lock', { p_conv: conv.id }); } catch (_) {}
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
          // Descargar imágenes toma segundos; refrescar el candado para que no se venza (H5).
          try { await supabaseAdmin.rpc('agente_refrescar_lock', { p_conv: conv.id }); } catch (_) {}
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
    // Textos de la rifa para atajos y herramientas (H17): los de agente_config.variables
    // MANDAN sobre los respaldos del código — rotar de rifa no exige desplegar.
    const textosRifa = { ...TEXTOS_RIFA, ...(cfg?.variables && typeof cfg.variables === 'object' ? cfg.variables : {}) };
    let toolsActivas = TOOLS
      .filter(t => activas.has(t.name))
      .map(t => ({ ...t, description: aplicarVariables(t.description, textosRifa) }));

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

    // ── ATAJO SIN IA: saludo predefinido cuando el saludo YA resuelve el primer contacto ──
    // El ~88% llega con el texto del anuncio ("¡Hola! quiero más información.") y muchos preguntan
    // cosas que el saludo YA responde (precio, abono, legalidad, cuándo juega). A esos les mandamos
    // el contacto inicial FIJO (saludo + fotos + cierre con el PRÓXIMO sorteo) SIN gastar IA. La IA
    // entra desde el 2º mensaje, o si el 1º pide algo que el saludo NO cubre (número, pago,
    // disponibles, ubicación, premios). Ya pasamos el candado atómico → no hay riesgo de saludo doble.
    if (!recordatorio && !conv.sombra && !yaHuboSalientes && !remision
        && !(estadoCliente.boletas && estadoCliente.boletas.length)
        && activas.has('enviar_contacto_inicial')
        && primerContactoLoResuelveSaludo(reales)) {
      // OJO (H2): la coletilla "con $20.000 ya entras" SOLO aplica a los sorteos de los
      // sábados. Cuando el próximo es el Premio Mayor (la casa), exige boleta 100% PAGADA:
      // del 28-jun al 4-jul este mensaje fijo prometía entrar a la casa con $20.000 (falso).
      const esPremioMayor = proximo && /mayor|casa/i.test(String(proximo.titulo || ''));
      const lineaProx = proximo
        ? `\n\nAdemás, *${etiquetaFecha(proximo.fecha)}* ya juega: *${String(proximo.titulo).trim()}*` +
          (montoAcumProximo ? ` (premio acumulado en *${montoAcumProximo}*)` : '') +
          (esPremioMayor
            ? ` — con tu boleta *100% pagada* participas por la casa. 🏡`
            : ` — con *$20.000* de abono ya entras. 🎉`)
        : '';
      const cierre = String(textosRifa.cierre_inicial || TEXTOS_RIFA.cierre_inicial) +
        lineaProx + '\n\n*¿Te explico los premios?* 🤔';
      await enviarContactoInicial(conv, { saludo: textosRifa.saludo_inicial, cierre, predefinido: true });
      await nota(conv, 'Envié el contacto inicial (saludo predefinido, SIN IA — ahorro de tokens).');
      await soltarLock(conv);
      return res.status(200).json({ status: 'ok', atajo: 'contacto_inicial_predefinido' });
    }

    // ── ATAJOS SIN IA para los siguientes pasos del embudo (premios, números, datos) ──
    // Si el cliente SOLO asiente a lo último que se le preguntó (o pide separar un número
    // puntual), mandamos el mensaje FIJO del paso sin llamar a la IA. Ante cualquier señal
    // de que se sale del libreto → NO se usa el atajo y responde la IA (más abajo). Mismos
    // candados que el saludo predefinido (no en sombra, no remisión, no si ya tiene boleta).
    if (!recordatorio && !conv.sombra && !remision
        && !(estadoCliente.boletas && estadoCliente.boletas.length)) {
      // Último mensaje de texto que mandó Liliana (qué fue lo último que preguntó).
      const ultSal = [...reales].reverse().find(m => m.direccion === 'saliente' && m.tipo === 'text' && m.texto);
      const salTxt = ultSal ? normTxt(ultSal.texto) : '';
      // La tanda de mensajes ENTRANTES más reciente (lo que el cliente acaba de decir).
      const trailing = [];
      for (let k = reales.length - 1; k >= 0 && reales[k].direccion === 'entrante'; k--) trailing.unshift(reales[k]);
      const entranteTxt = (trailing.length && trailing.every(m => m.tipo === 'text'))
        ? trailing.map(m => m.texto || '').join(' ') : '';

      // PASO PREMIOS: Liliana preguntó "¿te explico los premios?" y el cliente solo asiente.
      if (entranteTxt && /explic\w* los premios|te explico los premios/.test(salTxt)
          && esAsentir(entranteTxt, 'premios')) {
        const sMayor = sorteosOrden.find(s => /mayor|casa/i.test(String(s.titulo || '')));
        const fMayor = sMayor ? etiquetaFecha(sMayor.fecha) : '';
        // El texto vive en agente_config.variables (H17); {{fecha_mayor}} la pone el calendario
        // y {{acumulado}} solo aparece si hay un acumulado VIGENTE (H22: antes el saludo lo
        // anunciaba y este mensaje fijo lo omitía — dos cifras distintas en mensajes seguidos,
        // justo lo que el manual prohíbe).
        const premiosTxt = aplicarVariables(String(textosRifa.texto_premios || TEXTOS_RIFA.texto_premios), {
          fecha_mayor: fMayor ? ' — ' + fMayor : '',
          acumulado: montoAcumProximo ? ` (y el del *próximo sábado* está acumulado en *${montoAcumProximo}*)` : '',
        });
        await decir(conv, premiosTxt, { predefinido: true });
        await nota(conv, 'Expliqué los premios (predefinido, SIN IA — ahorro de tokens).');
        await soltarLock(conv);
        return res.status(200).json({ status: 'ok', atajo: 'premios_predefinido' });
      }

      // PASO NÚMEROS: Liliana preguntó "¿te muestro los números?" y el cliente solo asiente.
      if (entranteTxt && activas.has('consultar_disponibles')
          && /muestro los numeros|ver los numeros|numeros disponibles/.test(salTxt)
          && esAsentir(entranteTxt, 'numeros')) {
        const { texto } = await numerosDisponibles({ canal: 'bandeja' });
        const msg = 'Aquí tienes una muestra de números libres (son *algunos* de los disponibles, no la lista completa):\n\n' +
          texto +
          '\n\n¿Cuál te gusta? Si quieres uno con alguna *terminación* o un número en especial, dime y lo verifico. 😊';
        await decir(conv, msg, { predefinido: true });
        await nota(conv, 'Mostré los números disponibles (predefinido, SIN IA — ahorro de tokens).');
        await soltarLock(conv);
        return res.status(200).json({ status: 'ok', atajo: 'numeros_predefinido' });
      }

      // PASO DATOS: el cliente dice claramente que quiere SEPARAR un número (ej. "quiero el 7185").
      // Le pedimos los datos con un mensaje fijo; el APARTAR lo hará la IA cuando lleguen los datos
      // (y ahí se verifica que el número siga libre, como hoy).
      const numSep = entranteTxt ? intentoSeparar(entranteTxt) : null;
      if (numSep && activas.has('apartar_numero')
          && !/necesito tus datos|para apartar|nombre completo/.test(salTxt)) {
        const pedir = aplicarVariables(String(textosRifa.texto_pedir_datos || TEXTOS_RIFA.texto_pedir_datos),
          { numero: numSep });
        await decir(conv, pedir, { predefinido: true });
        await nota(conv, 'Pedí los datos para apartar el ' + numSep + ' (predefinido, SIN IA — ahorro de tokens).');
        await soltarLock(conv);
        return res.status(200).json({ status: 'ok', atajo: 'datos_predefinido' });
      }
    }

    const festivoHoy = festivoColombia(hoyCol);
    const systemVolatil =
      `\n\n---\nCONTEXTO (no lo menciones literalmente): hoy es ${contextoFechaHora()} (Colombia). ` +
      (festivoHoy ? `OJO: HOY es DÍA FESTIVO en Colombia (${festivoHoy}), así que la casa NO se puede visitar hoy (domingos y festivos no abre). Si preguntan por visitar HOY, díselo con cariño y ofréceles los horarios de los otros días. ` : '') +
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
    let huboAbono = false;      // ¿se registró un abono REAL en este turno? (candado anti pago falso)
    // Verdad del sistema al empezar el turno (para el candado): ¿tiene boletas?, ¿todas pagadas?
    const bolsCliente = (estadoCliente.boletas || []);
    const tieneBoletas = bolsCliente.length > 0;
    const todasPagadas = tieneBoletas && bolsCliente.every(b => Number(b.saldo_restante || 0) <= 0);
    // ¿Debo BLOQUEAR este texto? Solo si el turno es de PAGO (hay comprobante o el cliente
    // dijo que pagó), el texto afirma un pago hecho, no hubo abono real este turno, y la
    // verdad del sistema NO respalda la afirmación (sigue debiendo, o no tiene boletas).
    const contextoPago = esContextoPago(reales);
    const debeBloquear = (txt) => contextoPago && !huboAbono && afirmaPagoHecho(txt) && ((tieneBoletas && !todasPagadas) || !tieneBoletas);
    // Llama a la IA con UN reintento ante errores TRANSITORIOS (429 límite de tasa, 529
    // sobrecarga, 5xx, respuesta no-JSON, red caída): un blip de Anthropic ya no deja al
    // cliente en silencio (H4/H11). Antes de la espera refresca el candado para que no
    // venza (60s) y entre otra corrida a responder doble. Los errores NO transitorios
    // (petición inválida) no se reintentan.
    const llamarIA = async (body) => {
      for (let intento = 0; ; intento++) {
        let transitorio = false;
        try {
          const resp = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'extended-cache-ttl-2025-04-11' },
            body: JSON.stringify(body),
          });
          const data = await resp.json();   // puede lanzar si la respuesta no es JSON
          transitorio = !!data.error && (resp.status === 429 || resp.status >= 500);
          if (!transitorio || intento >= 1) return data;
        } catch (e) {
          if (intento >= 1) return { error: { message: 'fallo de red hacia la IA: ' + (e.message || e) } };
        }
        try { await supabaseAdmin.rpc('agente_refrescar_lock', { p_conv: conv.id }); } catch (_) {}
        await dormir(2500);
      }
    };

    for (let iter = 0; iter < MAX_ITER; iter++) {
      // Botón de pánico a mitad de la respuesta: si apagaron el agente en este chat, parar ya
      // (no mandar más mensajes ni ejecutar más acciones).
      if (iter > 0 && !(await sigueActivo(conv.id))) { await soltarLock(conv); return res.status(200).json({ status: 'ok', skip: 'Apagaron el agente a mitad de la respuesta.' }); }
      // Refrescar el candado en CADA vuelta: con herramientas + imágenes un turno puede pasar
      // de los 60s en que el candado se vence solo, y otra corrida entraría a responder doble (H5).
      try { await supabaseAdmin.rpc('agente_refrescar_lock', { p_conv: conv.id }); } catch (_) {}
      const data = await llamarIA({ model: modelo, max_tokens: 1024, system, messages, ...(toolsActivas.length ? { tools: toolsActivas } : {}) });
      if (data.error) {
        // Ya se reintentó y no se pudo: dejar rastro Y marcar el chat para que un humano
        // lo retome (antes solo quedaba una nota gris que nadie veía — H4/H11).
        await nota(conv, 'No pude responder (problema con la IA, reintenté y siguió fallando): ' + (data.error.message || 'error') + '. Marqué el chat para un asesor.');
        try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
        await soltarLock(conv);
        return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') });
      }
      await registrarUso(conv, modelo, data.usage);   // anotar lo que costó esta respuesta

      const bloques = data.content || [];
      const toolUses = bloques.filter(b => b.type === 'tool_use');
      const vaAUsarHerramientas = data.stop_reason === 'tool_use' && toolUses.length > 0;
      let bloqueoPagoHecho = false;   // para no duplicar el mensaje seguro si hay varios bloques
      for (const b of bloques) {
        // No narrar el proceso: si en este turno va a usar herramientas, NO mandes el
        // texto de relleno ("voy a...", "un momento..."); solo el mensaje FINAL (cuando
        // ya no quedan herramientas por usar) se le envía al cliente.
        if (b.type === 'text' && b.text && b.text.trim() && !vaAUsarHerramientas) {
          const t = b.text.trim();
          // CANDADO: no dejar que afirme un pago que no se registró de verdad.
          if (debeBloquear(t)) { if (!bloqueoPagoHecho) { await manejarPagoNoVerificado(conv, reales); bloqueoPagoHecho = true; } }
          else if (!bloqueoPagoHecho) await decir(conv, t);
        }
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
        if (tu.name === 'registrar_abono' && typeof out === 'string' && out.startsWith('Listo: registré el abono')) huboAbono = true;
        if (tu.name === 'enviar_boleta') envioBoleta = true;
        if (tu.name === 'enviar_contacto_inicial') cerrarSinTexto = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      if (cerrarSinTexto && !apagado) break;
      if (apagado) {
        const d2 = await llamarIA({ model: modelo, max_tokens: 400, system, messages });
        if (!d2.error) { await registrarUso(conv, modelo, d2.usage); for (const b of (d2.content || [])) if (b.type === 'text' && b.text?.trim()) { const t = b.text.trim(); if (debeBloquear(t)) await manejarPagoNoVerificado(conv, reales); else await decir(conv, t); } }
        else { await nota(conv, 'El cliente pidió un humano y NO pude mandarle la despedida (falló la IA): ' + (d2.error.message || 'error') + '. El chat ya quedó marcado ASESOR.'); }
        break;
      }
    }

    // Red de seguridad: si en este turno se apartó boleta(s) pero NO se envió la boleta, se envía
    // sola (el cliente SIEMPRE debe recibir su boleta con el enlace). enviar_boleta muestra TODAS.
    if (apartoNumero && !envioBoleta && !apagado && (await sigueActivo(conv.id))) {
      try { await ejecutarHerramienta('enviar_boleta', {}, conv); } catch (_) {}
    }

    await soltarLock(conv);

    // ¿El cliente escribió MIENTRAS respondíamos? (H5/H21). Antes ese mensaje quedaba en
    // visto para siempre: la corrida que disparó chocó con el candado y nada lo reintentaba.
    // Ahora, ya con el candado suelto, esta corrida se re-dispara a sí misma (una vez) si
    // existe un entrante posterior al último mensaje que tomó su claim.
    if (claimHastaMs > 0 && !redisparo && !apagado && tokenInterno) {
      try {
        const { data: nuevos } = await supabaseAdmin
          .from('mensajes_whatsapp').select('id')
          .eq('conversacion_id', conv.id).eq('direccion', 'entrante')
          .gt('timestamp_wa', new Date(claimHastaMs).toISOString())
          .limit(1);
        if (nuevos && nuevos.length && (await sigueActivo(conv.id))) {
          await fetch(`${BASE_URL}/api/whatsapp/agente-responder`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interno: tokenInterno, linea_id, telefono, redisparo: true }),
            signal: AbortSignal.timeout(1500),
          }).catch(() => {});
        }
      } catch (_) {}
    }

    return res.status(200).json({ status: 'ok', agente_activo: !apagado });
  } catch (e) {
    // El catch global ANTES devolvía un 500 que nadie leía (el webhook corta a 1.5s), SIN
    // soltar el candado ni dejar rastro (H4/H11). Ahora: suelta el lock, deja el error en
    // la actividad del agente y marca el chat ASESOR para que un humano lo retome.
    if (conv) {
      await soltarLock(conv);
      try {
        await supabaseAdmin.from('agente_actividad').insert({
          linea_id: conv.linea_id, telefono: conv.telefono, tipo: 'error',
          resumen: ('Error inesperado del motor (el cliente pudo quedar sin respuesta): ' + (e.message || e)).slice(0, 500),
        });
      } catch (_) {}
      try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
    }
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}

// Libera el candado de la conversación (best-effort).
async function soltarLock(conv) {
  try { await supabaseAdmin.rpc('agente_soltar_lock', { p_conv: conv.id }); } catch (_) {}
}

// Cancela cualquier verificación de pago activa de este chat (best-effort).
// Cubre 'pendiente' y también 'en_proceso' (el claim que toma registrar_abono o el cron),
// para que al reemplazar/cerrar no quede una fila viva que reviva después.
async function cancelarVerificaciones(convId) {
  try {
    await supabaseAdmin.from('verificaciones_pago')
      .update({ estado: 'cancelado', actualizado_at: new Date().toISOString() })
      .eq('conversacion_id', convId).in('estado', ['pendiente', 'en_proceso']);
  } catch (_) {}
}

// Agenda (o reemplaza) la verificación de pago con reintentos: el relojito reintenta cada
// ~15 min, hasta ~1 hora, buscar el pago y abonar si aparece. Una sola activa por chat.
async function agendarVerificacion(conv, mediaId, numeroPedido) {
  try {
    await cancelarVerificaciones(conv.id);
    // OJO: supabase-js NO lanza excepción ante errores de la base — devuelve { error }.
    // Hay que revisarlo: si este insert falla, al cliente ya se le prometió "estoy
    // verificando tu pago" y NADIE iba a verificar nunca (H13, ruta del dinero).
    const { error } = await supabaseAdmin.from('verificaciones_pago').insert({
      linea_id: conv.linea_id, telefono: conv.telefono, conversacion_id: conv.id,
      media_id: mediaId, numero_pedido: numeroPedido || null,
      intentos: 0, max_intentos: 4,
      proximo_intento_at: new Date(Date.now() + 15 * 60000).toISOString(),
      estado: 'pendiente',
    });
    if (error) throw new Error(error.message || 'insert falló');
  } catch (e) {
    try {
      await supabaseAdmin.from('agente_actividad').insert({
        linea_id: conv.linea_id, telefono: conv.telefono, tipo: 'error',
        resumen: ('⚠️ No pude AGENDAR la verificación del pago — el cliente quedó esperando que se verifique: ' + (e.message || e)).slice(0, 500),
      });
    } catch (_) {}
    try { await ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', { icono: '🆘', color: '#fdecec' }); } catch (_) {}
  }
}

// ¿El agente SIGUE prendido en este chat? (para el "botón de pánico": si lo apagaron a mitad
// de la respuesta, dejamos de escribir/actuar). Ante duda (error de consulta), asumimos que sí.
async function sigueActivo(convId) {
  try {
    const { data } = await supabase.from('conversaciones_whatsapp').select('agente_activo').eq('id', convId).maybeSingle();
    return !data || data.agente_activo !== false;
  } catch (_) { return true; }
}
