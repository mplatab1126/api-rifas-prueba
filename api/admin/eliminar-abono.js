import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { grupoDeAsesor } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { id, contrasena } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del abono' });

  try {
    const { data: abono, error: errAbono } = await supabase.from('abonos').select('*').eq('id', id).single();
    if (errAbono || !abono) throw new Error('Abono no encontrado');

    const numeroLimpio = String(abono.numero_boleta).trim();
    const ref = abono.referencia_transferencia;

    // ── ¿La transferencia de este abono está REPARTIDA en varias boletas? ──
    // (un mismo pago dividido entre varias boletas). Si lo está, borrar UNA parte
    // sin borrar las demás dejaría la transferencia "libre" pero con plata aún
    // aplicada a otra boleta → descuadre. Por eso, al borrar una parte borramos
    // TODAS las partes del reparto y dejamos la transferencia LIBRE.
    let transfer = null;
    if (abono.id_transferencia) {
      const { data } = await supabase.from('transferencias').select('id, estado').eq('id', abono.id_transferencia).maybeSingle();
      transfer = data;
    } else if (ref && !['Sin Ref', 'efectivo', 'efectivo_oficina', '0'].includes(ref)) {
      const { data } = await supabase.from('transferencias').select('id, estado').eq('referencia', ref).ilike('estado', 'ASIGNADA REPARTIDA%');
      transfer = (data || []).find(t => boletasDeEstado(t.estado).includes(numeroLimpio)) || null;
    }
    const esReparto = transfer && /^ASIGNADA REPARTIDA/i.test(transfer.estado || '');

    if (esReparto) {
      const boletasReparto = boletasDeEstado(transfer.estado);

      // Validar grupo para cada boleta del reparto
      const grupoAsesor = await grupoDeAsesor(nombreAsesor);
      for (const numB of boletasReparto) {
        const { data: bk } = await supabase.from('boletas').select('asesor').eq('numero', numB).single();
        const asesorB = bk?.asesor || '';
        if (asesorB) {
          const grupoB = await grupoDeAsesor(asesorB);
          if (grupoB !== grupoAsesor) {
            return res.status(400).json({ status: 'error', mensaje: `🚫 La boleta ${numB} pertenece al equipo "${grupoB}". Tu equipo (${grupoAsesor}) no puede eliminar este pago repartido.` });
          }
        }
      }

      // Todos los abonos del reparto: esas boletas + la misma referencia
      const { data: partes } = await supabase.from('abonos').select('*')
        .in('numero_boleta', boletasReparto)
        .eq('referencia_transferencia', ref);

      for (const parte of (partes || [])) {
        await revertirAbono(parte, nombreAsesor);
      }

      // La transferencia vuelve a quedar LIBRE (entera)
      await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('id', transfer.id);

      return res.status(200).json({
        status: 'ok',
        mensaje: `Se eliminaron los ${(partes || []).length} abonos del pago repartido y la transferencia quedó libre.`,
      });
    }

    // ── Borrado normal (no repartido) ──
    // Validar grupo: no puedes eliminar abonos de boletas de otro grupo
    const { data: boletaCheck } = await supabase.from('boletas').select('asesor').eq('numero', numeroLimpio).single();
    const asesorBoleta = boletaCheck?.asesor || '';
    if (asesorBoleta) {
      const grupoAsesor = await grupoDeAsesor(nombreAsesor);
      const grupoBoleta = await grupoDeAsesor(asesorBoleta);
      if (grupoAsesor !== grupoBoleta) {
        return res.status(400).json({ status: 'error', mensaje: `🚫 Esta boleta pertenece al equipo "${grupoBoleta}". Tu equipo (${grupoAsesor}) no puede eliminar abonos de esta boleta.` });
      }
    }

    await revertirAbono(abono, nombreAsesor);

    // Liberar la transferencia ligada (igual que antes)
    if (abono.id_transferencia) {
      await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('id', abono.id_transferencia);
    } else if (ref && ref !== 'Sin Ref' && ref !== 'efectivo' && ref !== 'efectivo_oficina') {
      const estadoAsignada = `ASIGNADA a boleta ${numeroLimpio}`;
      const { data: transAsignada } = await supabase
        .from('transferencias')
        .select('id')
        .eq('referencia', ref)
        .eq('estado', estadoAsignada)
        .limit(1)
        .maybeSingle();
      if (transAsignada) {
        await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('id', transAsignada.id);
      }
    }

    return res.status(200).json({ status: 'ok', mensaje: 'Abono eliminado y saldos ajustados.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}

// "ASIGNADA REPARTIDA: 6287, 7150" -> ['6287', '7150']
function boletasDeEstado(estado) {
  const m = String(estado || '').match(/REPARTIDA:\s*(.+)/i);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

// Borra un abono y revierte sus efectos: saldo de la boleta, estadísticas del
// cliente, caja (si era efectivo en oficina) y bitácora. NO toca la
// transferencia — eso lo maneja el handler una sola vez.
async function revertirAbono(abono, nombreAsesor) {
  const numeroLimpio = String(abono.numero_boleta).trim();
  const monto = Number(abono.monto);
  const ref = abono.referencia_transferencia;

  await supabase.from('abonos').delete().eq('id', abono.id);

  // Si era efectivo en oficina, eliminar el ingreso automático que se creó en caja
  if (ref === 'efectivo_oficina') {
    const descripcionCaja = `Efectivo en oficina - Boleta ${numeroLimpio} (${abono.asesor})`;
    await supabase.from('movimientos_caja').delete()
      .eq('tipo', 'ingreso')
      .eq('monto', monto)
      .eq('descripcion', descripcionCaja);
  }

  const { data: boleta } = await supabase
    .from('boletas')
    .select('saldo_restante, total_abonado, telefono_cliente')
    .eq('numero', numeroLimpio)
    .single();

  if (boleta) {
    const nuevoAbonado = Number(boleta.total_abonado) - monto;
    const nuevoSaldo = Number(boleta.saldo_restante) + monto;
    const nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Ocupada';

    await supabase.from('boletas').update({ total_abonado: nuevoAbonado, saldo_restante: nuevoSaldo, estado: nuevoEstado }).eq('numero', numeroLimpio);

    // AJUSTAR ESTADÍSTICAS DEL CLIENTE
    if (boleta.telefono_cliente) {
      const { data: clienteActual } = await supabase
        .from('clientes')
        .select('total_comprado, boletas_grandes_compradas')
        .eq('telefono', boleta.telefono_cliente)
        .single();

      if (clienteActual) {
        const esPremioHistorico = ref === 'premio_rifa_diaria';
        const totalComprado = Math.max(0, (clienteActual.total_comprado || 0) - (esPremioHistorico ? 0 : monto));
        let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;
        if (boleta.saldo_restante <= 0 && nuevoSaldo > 0) {
          grandesCompradas = Math.max(0, grandesCompradas - 1);
        }
        await supabase.from('clientes').update({
          total_comprado: totalComprado,
          boletas_grandes_compradas: grandesCompradas,
        }).eq('telefono', boleta.telefono_cliente);
      }
    }
  }

  // GUARDAR EN LA BITÁCORA
  await supabase.from('registro_movimientos').insert({
    asesor: nombreAsesor,
    accion: 'Eliminar Abono',
    boleta: numeroLimpio,
    detalle: `Se eliminó un abono de $${monto}`,
  });
}
