import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const ASESORES_INDEPENDIENTES = ['alejandra plata', 'joaquín', 'joaquin', 'lili', 'liliana', 'luisa', 'luisa rivera', 'nena'];
const esIndependiente = (nombre) => nombre && ASESORES_INDEPENDIENTES.some(ind => nombre.toLowerCase().includes(ind));

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { id, contrasena } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del abono' });

  try {
    const { data: abono, error: errAbono } = await supabase.from('abonos').select('*').eq('id', id).single();
    if (errAbono || !abono) throw new Error('Abono no encontrado');

    const { numero_boleta, monto, referencia_transferencia } = abono;
    const numeroLimpio = String(numero_boleta).trim();

    // Validar grupo: no puedes eliminar abonos de boletas de otro grupo
    const { data: boletaCheck } = await supabase.from('boletas').select('asesor').eq('numero', numeroLimpio).single();
    const asesorBoleta = boletaCheck?.asesor || '';
    if (asesorBoleta) {
      const grupoAsesor = esIndependiente(nombreAsesor) ? 'independiente' : 'regular';
      const grupoBoleta = esIndependiente(asesorBoleta) ? 'independiente' : 'regular';
      if (grupoAsesor !== grupoBoleta) {
        return res.status(400).json({ status: 'error', mensaje: `🚫 Esta boleta pertenece al equipo "${grupoBoleta}". Tu equipo (${grupoAsesor}) no puede eliminar abonos de esta boleta.` });
      }
    }

    const { error: errDelete } = await supabase.from('abonos').delete().eq('id', id);
    if (errDelete) throw errDelete;

    if (abono.id_transferencia) {
      await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('id', abono.id_transferencia);
    } else if (referencia_transferencia && referencia_transferencia !== 'Sin Ref' && referencia_transferencia !== 'efectivo' && referencia_transferencia !== 'efectivo_oficina') {
      const estadoAsignada = `ASIGNADA a boleta ${numeroLimpio}`;
      const { data: transAsignada } = await supabase
        .from('transferencias')
        .select('id')
        .eq('referencia', referencia_transferencia)
        .eq('estado', estadoAsignada)
        .limit(1)
        .maybeSingle();

      if (transAsignada) {
        await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('id', transAsignada.id);
      }
    }

    // Si era efectivo en oficina, eliminar el ingreso automático que se creó en caja
    if (referencia_transferencia === 'efectivo_oficina') {
      const descripcionCaja = `Efectivo en oficina - Boleta ${numeroLimpio} (${abono.asesor})`;
      await supabase.from('movimientos_caja').delete()
        .eq('tipo', 'ingreso')
        .eq('monto', monto)
        .eq('descripcion', descripcionCaja);
    }

    const { data: boleta } = await supabase.from('boletas').select('saldo_restante, total_abonado, telefono_cliente').eq('numero', numeroLimpio).single();

    if (boleta) {
      const nuevoAbonado = Number(boleta.total_abonado) - Number(monto);
      const nuevoSaldo = Number(boleta.saldo_restante) + Number(monto);
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
          // Los abonos historicos marcados como premio_rifa_diaria nunca sumaron al total_comprado;
          // tampoco restamos al eliminarlos (preserva integridad de registros viejos)
          const esPremioHistorico = referencia_transferencia === 'premio_rifa_diaria';
          const totalComprado = Math.max(0, (clienteActual.total_comprado || 0) - (esPremioHistorico ? 0 : monto));
          let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;

          // Si la boleta estaba pagada y ahora ya no, restar 1 al contador
          if (boleta.saldo_restante <= 0 && nuevoSaldo > 0) {
            grandesCompradas = Math.max(0, grandesCompradas - 1);
          }

          await supabase.from('clientes').update({
            total_comprado: totalComprado,
            boletas_grandes_compradas: grandesCompradas
          }).eq('telefono', boleta.telefono_cliente);
        }
      }
    }

    // GUARDAR EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({
        asesor: nombreAsesor,
        accion: 'Eliminar Abono',
        boleta: numeroLimpio,
        detalle: `Se eliminó un abono de $${monto}`
    });

    return res.status(200).json({ status: 'ok', mensaje: 'Abono eliminado y saldos ajustados.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
