import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { id, contrasena } = req.body; // Recibimos el ID único del abono
  // 4. SEGURIDAD: Validar la clave del asesor
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  }
  if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del abono' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 1. Buscamos el abono antes de borrarlo para saber cuánto dinero era y qué referencia tenía
    const { data: abono, error: errAbono } = await supabase.from('abonos').select('*').eq('id', id).single();
    if (errAbono || !abono) throw new Error('Abono no encontrado');

    const { numero_boleta, monto, referencia_transferencia } = abono;

    // 2. Eliminamos el abono de la base de datos
    const { error: errDelete } = await supabase.from('abonos').delete().eq('id', id);
    if (errDelete) throw errDelete;

    // 3. Liberamos la transferencia bancaria (le quitamos la palabra ASIGNADA)
    if (referencia_transferencia && referencia_transferencia !== 'Sin Ref' && referencia_transferencia !== 'efectivo') {
      await supabase.from('transferencias').update({ estado: 'LIBRE' }).eq('referencia', referencia_transferencia);
    }

    // 4. Re-calculamos la deuda de la boleta (le sumamos la deuda que acabamos de borrar)
    const { data: boleta } = await supabase.from('boletas').select('saldo_restante, total_abonado').eq('numero', numero_boleta).single();
    
    if (boleta) {
      const nuevoAbonado = Number(boleta.total_abonado) - Number(monto);
      const nuevoSaldo = Number(boleta.saldo_restante) + Number(monto);
      const nuevoEstado = nuevoSaldo <= 0 ? 'Pagada' : 'Ocupada';

      await supabase.from('boletas').update({
        total_abonado: nuevoAbonado,
        saldo_restante: nuevoSaldo,
        estado: nuevoEstado
      }).eq('numero', numero_boleta);
    }

    return res.status(200).json({ status: 'ok', mensaje: 'Abono eliminado y transferencia liberada.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
