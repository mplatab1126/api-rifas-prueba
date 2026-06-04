/**
 * Traslada el/los abono(s) de UNA boleta a OTRA boleta del MISMO cliente.
 *
 * Candado central (lo que pidió Mateo): ambas boletas deben pertenecer al
 * teléfono del cliente; NUNCA se mueve dinero hacia/desde la boleta de otro.
 *
 * Pasos:
 *  1. Valida que las dos boletas existan y sean del mismo cliente (su teléfono).
 *  2. Suma los abonos de la boleta origen.
 *  3. Verifica que ese monto no exceda lo que falta en la boleta destino.
 *  4. Reasigna los abonos (cambia su numero_boleta) de origen a destino.
 *  5. Recalcula los saldos de AMBAS boletas desde sus abonos (la verdad).
 *  6. Reapunta las transferencias del banco a la boleta destino.
 *  7. Deja constancia en la bitácora.
 *
 * Recibe (POST, JSON): { numeroOrigen, numeroDestino, telefono, contrasena }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroOrigen, numeroDestino, telefono, contrasena } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });

  const origen = String(numeroOrigen || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const destino = String(numeroDestino || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  if (!/^\d{4}$/.test(origen) || !/^\d{4}$/.test(destino)) {
    return res.status(400).json({ status: 'error', mensaje: 'Números de boleta inválidos.' });
  }
  if (origen === destino) return res.status(400).json({ status: 'error', mensaje: 'La boleta de origen y destino son la misma.' });

  const last10 = String(telefono || '').replace(/\D/g, '').slice(-10);
  if (!last10) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente.' });

  try {
    // 1) Ambas boletas
    const { data: boletas, error: errB } = await supabase
      .from('boletas')
      .select('numero, telefono_cliente, precio_total, total_abonado')
      .in('numero', [origen, destino]);
    if (errB) throw errB;
    const bOrigen = (boletas || []).find(b => b.numero === origen);
    const bDestino = (boletas || []).find(b => b.numero === destino);
    if (!bOrigen || !bDestino) return res.status(404).json({ status: 'error', mensaje: 'Una de las boletas no existe.' });

    // 2) 🔒 CANDADO: ambas deben ser del MISMO cliente. Nunca de otro.
    const esDelCliente = (b) => b.telefono_cliente && String(b.telefono_cliente).replace(/\D/g, '').endsWith(last10);
    if (!esDelCliente(bOrigen) || !esDelCliente(bDestino)) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo se puede trasladar entre boletas del mismo cliente. Una de las dos no está a su nombre.' });
    }

    // 3) Abonos de la boleta origen
    const { data: abonosOrigen, error: errA } = await supabase
      .from('abonos').select('id, monto, id_transferencia').eq('numero_boleta', origen);
    if (errA) throw errA;
    if (!abonosOrigen || !abonosOrigen.length) {
      return res.status(400).json({ status: 'error', mensaje: `La boleta ${origen} no tiene abonos para trasladar.` });
    }
    const montoTotal = abonosOrigen.reduce((s, a) => s + Number(a.monto || 0), 0);

    // 4) No exceder lo que falta en la boleta destino
    const precioDestino = Number(bDestino.precio_total) || PRECIOS.RIFA_4_CIFRAS;
    const saldoDestino = precioDestino - Number(bDestino.total_abonado || 0);
    if (montoTotal > saldoDestino) {
      return res.status(400).json({ status: 'error', mensaje: `El abono (${fmt(montoTotal)}) supera lo que falta en la boleta ${destino} (${fmt(saldoDestino)}). No se puede trasladar sin exceder.` });
    }

    // 5) Mover los abonos a la boleta destino
    const { error: errMove } = await supabase.from('abonos').update({ numero_boleta: destino }).eq('numero_boleta', origen);
    if (errMove) throw errMove;

    // 6) Recalcular saldos de AMBAS boletas desde sus abonos (la verdad)
    const recalc = async (numero, precioTotal) => {
      const { data: ab } = await supabase.from('abonos').select('monto').eq('numero_boleta', numero);
      const abonado = (ab || []).reduce((s, a) => s + Number(a.monto || 0), 0);
      const precio = Number(precioTotal) || PRECIOS.RIFA_4_CIFRAS;
      const saldo = Math.max(0, precio - abonado);
      await supabase.from('boletas').update({
        total_abonado: abonado,
        saldo_restante: saldo,
        estado: saldo <= 0 ? 'Pagada' : 'Ocupada',
      }).eq('numero', numero);
    };
    await recalc(origen, bOrigen.precio_total);
    await recalc(destino, bDestino.precio_total);

    // 7) Reapuntar las transferencias del banco a la boleta destino
    const idsTrans = [...new Set(abonosOrigen.map(a => a.id_transferencia).filter(Boolean))];
    for (const idt of idsTrans) {
      await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${destino}` }).eq('id', idt);
    }

    // 8) Bitácora
    await supabase.from('registro_movimientos').insert({
      asesor: nombreAsesor,
      accion: 'Traslado de abono',
      boleta: destino,
      detalle: `Trasladó ${fmt(montoTotal)} de la boleta ${origen} a la ${destino} (mismo cliente, tel ...${last10})`,
    });

    return res.status(200).json({ status: 'ok', mensaje: 'Abono trasladado', monto: montoTotal, origen, destino });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
