import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const event = req.body || {};

  try {
    // 1. Validar la firma del evento
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
    if (!eventsSecret) {
      console.error('Falta WOMPI_EVENTS_SECRET');
      return res.status(500).json({ error: 'Configuración faltante' });
    }

    const sig = event.signature;
    if (!sig || !Array.isArray(sig.properties) || !sig.checksum || !event.timestamp) {
      return res.status(400).json({ error: 'Evento sin firma válida' });
    }

    let valuesToSign = '';
    for (const prop of sig.properties) {
      const value = String(prop).split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), event.data);
      if (value === undefined || value === null) {
        return res.status(400).json({ error: `Propiedad ${prop} ausente en data` });
      }
      valuesToSign += value;
    }
    valuesToSign += event.timestamp;
    valuesToSign += eventsSecret;

    const expectedChecksum = crypto.createHash('sha256').update(valuesToSign).digest('hex');
    if (expectedChecksum !== sig.checksum) {
      console.warn('Firma inválida en webhook Wompi');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // 2. Solo procesar transaction.updated con status APPROVED
    if (event.event !== 'transaction.updated') {
      return res.status(200).json({ ok: true, ignored: 'no es transaction.updated' });
    }

    const tx = event.data && event.data.transaction;
    if (!tx) return res.status(400).json({ error: 'Sin transaction en data' });

    if (tx.status !== 'APPROVED') {
      return res.status(200).json({ ok: true, ignored: `status=${tx.status}` });
    }

    // 3. Parsear referencia: ABO-{last10}-{boletas con .}-{montoPesos}-{ts}
    const ref = String(tx.reference || '');
    const refParts = ref.split('-');
    if (refParts.length < 5 || refParts[0] !== 'ABO') {
      return res.status(200).json({ ok: true, ignored: 'reference no es de Abonar' });
    }
    const last10 = refParts[1];
    const boletasNumeros = refParts[2].split('.');
    const montoEsperadoPesos = Number(refParts[3]);

    if (Number(tx.amount_in_cents) !== montoEsperadoPesos * 100) {
      console.error(`Mismatch de monto en webhook: tx ${tx.amount_in_cents} vs ref ${montoEsperadoPesos * 100}`);
      return res.status(400).json({ error: 'Monto no coincide con la referencia' });
    }

    // 4. Idempotencia: si ya hay un abono con este transaction id, no aplicar otra vez
    const { data: yaProcesado } = await supabase
      .from('abonos')
      .select('id')
      .eq('referencia_transferencia', tx.id)
      .limit(1);
    if (yaProcesado && yaProcesado.length > 0) {
      return res.status(200).json({ ok: true, ignored: 'transaction ya procesada' });
    }

    // 5. Traer estado actual de las boletas (para asegurar que no excedemos saldo)
    const { data: boletasDB, error: errBol } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, total_abonado, telefono_cliente')
      .in('numero', boletasNumeros);

    if (errBol) throw errBol;
    if (!boletasDB || boletasDB.length === 0) {
      return res.status(404).json({ error: 'Boletas de la referencia no se encontraron' });
    }

    // Validar que las boletas pertenecen al mismo teléfono que generó el pago
    for (const b of boletasDB) {
      const ultimos10 = String(b.telefono_cliente || '').replace(/\D/g, '').slice(-10);
      if (ultimos10 !== last10) {
        console.error(`Boleta ${b.numero} no pertenece al teléfono ${last10}`);
        return res.status(400).json({ error: 'Boleta no pertenece al teléfono' });
      }
    }

    // 6. Distribuir el monto: pagar primero las boletas con menor saldo
    //    (maximiza la cantidad de boletas que quedan completamente pagadas)
    const ordenadas = [...boletasDB].sort((a, b) => Number(a.saldo_restante || 0) - Number(b.saldo_restante || 0));
    let restante = montoEsperadoPesos;
    const aplicados = [];

    for (const b of ordenadas) {
      if (restante <= 0) break;
      const saldo = Number(b.saldo_restante || 0);
      if (saldo <= 0) continue;
      const aPagar = Math.min(restante, saldo);

      const { error: errAbono } = await supabase
        .from('abonos')
        .insert({
          numero_boleta: b.numero,
          monto: aPagar,
          fecha_pago: new Date().toISOString(),
          referencia_transferencia: tx.id,
          metodo_pago: 'wompi',
          asesor: 'WOMPI',
          tipo: '4cifras',
          origen: 'wompi'
        });
      if (errAbono) throw errAbono;

      const { error: errUpd } = await supabase
        .from('boletas')
        .update({
          saldo_restante: saldo - aPagar,
          total_abonado: Number(b.total_abonado || 0) + aPagar
        })
        .eq('numero', b.numero);
      if (errUpd) throw errUpd;

      aplicados.push({ boleta: b.numero, monto: aPagar });
      restante -= aPagar;
    }

    return res.status(200).json({ ok: true, aplicados, restante });
  } catch (e) {
    console.error('Error en webhook Wompi:', e);
    return res.status(500).json({ error: e.message });
  }
}
