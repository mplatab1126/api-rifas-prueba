import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

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
    const numeroLimpio = String(numero_boleta).trim(); // <-- CORRECCIÓN: Creamos la variable que faltaba

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

    let tabla = 'boletas';
    let esDiaria = false;

    if (numeroLimpio.length === 2) {
      tabla = 'boletas_diarias';
      esDiaria = true; 
    } else if (numeroLimpio.length === 3) {
      tabla = 'boletas_diarias_3cifras';
      esDiaria = true; 
    }

    const { data: boleta } = await supabase.from(tabla).select('saldo_restante, total_abonado').eq('numero', numeroLimpio).single();
    
    if (boleta) {
      const nuevoAbonado = Number(boleta.total_abonado) - Number(monto);
      const nuevoSaldo = Number(boleta.saldo_restante) + Number(monto);
      let nuevoEstado = '';
      if (esDiaria) nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Reservado';
      else nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Ocupada';

      await supabase.from(tabla).update({ total_abonado: nuevoAbonado, saldo_restante: nuevoSaldo, estado: nuevoEstado }).eq('numero', numeroLimpio);
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
