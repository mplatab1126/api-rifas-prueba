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
 *   'error'         → { mensaje }
 */

import { supabaseAdmin } from './supabase.js';

const BASE_URL = 'https://www.losplata.com.co';

// Nombre del asesor DUEÑO de una línea (ej. "Liliana"). Los movimientos del agente y del
// relojito de reintentos se registran a SU nombre, no a nombre de gerencia.
export async function asesorDeLinea(lineaId) {
  try {
    const { data } = await supabaseAdmin.from('lineas_asesores').select('asesor').eq('phone_number_id', lineaId).limit(1).maybeSingle();
    return (data && data.asesor) ? data.asesor : 'Liliana';
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

async function post(ruta, cuerpo) {
  try {
    const r = await fetch(BASE_URL + ruta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    return await r.json();
  } catch (e) {
    return { status: 'error', mensaje: e.message };
  }
}

export async function verificarYAbonar({ telefono, linea_id, conversacion_id, mediaId, numeroPedido, pwd, asesorRegistro }) {
  // El actor REAL del movimiento (el agente = dueño de la línea, ej. "Liliana") se resuelve
  // ANTES de buscar el pago, para que `puede_modificar` se evalúe con SU grupo (independiente)
  // y no con el de gerencia — si no, las boletas del agente salen como "de otro grupo" y un
  // pago que SÍ coincide termina en 'sin_saldo' (bug del 8-jun).
  const asesorReg = asesorRegistro || await asesorDeLinea(linea_id);
  const v = await post('/api/whatsapp/buscar-pago', { media_id: mediaId, telefono, linea_id, contrasena: pwd, ...(asesorReg ? { asesorRegistro: asesorReg } : {}) });
  if (v.status !== 'ok') return { tipo: 'error', mensaje: v.mensaje || 'no se pudo verificar el comprobante' };
  if (!v.sugerida_id) return { tipo: 'no_encontrado', diagnostico: v.diagnostico || '' };
  // Seguridad: "Misma hora" sola NO basta (dos clientes pueden pagar igual el mismo minuto).
  if (v.razon_sugerida === 'Misma hora') return { tipo: 'misma_hora' };

  const trans = (v.candidatas || []).find(c => c.id === v.sugerida_id);
  if (!trans) return { tipo: 'error', mensaje: 'no se pudo identificar el pago con seguridad' };

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
  if (d.status !== 'ok') return { tipo: 'error', mensaje: d.mensaje || 'no se pudo registrar el abono' };
  return { tipo: 'abonado', monto: trans.monto, numero: destino.numero };
}
