/**
 * Enviar la boleta al cliente desde la bandeja (atajo del chat).
 *
 * Dado el teléfono del chat abierto: busca en la base las boletas de ese número
 * y se las envía. Hay tres caminos (en este orden de preferencia):
 *
 *   - Plantilla "boleta_cliente_v2" (Utilidad) si está APROBADA: su PRIMERA línea
 *     es variable, así que refleja el estado real (separada / participando / pagada).
 *   - Plantilla vieja "boleta_cliente" (1 sola variable, primera línea fija) como
 *     RESPALDO, mientras Meta aprueba la v2 (para no dejar de enviar).
 *   - Texto normal: si no hay ninguna plantilla aprobada.
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, telefono }
 *   previsualizar  → arma el mensaje y dice si saldrá como plantilla o texto
 *   enviar         → lo envía y lo deja en el historial del chat
 *   crear-plantilla→ crea la plantilla v2 en Meta (1 sola vez)
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarPlantilla, crearPlantillaMeta } from '../lib/whatsapp.js';

const pesos = (v) => '$' + Number(v || 0).toLocaleString('es-CO');

// ── Plantilla "bonita" de la boleta (Utilidad) ──
// v2: la PRIMERA línea es variable ({{1}}, el estado) y {{2}} es la lista de boletas.
const TPL_NOMBRE = 'boleta_cliente_v2';
const TPL_NOMBRE_VIEJA = 'boleta_cliente';     // respaldo (1 variable, primera línea fija)
const TPL_IDIOMA = 'es';
const TPL_HEADER = 'Tu boleta de Los Plata';
// OJO: Meta NO permite que el cuerpo empiece (ni termine) con una variable, ni dos variables
// seguidas. Por eso arranca con un saludo fijo y {{1}} y {{2}} van separadas por texto fijo.
const TPL_BODY =
  'Hola 👋\n\n' +
  '{{1}}\n\n' +
  'Estas son tus boletas para la rifa de Los Plata:\n\n' +
  '{{2}}\n\n' +
  'Guárdalas y consúltalas cuando quieras con el botón de abajo. ¡Te deseamos mucha suerte! 🍀';
// Cuerpo de la plantilla VIEJA (solo para la vista previa cuando se usa de respaldo).
const TPL_BODY_VIEJA =
  '🎉 ¡Quedaste participando!\n\n' +
  'Estas son tus boletas para la rifa de Los Plata:\n\n' +
  '{{1}}\n\n' +
  'Guárdalas y consúltalas cuando quieras con el botón de abajo. ¡Te deseamos mucha suerte! 🍀';
const TPL_FOOTER = 'LOS PLATA S.A.S. — Pagos solo a nuestro nombre';
const TPL_BTN_TEXTO = 'Ver mi boleta';
const TPL_BTN_URL_BASE = 'https://www.losplata.com.co/boleta?telefono=';

// Componentes en el formato que pide Meta para CREAR la plantilla v2 (2 variables en el cuerpo).
function componentesBoleta() {
  return [
    { type: 'HEADER', format: 'TEXT', text: TPL_HEADER },
    { type: 'BODY', text: TPL_BODY, example: { body_text: [['🎉 ¡Ya estás participando!', '1234 (falta $50.000)']] } },
    { type: 'FOOTER', text: TPL_FOOTER },
    { type: 'BUTTONS', buttons: [
      { type: 'URL', text: TPL_BTN_TEXTO, url: TPL_BTN_URL_BASE + '{{1}}', example: [TPL_BTN_URL_BASE + '3001234567'] },
    ] },
  ];
}

// Encabezado según el estado de pago. Regla: con $0 abonado la boleta SOLO está separada
// (aún NO participa); con cualquier abono ya participa; pagada al 100% es lo máximo.
function encabezadoBoleta(boletas) {
  const una = boletas.length === 1;
  const todasPagadas = boletas.every(b => Number(b.saldo_restante || 0) <= 0);
  const totalAbonado = boletas.reduce((s, b) => s + Number(b.total_abonado || 0), 0);
  if (todasPagadas) return una ? '✅ ¡Tu boleta está paga al 100%! Ya estás participando 🎉' : '✅ ¡Tus boletas están pagas al 100%! Ya estás participando 🎉';
  if (totalAbonado > 0) return una ? '🎉 ¡Ya estás participando con tu boleta!' : '🎉 ¡Ya estás participando con tus boletas!';
  return una ? '📝 ¡Tu boleta quedó separada! Haz tu primer abono para entrar al sorteo.' : '📝 ¡Tus boletas quedaron separadas! Hagan su primer abono para entrar al sorteo.';
}

const estadoBoleta = (b) => Number(b.saldo_restante || 0) <= 0 ? '✅ Pagada' : ('Te falta abonar *' + pesos(b.saldo_restante) + '*');
const lineaBoleta = (b) => `*${b.numero}*  ·  ${estadoBoleta(b)}`;
const enlaceBoletas = (last10) => `https://www.losplata.com.co/boleta?telefono=${last10}`;

// Lista de boletas en VARIAS líneas (para la vista previa / texto legible).
const listaMultilinea = (boletas) => boletas.map(b => `${b.numero} (${Number(b.saldo_restante || 0) <= 0 ? 'Pagada' : ('falta ' + pesos(b.saldo_restante))})`).join('\n');
// Lista en UNA sola línea (Meta no permite saltos dentro de una variable de plantilla).
const listaUnaLinea = (boletas) => boletas.map(b => `${b.numero} (${Number(b.saldo_restante || 0) <= 0 ? 'Pagada' : ('falta ' + pesos(b.saldo_restante))})`).join('  ·  ');

// Vista previa de la plantilla v2 (encabezado variable + lista).
function previewV2(boletas, last10) {
  const cuerpo = TPL_BODY.replace('{{1}}', encabezadoBoleta(boletas)).replace('{{2}}', listaMultilinea(boletas));
  return `*${TPL_HEADER}*\n\n${cuerpo}\n\n[ ${TPL_BTN_TEXTO} ]  →  ${enlaceBoletas(last10)}\n\n_${TPL_FOOTER}_`;
}
// Vista previa de la plantilla VIEJA (primera línea fija).
function previewV1(boletas, last10) {
  const cuerpo = TPL_BODY_VIEJA.replace('{{1}}', listaMultilinea(boletas));
  return `*${TPL_HEADER}*\n\n${cuerpo}\n\n[ ${TPL_BTN_TEXTO} ]  →  ${enlaceBoletas(last10)}\n\n_${TPL_FOOTER}_`;
}
// Texto de respaldo (cuando NO hay ninguna plantilla aprobada). Mismo encabezado por estado.
function textoRespaldo(boletas, last10) {
  const una = boletas.length === 1;
  const intro = una ? 'Esta es tu boleta para la rifa de *Los Plata*:' : 'Estas son tus boletas para la rifa de *Los Plata*:';
  const lista = boletas.map(lineaBoleta).join('\n');
  const verbo = una ? 'Consulta tu boleta aquí' : 'Consulta tus boletas aquí';
  return `${encabezadoBoleta(boletas)}\n\n${intro}\n\n${lista}\n\n👉 ${verbo}:\n${enlaceBoletas(last10)}`;
}

// Busca (o crea) la conversación de un teléfono en una línea y devuelve su id.
async function asegurarConv(telefono, lineaId, asesor) {
  let b = supabaseAdmin.from('conversaciones_whatsapp').select('id').eq('telefono', telefono);
  b = lineaId ? b.eq('linea_id', lineaId) : b.is('linea_id', null);
  const { data } = await b.maybeSingle();
  if (data) return data.id;
  const { data: nueva } = await supabaseAdmin
    .from('conversaciones_whatsapp')
    .insert({ telefono, linea_id: lineaId || null, ultimo_entrante: false, estado: 'humano', asesor_asignado: asesor })
    .select('id').single();
  return nueva ? nueva.id : null;
}

// Estado de una plantilla por nombre en esta línea (o null si no existe).
async function estadoPlantilla(lineaId, nombre) {
  const { data } = await supabase
    .from('plantillas_whatsapp').select('estado').eq('linea_id', lineaId).eq('nombre', nombre).maybeSingle();
  return data ? data.estado : null;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id, telefono } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombreAsesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    // Crear la plantilla v2 (una sola vez por línea).
    if (accion === 'crear-plantilla') {
      const yaEstado = await estadoPlantilla(linea_id, TPL_NOMBRE);
      if (yaEstado) return res.status(200).json({ status: 'ok', yaExistia: true, estado: yaEstado });
      const meta = await crearPlantillaMeta(linea_id, {
        nombre: TPL_NOMBRE, categoria: 'UTILITY', idioma: TPL_IDIOMA, componentes: componentesBoleta(),
      });
      if (!meta.ok) return res.status(200).json({ status: 'error', mensaje: 'Meta no aceptó la plantilla: ' + meta.error });
      await supabaseAdmin.from('plantillas_whatsapp').insert({
        linea_id, nombre: TPL_NOMBRE, categoria: 'UTILITY', idioma: TPL_IDIOMA,
        encabezado: TPL_HEADER, cuerpo: TPL_BODY, pie: TPL_FOOTER,
        meta_template_id: meta.id || null, estado: 'pendiente',
      });
      return res.status(200).json({ status: 'ok', estado: 'pendiente' });
    }

    // De aquí en adelante se necesita el teléfono del cliente.
    if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono.' });
    const last10 = String(telefono).replace(/\D/g, '').slice(-10);

    const { data: boletas, error } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, total_abonado, clientes (nombre)')
      .like('telefono_cliente', '%' + last10);
    if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

    if (!boletas || boletas.length === 0) {
      return res.status(200).json({ status: 'ok', encontrado: false });
    }

    const nombre = (boletas[0].clientes && boletas[0].clientes.nombre) || '';
    boletas.sort((a, b) => Number(a.numero) - Number(b.numero));

    // ¿La ventana de 24h está abierta? (el cliente escribió hace menos de 24h). Si SÍ, mandamos
    // TEXTO normal: gratis, al instante y sin saludo. Solo si ya se cerró usamos una PLANTILLA
    // (que cuesta y sirve para reabrir la conversación).
    const { data: convRow } = await supabase
      .from('conversaciones_whatsapp').select('ventana_vence_at')
      .eq('telefono', telefono).eq('linea_id', linea_id).maybeSingle();
    const ventanaAbierta = !!(convRow && convRow.ventana_vence_at && new Date(convRow.ventana_vence_at).getTime() > Date.now());

    const estV2 = await estadoPlantilla(linea_id, TPL_NOMBRE);
    const estV1 = await estadoPlantilla(linea_id, TPL_NOMBRE_VIEJA);
    let via;
    if (ventanaAbierta) via = 'texto';                  // dentro de 24h → texto libre (gratis, sin saludo)
    else if (estV2 === 'aprobada') via = 'v2';          // fuera de 24h → plantilla v2 (reabre)
    else if (estV1 === 'aprobada') via = 'v1';          // respaldo mientras Meta aprueba la v2
    else via = 'texto';                                 // sin plantilla: intento texto (fuera de 24h puede fallar)
    const usarPlantilla = via === 'v2' || via === 'v1';
    const mensaje = via === 'v2' ? previewV2(boletas, last10) : (via === 'v1' ? previewV1(boletas, last10) : textoRespaldo(boletas, last10));

    if (accion === 'previsualizar') {
      return res.status(200).json({
        status: 'ok', encontrado: true, nombre, total: boletas.length,
        modo: usarPlantilla ? 'plantilla' : 'texto',
        ventanaAbierta, plantillaEstado: estV2, puedeCrear: !ventanaAbierta && !estV2, mensaje,
      });
    }

    if (accion === 'enviar') {
      let env;
      if (via === 'v2') {
        env = await enviarPlantilla(telefono, {
          nombre: TPL_NOMBRE, idioma: TPL_IDIOMA,
          parametros: [encabezadoBoleta(boletas), listaUnaLinea(boletas)], botonUrlParam: last10,
        }, linea_id);
      } else if (via === 'v1') {
        env = await enviarPlantilla(telefono, {
          nombre: TPL_NOMBRE_VIEJA, idioma: TPL_IDIOMA,
          parametros: [listaUnaLinea(boletas)], botonUrlParam: last10,
        }, linea_id);
      } else {
        env = await enviarTexto(telefono, mensaje, linea_id);
      }
      if (!env || !env.ok) return res.status(200).json({ status: 'error', mensaje: (env && env.error) || 'No se pudo enviar.' });

      // Texto que se guarda en el historial (legible, con saltos de línea).
      const textoHistorial = via === 'v2' ? previewV2(boletas, last10) : (via === 'v1' ? previewV1(boletas, last10) : mensaje);
      const conversacion_id = await asegurarConv(telefono, linea_id, nombreAsesor);
      const ts = new Date().toISOString();
      await supabaseAdmin.from('mensajes_whatsapp').insert({
        conversacion_id, telefono, linea_id: linea_id || null,
        direccion: 'saliente', tipo: 'text', texto: textoHistorial,
        wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts, raw: env.raw,
      });
      let upd = supabaseAdmin.from('conversaciones_whatsapp')
        .update({ ultimo_mensaje: '🎟️ Boleta(s) enviada(s)', ultimo_at: ts, ultimo_entrante: false })
        .eq('telefono', telefono);
      upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
      await upd;

      return res.status(200).json({ status: 'ok', wa_message_id: env.wa_message_id, modo: usarPlantilla ? 'plantilla' : 'texto' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
