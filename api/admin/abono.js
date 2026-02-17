import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroBoleta, valorAbono, metodoPago, referencia, contrasena, esPendiente } = req.body;

  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  const nombreAsesor = asesores[contrasena];

  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  if (!numeroBoleta || !valorAbono) return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta o el valor del abono' });

  const numeroLimpio = String(numeroBoleta).trim();
  const monto = Number(valorAbono);
  if (monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'El abono debe ser mayor a cero' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // --- MAGIA: DETECTA SI ES DE 2 O 4 CIFRAS ---
    const esDiaria = numeroLimpio.length === 2;
    const tabla = esDiaria ? 'boletas_diarias' : 'boletas';

    const { data: boletaData, error: boletaError } = await supabase
      .from(tabla)
      .select('saldo_restante, total_abonado, telefono_cliente')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (!boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta está libre' });

    const { error: insertError } = await supabase
      .from('abonos')
      .insert({
        numero_boleta: numeroLimpio,
        monto: monto,
        fecha_pago: new Date().toISOString(),
        referencia_transferencia: referencia || 'Sin Ref',
        nota: `Origen: ${metodoPago || 'Efectivo'}${esPendiente ? ' | PENDIENTE' : ''}`,
        asesor: nombreAsesor
      });

    if (insertError) throw insertError;

    const saldoActual = boletaData.saldo_restante !== null && boletaData.saldo_restante !== undefined ? Number(boletaData.saldo_restante) : (esDiaria ? 20000 : 200000);
    const abonadoActual = boletaData.total_abonado !== null && boletaData.total_abonado !== undefined ? Number(boletaData.total_abonado) : 0;

    const nuevoTotalAbonado = abonadoActual + monto;
    const nuevoSaldoRestante = saldoActual - monto;
    
    let estadoNuevo = '';
    if (esDiaria) {
        estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Reservado';
    } else {
        estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Ocupada';
    }

    let updatePayload = {
        total_abonado: nuevoTotalAbonado,
        saldo_restante: nuevoSaldoRestante,
        estado: estadoNuevo
    };
    if (!esDiaria) updatePayload.asesor = nombreAsesor;

    const { error: updateError } = await supabase.from(tabla).update(updatePayload).eq('numero', numeroLimpio);
    if (updateError) throw updateError;

    if (referencia && referencia !== 'Sin Ref' && referencia !== 'efectivo') {
      await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('referencia', referencia);
    }

    return res.status(200).json({ status: 'ok', mensaje: 'Abono registrado con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
