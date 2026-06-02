/**
 * Enviar la boleta al cliente desde la bandeja (atajo del chat).
 *
 * Dado el teléfono del chat abierto: busca en la base las boletas asignadas a
 * ese número y arma un mensaje con cada boleta, su saldo y su enlace público
 * (la misma página /boleta/{numero} que el cliente ya conoce).
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, telefono }
 *   previsualizar → arma el mensaje y lo devuelve (NO envía nada)
 *   enviar        → lo envía por WhatsApp y lo deja en el historial del chat
 *
 * Empareja por los últimos 10 dígitos del teléfono (con o sin el 57).
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { enviarTexto } from '../lib/whatsapp.js';

const pesos = (v) => '$' + Number(v || 0).toLocaleString('es-CO');

// Estado de UNA boleta en una frase corta.
function estadoBoleta(b) {
  return Number(b.saldo_restante || 0) <= 0
    ? '✅ Pagada'
    : `Te falta abonar *${pesos(b.saldo_restante)}*`;
}

// Arma el texto que recibe el cliente. Es el "cierre feliz" de la compra: no
// saluda (ya se viene hablando con el cliente), celebra y manda número + enlace.
// Se adapta solo: si todo está pagado celebra "¡Quedaste participando!"; si falta
// abono usa un encabezado neutro.
function construirMensaje(boletas, last10) {
  const url = (n) => `https://www.losplata.com.co/boleta/${n}?telefono=${last10}`;
  const todasPagadas = boletas.every(b => Number(b.saldo_restante || 0) <= 0);
  const una = boletas.length === 1;
  const header = todasPagadas
    ? '🎉 ¡Quedaste participando!'
    : (una ? '🎟️ Aquí está tu boleta' : '🎟️ Aquí están tus boletas');
  const intro = una
    ? 'Esta es tu boleta para la rifa de *Los Plata*:'
    : 'Estas son tus boletas para la rifa de *Los Plata*:';

  let cuerpo;
  if (una) {
    const b = boletas[0];
    cuerpo = `🎟️ *Boleta ${b.numero}*  ·  ${estadoBoleta(b)}\n\nGuárdala bien. Puedes consultarla cuando quieras aquí 👇\n${url(b.numero)}`;
  } else {
    cuerpo = boletas.map(b => `🎟️ *Boleta ${b.numero}*  ·  ${estadoBoleta(b)}\n👉 ${url(b.numero)}`).join('\n\n')
      + '\n\nGuárdalas bien y consúltalas cuando quieras desde los enlaces.';
  }
  return `${header}\n\n${intro}\n\n${cuerpo}\n\n¡Te deseamos mucha suerte! 🍀`;
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
  if (!telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono.' });

  try {
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
    const mensaje = construirMensaje(boletas, last10);

    if (accion === 'previsualizar') {
      return res.status(200).json({ status: 'ok', encontrado: true, nombre, total: boletas.length, mensaje });
    }

    if (accion === 'enviar') {
      const env = await enviarTexto(telefono, mensaje, linea_id);
      if (!env || !env.ok) return res.status(200).json({ status: 'error', mensaje: (env && env.error) || 'No se pudo enviar.' });

      const conversacion_id = await asegurarConv(telefono, linea_id, nombreAsesor);
      const ts = new Date().toISOString();
      await supabaseAdmin.from('mensajes_whatsapp').insert({
        conversacion_id, telefono, linea_id: linea_id || null,
        direccion: 'saliente', tipo: 'text', texto: mensaje,
        wa_message_id: env.wa_message_id, estado_envio: 'enviado', timestamp_wa: ts, raw: env.raw,
      });
      let upd = supabaseAdmin.from('conversaciones_whatsapp')
        .update({ ultimo_mensaje: ('🎟️ Boleta(s) enviada(s)'), ultimo_at: ts, ultimo_entrante: false })
        .eq('telefono', telefono);
      upd = linea_id ? upd.eq('linea_id', linea_id) : upd.is('linea_id', null);
      await upd;

      return res.status(200).json({ status: 'ok', wa_message_id: env.wa_message_id });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
