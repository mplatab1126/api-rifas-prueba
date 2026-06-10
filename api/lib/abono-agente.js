/**
 * Verificar un comprobante contra los pagos REALES y, si hay coincidencia SÓLIDA, abonar.
 *
 * Es la MISMA lógica probada que usa Liliana al registrar un abono (buscar-pago →
 * /api/admin/abono amarrado a la transferencia real). Se extrajo aquí para que la
 * compartan el agente (`agente-responder.js`) y el relojito de reintentos
 * (`verificar-pagos-cron.js`).
 *
 * REGLAS DE DINERO (no cambian):
 *  - Solo abona si la coincidencia es SÓLIDA (referencia, celular en la referencia, o
 *    mismo minuto + Bancolombia). NUNCA abona si la única razón es "Misma hora".
 *  - El abono va por /api/admin/abono con idTransferencia → una transferencia solo se
 *    consume UNA vez (no se puede abonar dos veces, ni con reintentos).
 *
 * Devuelve { tipo, ... }:
 *   'abonado'       → { monto, numero }
 *   'no_encontrado' → { diagnostico }
 *   'misma_hora'    → {}          (dudoso: NO se abona; conviene reintentar)
 *   'sin_saldo'     → {}          (no hay boletas con saldo; quizá ya está pago)
 *   'demorado'      → {}          (H34: la verificación/abono superó el tope de tiempo.
 *                                  OJO: el servidor pudo haber terminado igual — NUNCA
 *                                  decirle al cliente que falló; reintentar/verificar)
 *   'retenido'      → { celular } (H32: la referencia del pago trae el celular de OTRO
 *                                  cliente registrado — posible comprobante prestado.
 *                                  NO abonar ni reintentar: lo revisa un humano)
 *   'error'         → { mensaje }
 */

import { supabaseAdmin } from './supabase.js';

const BASE_URL = 'https://www.losplata.com.co';

// Nombre del asesor DUEÑO de una línea (ej. "Liliana"). Los movimientos del agente y del
// relojito de reintentos se registran a SU nombre, no a nombre de gerencia.
export async function asesorDeLinea(lineaId) {
  try {
    const { data } = await supabaseAdmin.from('lineas_asesores').select('asesor').eq('phone_number_id', lineaId).limit(1).maybeSingle();
    if (data && data.asesor) return data.asesor;
    // H72: línea SIN fila en lineas_asesores → sus ventas/abonos caerían a nombre de
    // Liliana sin que nadie lo note. Rastro de error para que se vea en la cabina
    // (y las alertas H16 lo lleven al WhatsApp de Mateo) antes de que toque plata.
    try {
      await supabaseAdmin.from('agente_actividad').insert({
        linea_id: lineaId, telefono: '', tipo: 'error',
        resumen: 'La línea ' + lineaId + ' NO tiene asesor configurado en lineas_asesores: sus ventas/abonos están quedando a nombre de "Liliana" (respaldo). Agregar la fila con su asesor real.',
      });
    } catch (_) {}
    return 'Liliana';
  } catch (_) { return 'Liliana'; }
}

// Contraseña de gerencia (de ASESORES_SECRETO) para llamar la lógica de abono como un humano.
export function contrasenaGerencia() {
  try {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const entradas = Object.entries(asesores);
    const mateo = entradas.find(([, n]) => String(n).toLowerCase().trim() === 'mateo');
    if (mateo) return mateo[0];
    const ger = entradas.find(([, n]) => ['mateo', 'alejo plata'].includes(String(n).toLowerCase().trim()));
    return ger ? ger[0] : null;
  } catch (_) { return null; }
}

// H81: contraseña DEDICADA del agente. El agente NO debería viajar con la llave MAESTRA de
// gerencia en cada operación (si el runtime la filtra, entrega la cuenta de Mateo completa).
// Busca en ASESORES_SECRETO una clave a nombre del asesor DUEÑO de la línea (ej. "Liliana" —
// debe llamarse EXACTAMENTE así para que las validaciones de grupo de abono/liberar pasen).
// Mientras Mateo no agregue esa clave en Vercel, cae a la de gerencia (transición sin cortes).
export async function contrasenaAgente(lineaId) {
  try {
    const asesor = String(await asesorDeLinea(lineaId) || '').toLowerCase().trim();
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const propia = Object.entries(asesores).find(([, n]) => String(n).toLowerCase().trim() === asesor);
    if (propia) return propia[0];
  } catch (_) {}
  return contrasenaGerencia();
}

// Marca la FOTO del comprobante del cliente como "pago asignado a la boleta NNNN"
// (escribe raw.pago_asignado en ese mensaje). La bandeja muestra un chip verde encima
// de la foto, la lista de comprobantes la cuenta como asignada y el motor deja de
// re-adjuntarla a la IA (H30). Best-effort. Vivía en agente-responder.js; se movió aquí
// para que TAMBIÉN marque cuando abona el cron de reintentos (antes nunca marcaba).
export async function marcarComprobanteAsignado(convId, mediaId, boleta, monto) {
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

// H32: ¿la referencia trae un celular colombiano (3XXXXXXXXX, como número COMPLETO) que NO
// es el del chat pero SÍ es de OTRO cliente registrado (tiene boleta)? Devuelve ese celular,
// o null. Ajuste del verificador: exigir que el número sea de un cliente REAL evita falsos
// positivos con las referencias de Bancolombia (números de aprobación de 10 dígitos que
// suelen empezar por 3). Si el celular del PROPIO chat está en la referencia, es su pago.
// Fail-open: si la consulta falla, no se frena un abono legítimo (precedente del rate-limit).
async function celularDeOtroCliente(referencia, telefonoChat) {
  try {
    const nums = [...new Set(String(referencia || '').match(/(?<!\d)3\d{9}(?!\d)/g) || [])];
    if (!nums.length) return null;
    const last10 = String(telefonoChat || '').replace(/\D/g, '').slice(-10);
    if (nums.includes(last10)) return null;   // el celular de ESTE chat está en la referencia → identidad confirmada
    for (const num of nums) {
      const { data } = await supabaseAdmin.from('boletas')
        .select('numero').like('telefono_cliente', '%' + num).limit(1);
      if (data && data.length) return num;    // es el celular de OTRO cliente con boleta
    }
    return null;
  } catch (_) { return null; }
}

async function post(ruta, cuerpo) {
  try {
    const r = await fetch(BASE_URL + ruta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      // H34: tope GENEROSO (buscar-pago lee la imagen con IA y puede tardar 30-60s legítimos).
      // Si aún así se cuelga, mejor un resultado 'demorado' manejable que morir por maxDuration.
      signal: AbortSignal.timeout(120000),
    });
    return await r.json();
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { status: 'error', timeout: true, mensaje: 'la verificación tardó más de lo normal' };
    return { status: 'error', mensaje: e.message };
  }
}

export async function verificarYAbonar({ telefono, linea_id, conversacion_id, mediaId, numeroPedido, pwd, asesorRegistro, mediaBase64 }) {
  // El actor REAL del movimiento (el agente = dueño de la línea, ej. "Liliana") se resuelve
  // ANTES de buscar el pago, para que `puede_modificar` se evalúe con SU grupo (independiente)
  // y no con el de gerencia — si no, las boletas del agente salen como "de otro grupo" y un
  // pago que SÍ coincide termina en 'sin_saldo' (bug del 8-jun).
  const asesorReg = asesorRegistro || await asesorDeLinea(linea_id);
  // mediaBase64 ({ mime, base64 }) es OPCIONAL: el motor ya descargó el comprobante para la
  // IA y lo presta para no bajarlo de Meta otra vez (H44). El cron no lo tiene → buscar-pago
  // lo descarga como siempre.
  const v = await post('/api/whatsapp/buscar-pago', {
    media_id: mediaId, telefono, linea_id, contrasena: pwd,
    ...(asesorReg ? { asesorRegistro: asesorReg } : {}),
    ...(mediaBase64 && mediaBase64.base64 ? { media_base64: mediaBase64.base64, media_mime: mediaBase64.mime } : {}),
  });
  if (v.timeout) return { tipo: 'demorado' };
  if (v.status !== 'ok') return { tipo: 'error', mensaje: v.mensaje || 'no se pudo verificar el comprobante' };
  if (!v.sugerida_id) return { tipo: 'no_encontrado', diagnostico: v.diagnostico || '' };
  // Seguridad: "Misma hora" sola NO basta (dos clientes pueden pagar igual el mismo minuto).
  if (v.razon_sugerida === 'Misma hora') return { tipo: 'misma_hora' };

  const trans = (v.candidatas || []).find(c => c.id === v.sugerida_id);
  if (!trans) return { tipo: 'error', mensaje: 'no se pudo identificar el pago con seguridad' };

  // H32 — Candado anti "comprobante prestado": un pantallazo del pago de OTRO cliente
  // (se comparten en grupos de WhatsApp) coincide perfecto por referencia/hora, y abonaría
  // la plata del dueño real a la boleta de quien lo reenvía. Si la coincidencia salió SOLO
  // de los datos de la foto (referencia / misma hora+plataforma) y la referencia trae el
  // celular de OTRO cliente registrado (≠ el de este chat), NO se abona solo. La razón
  // "El celular del cliente está en la referencia" no entra aquí: esa SÍ prueba identidad.
  if (v.razon_sugerida === 'Coincide la referencia' || v.razon_sugerida === 'Misma hora y plataforma') {
    const celAjeno = await celularDeOtroCliente(trans.referencia, telefono);
    if (celAjeno) return { tipo: 'retenido', celular: celAjeno };
  }

  const conSaldo = (v.boletas || []).filter(b => b.puede_modificar && Number(b.saldo) > 0);
  if (!conSaldo.length) return { tipo: 'sin_saldo' };

  let destino = null;
  const pedido = String(numeroPedido || '').replace(/\D/g, '');
  if (pedido) destino = conSaldo.find(b => String(b.numero) === pedido.padStart(4, '0') || String(b.numero) === pedido);
  if (!destino) destino = conSaldo[0];

  // El abono se graba a nombre del agente (Liliana), el mismo actor real de arriba.
  const d = await post('/api/admin/abono', {
    numeroBoleta: String(destino.numero), valorAbono: trans.monto,
    metodoPago: trans.plataforma || 'Transferencia', referencia: trans.referencia || 'Sin Ref',
    idTransferencia: v.sugerida_id, contrasena: pwd,
    ...(asesorReg ? { asesorRegistro: asesorReg } : {}),
  });
  // Timeout del ABONO: es el caso ambiguo (el servidor pudo registrarlo y la respuesta no
  // llegó). NUNCA tratarlo como fallo: el llamador agenda verificación y el candado del
  // idTransferencia (una transferencia se consume UNA vez) impide el doble abono al reintentar.
  if (d.timeout) return { tipo: 'demorado' };
  if (d.status !== 'ok') return { tipo: 'error', mensaje: d.mensaje || 'no se pudo registrar el abono' };
  // Marca la foto del comprobante "✅ pago asignado" (chip en la bandeja + el motor deja de
  // re-adjuntarla a la IA). Aquí cubre a los DOS llamadores: el turno en vivo y el cron.
  await marcarComprobanteAsignado(conversacion_id, mediaId, destino.numero, trans.monto);
  return { tipo: 'abonado', monto: trans.monto, numero: destino.numero };
}
