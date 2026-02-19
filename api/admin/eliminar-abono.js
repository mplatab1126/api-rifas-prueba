import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id, contrasena } = req.body; 
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'AYX':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del abono' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const { data: abono, error: errAbono } = await supabase.from('abonos').select('*').eq('id', id).single();
    if (errAbono || !abono) throw new Error('Abono no encontrado');

    const { numero_boleta, monto, referencia_transferencia } = abono;
    const { error: errDelete } = await supabase.from('abonos').delete().eq('id', id);
    if (errDelete) throw errDelete;

    if (referencia_transferencia && referencia_transferencia !== 'Sin Ref' && referencia_transferencia !== 'efectivo') {
      await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('referencia', referencia_transferencia);
    }

    const esDiaria = numero_boleta.length === 2;
    const tabla = esDiaria ? 'boletas_diarias' : 'boletas';

    const { data: boleta } = await supabase.from(tabla).select('saldo_restante, total_abonado').eq('numero', numero_boleta).single();
    
    if (boleta) {
      const nuevoAbonado = Number(boleta.total_abonado) - Number(monto);
      const nuevoSaldo = Number(boleta.saldo_restante) + Number(monto);
      let nuevoEstado = '';
      if (esDiaria) nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Reservado';
      else nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Ocupada';

      await supabase.from(tabla).update({ total_abonado: nuevoAbonado, saldo_restante: nuevoSaldo, estado: nuevoEstado }).eq('numero', numero_boleta);
    }

  // GUARDAR EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({
        asesor: nombreAsesor,
        accion: 'Eliminar Abono',
        boleta: numero_boleta,
        detalle: `Se eliminó un abono de $${monto}`
    });
    
    return res.status(200).json({ status: 'ok', mensaje: 'Abono eliminado y saldos ajustados.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
