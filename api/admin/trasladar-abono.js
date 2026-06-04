/**
 * Traslada abono de UNA boleta a OTRA boleta del MISMO cliente. Puede mover TODO el
 * abono o solo una PARTE (para dividir: ej. dejar $40.000 en una y pasar $20.000 a otra).
 *
 * Candado central (lo que pidió Mateo): ambas boletas deben pertenecer al teléfono del
 * cliente; NUNCA se mueve dinero hacia/desde la boleta de otro.
 *
 * Pasos:
 *  1. Valida que las dos boletas existan y sean del mismo cliente (su teléfono).
 *  2. Suma los abonos de la boleta origen y decide cuánto mover (todo o el monto pedido).
 *  3. Verifica que ese monto no exceda lo que falta en la boleta destino.
 *  4. Mueve los abonos: enteros hasta completar el monto; el último se PARTE si hace falta.
 *  5. Recalcula los saldos de AMBAS boletas desde sus abonos (la verdad).
 *  6. Reapunta cada transferencia del banco según en qué boleta(s) quedó.
 *  7. Deja constancia en la bitácora.
 *
 * Recibe (POST, JSON): { numeroOrigen, numeroDestino, telefono, contrasena, monto? }
 *   monto opcional: cuánto mover. Si no viene (o es >= al total), mueve TODO el abono.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroOrigen, numeroDestino, telefono, contrasena, monto } = req.body || {};
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

    // 3) Abonos de la boleta origen (todos los campos, por si hay que PARTIR uno)
    const { data: abonosOrigen, error: errA } = await supabase
      .from('abonos')
      .select('id, monto, fecha_pago, referencia_transferencia, metodo_pago, asesor, tipo, origen, id_transferencia')
      .eq('numero_boleta', origen)
      .order('monto', { ascending: true });
    if (errA) throw errA;
    if (!abonosOrigen || !abonosOrigen.length) {
      return res.status(400).json({ status: 'error', mensaje: `La boleta ${origen} no tiene abonos para trasladar.` });
    }
    const montoTotal = abonosOrigen.reduce((s, a) => s + Number(a.monto || 0), 0);

    // 2b) Cuánto mover: el pedido (parcial) o TODO si no viene / es mayor al total.
    let montoMover = montoTotal;
    if (monto != null && monto !== '') {
      montoMover = Math.round(Number(String(monto).replace(/[^\d.-]/g, '')));
      if (!(montoMover > 0)) return res.status(400).json({ status: 'error', mensaje: 'El monto a trasladar debe ser mayor a cero.' });
      if (montoMover > montoTotal) {
        return res.status(400).json({ status: 'error', mensaje: `La boleta ${origen} solo tiene ${fmt(montoTotal)} abonados; no puedes trasladar ${fmt(montoMover)}.` });
      }
    }

    // 4) No exceder lo que falta en la boleta destino
    const precioDestino = Number(bDestino.precio_total) || PRECIOS.RIFA_4_CIFRAS;
    const saldoDestino = precioDestino - Number(bDestino.total_abonado || 0);
    if (montoMover > saldoDestino) {
      return res.status(400).json({ status: 'error', mensaje: `Ese abono (${fmt(montoMover)}) supera lo que falta en la boleta ${destino} (${fmt(saldoDestino)}). Ajusta el monto.` });
    }

    // 5) Mover: abonos enteros hasta completar el monto; el último se PARTE si hace falta.
    let restante = montoMover;
    for (const ab of abonosOrigen) {
      if (restante <= 0) break;
      const m = Number(ab.monto || 0);
      if (m <= 0) continue;
      if (m <= restante + 0.001) {
        await supabase.from('abonos').update({ numero_boleta: destino }).eq('id', ab.id);
        restante -= m;
      } else {
        // Partir: deja (m - restante) en origen, crea (restante) en destino con los mismos datos.
        await supabase.from('abonos').update({ monto: m - restante }).eq('id', ab.id);
        await supabase.from('abonos').insert({
          numero_boleta: destino, monto: restante,
          fecha_pago: ab.fecha_pago, referencia_transferencia: ab.referencia_transferencia,
          metodo_pago: ab.metodo_pago, asesor: ab.asesor, tipo: ab.tipo, origen: ab.origen,
          id_transferencia: ab.id_transferencia,
        });
        restante = 0;
      }
    }

    // 6) Recalcular saldos de AMBAS boletas desde sus abonos (la verdad)
    const recalc = async (numero, precioTotal) => {
      const { data: ab } = await supabase.from('abonos').select('monto').eq('numero_boleta', numero);
      const abonado = (ab || []).reduce((s, a) => s + Number(a.monto || 0), 0);
      const precio = Number(precioTotal) || PRECIOS.RIFA_4_CIFRAS;
      const saldo = Math.max(0, precio - abonado);
      await supabase.from('boletas').update({
        total_abonado: abonado, saldo_restante: saldo, estado: saldo <= 0 ? 'Pagada' : 'Ocupada',
      }).eq('numero', numero);
    };
    await recalc(origen, bOrigen.precio_total);
    await recalc(destino, bDestino.precio_total);

    // 7) Reapuntar cada transferencia tocada según en qué boleta(s) quedó.
    const idsTrans = [...new Set(abonosOrigen.map(a => a.id_transferencia).filter(Boolean))];
    for (const idt of idsTrans) {
      const { data: ab } = await supabase.from('abonos').select('numero_boleta').eq('id_transferencia', idt);
      const bs = [...new Set((ab || []).map(a => a.numero_boleta))];
      const estado = bs.length > 1 ? `ASIGNADA REPARTIDA: ${bs.join(', ')}` : (bs[0] ? `ASIGNADA a boleta ${bs[0]}` : 'LIBRE');
      await supabase.from('transferencias').update({ estado }).eq('id', idt);
    }

    // 8) Bitácora
    await supabase.from('registro_movimientos').insert({
      asesor: nombreAsesor, accion: 'Traslado de abono', boleta: destino,
      detalle: `Trasladó ${fmt(montoMover)} de la boleta ${origen} a la ${destino} (mismo cliente, tel ...${last10})`,
    });

    return res.status(200).json({ status: 'ok', mensaje: 'Abono trasladado', monto: montoMover, total: montoTotal, origen, destino });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
