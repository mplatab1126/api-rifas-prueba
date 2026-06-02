/**
 * Enviar la boleta al cliente desde la bandeja (atajo del chat).
 *
 * Dado el teléfono del chat abierto: busca en la base las boletas asignadas a
 * ese número y se las envía. Hay dos formas de envío:
 *
 *   - Plantilla "boleta_cliente" (Utilidad) si existe y está APROBADA por Meta:
 *     se ve bonita (encabezado, pie y botón "Ver mi boleta"). Es gratis cuando el
 *     cliente escribió en las últimas 24h.
 *   - Texto normal (respaldo): si aún no hay plantilla aprobada, se manda como
 *     texto para que el botón nunca deje de funcionar. Al aprobarse la plantilla,
 *     pasa a usarla solo.
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, telefono }
 *   previsualizar  → arma el mensaje y dice si saldrá como plantilla o texto
 *   enviar         → lo envía y lo deja en el historial del chat
 *   crear-plantilla→ crea la plantilla "boleta_cliente" en Meta (1 sola vez)
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto, enviarPlantilla, crearPlantillaMeta } from '../lib/whatsapp.js';

const pesos = (v) => '$' + Number(v || 0).toLocaleString('es-CO');

// ── Definición de la plantilla "bonita" de la boleta (Utilidad) ──
const TPL_NOMBRE = 'boleta_cliente';
const TPL_IDIOMA = 'es';
const TPL_HEADER = 'Tu boleta de Los Plata';
const TPL_BODY =
  '🎉 ¡Quedaste participando!\n\n' +
  'Estas son tus boletas para la rifa de Los Plata:\n\n' +
  '{{1}}\n\n' +
  'Guárdalas y consúltalas cuando quieras con el botón de abajo. ¡Te deseamos mucha suerte! 🍀';
const TPL_FOOTER = 'LOS PLATA S.A.S. — Pagos solo a nuestro nombre';
const TPL_BTN_TEXTO = 'Ver mi boleta';
const TPL_BTN_URL_BASE = 'https://www.losplata.com.co/boleta?telefono=';

// Componentes en el formato que pide Meta para CREAR la plantilla.
function componentesBoleta() {
  return [
    { type: 'HEADER', format: 'TEXT', text: TPL_HEADER },
    { type: 'BODY', text: TPL_BODY, example: { body_text: [['🎟️ 1234 (Pagada)']] } },
    { type: 'FOOTER', text: TPL_FOOTER },
    { type: 'BUTTONS', buttons: [
      { type: 'URL', text: TPL_BTN_TEXTO, url: TPL_BTN_URL_BASE + '{{1}}', example: [TPL_BTN_URL_BASE + '3001234567'] },
    ] },
  ];
}

const estadoBoleta = (b) => Number(b.saldo_restante || 0) <= 0 ? '✅ Pagada' : ('Te falta abonar *' + pesos(b.saldo_restante) + '*');

// Una línea por boleta, limpia: número en negrita + estado. Sin enlaces ni
// emojis repetidos (el enlace va UNA sola vez, abajo).
const lineaBoleta = (b) => `*${b.numero}*  ·  ${estadoBoleta(b)}`;

// Enlace único para ver la(s) boleta(s): abre la página que, si hay varias,
// le deja elegir cuál ver.
const enlaceBoletas = (last10) => `https://www.losplata.com.co/boleta?telefono=${last10}`;

// La variable {{1}} de la plantilla: lista de boletas en UNA sola línea
// (Meta no permite saltos de línea dentro de una variable).
function variableBoletas(boletas) {
  const est = (b) => Number(b.saldo_restante || 0) <= 0 ? 'Pagada' : ('falta ' + pesos(b.saldo_restante));
  return boletas.map(b => `${b.numero} (${est(b)})`).join('  ·  ');
}

// Cómo se verá la plantilla para el cliente (para mostrar en la vista previa).
function previewPlantilla(boletas, last10) {
  const est = (b) => Number(b.saldo_restante || 0) <= 0 ? 'Pagada' : ('falta ' + pesos(b.saldo_restante));
  const cuerpo = TPL_BODY.replace('{{1}}', boletas.map(b => `${b.numero} (${est(b)})`).join('\n'));
  return `*${TPL_HEADER}*\n\n${cuerpo}\n\n[ ${TPL_BTN_TEXTO} ]  →  ${enlaceBoletas(last10)}\n\n_${TPL_FOOTER}_`;
}

// Texto de respaldo (cuando no hay plantilla aprobada). Es el "cierre feliz"
// de la compra: no saluda, celebra, lista las boletas y deja UN solo enlace.
function textoRespaldo(boletas, last10) {
  const todasPagadas = boletas.every(b => Number(b.saldo_restante || 0) <= 0);
  const una = boletas.length === 1;
  const header = todasPagadas
    ? '🎉 ¡Quedaste participando!'
    : (una ? 'Aquí está tu boleta 🎟️' : 'Aquí están tus boletas 🎟️');
  const intro = una
    ? 'Esta es tu boleta para la rifa de *Los Plata*:'
    : 'Estas son tus boletas para la rifa de *Los Plata*:';
  const lista = boletas.map(lineaBoleta).join('\n');
  const verbo = una ? 'Consulta tu boleta aquí' : 'Consulta tus boletas aquí';
  return `${header}\n\n${intro}\n\n${lista}\n\n👉 ${verbo}:\n${enlaceBoletas(last10)}\n\n¡Te deseamos mucha suerte! 🍀`;
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

// ¿Hay plantilla "boleta_cliente" en esta línea? Devuelve su estado o null.
async function estadoPlantilla(lineaId) {
  const { data } = await supabase
    .from('plantillas_whatsapp').select('estado').eq('linea_id', lineaId).eq('nombre', TPL_NOMBRE).maybeSingle();
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
    // Crear la plantilla bonita (una sola vez por línea).
    if (accion === 'crear-plantilla') {
      const yaEstado = await estadoPlantilla(linea_id);
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

    const estTpl = await estadoPlantilla(linea_id);
    const usarPlantilla = estTpl === 'aprobada';
    const mensaje = usarPlantilla ? previewPlantilla(boletas, last10) : textoRespaldo(boletas, last10);

    if (accion === 'previsualizar') {
      return res.status(200).json({
        status: 'ok', encontrado: true, nombre, total: boletas.length,
        modo: usarPlantilla ? 'plantilla' : 'texto',
        plantillaEstado: estTpl, puedeCrear: !estTpl, mensaje,
      });
    }

    if (accion === 'enviar') {
      let env;
      if (usarPlantilla) {
        env = await enviarPlantilla(telefono, {
          nombre: TPL_NOMBRE, idioma: TPL_IDIOMA,
          parametros: [variableBoletas(boletas)], botonUrlParam: last10,
        }, linea_id);
      } else {
        env = await enviarTexto(telefono, mensaje, linea_id);
      }
      if (!env || !env.ok) return res.status(200).json({ status: 'error', mensaje: (env && env.error) || 'No se pudo enviar.' });

      // Texto que se guarda en el historial (legible, con saltos de línea).
      const textoHistorial = usarPlantilla ? previewPlantilla(boletas, last10) : mensaje;
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
