import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  // 3. Recibimos los datos del abono desde el panel HTML
  const {
    numeroBoleta,
    valorAbono,
    metodoPago,
    referencia,
    contrasena,
    esPendiente
  } = req.body;

  // 4. SEGURIDAD: Validar la clave del asesor (Unificada a '1234')
  const claveMaestra = process.env.ADMIN_PASSWORD || '1234';
  if (contrasena !== claveMaestra) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  if (!numeroBoleta || !valorAbono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta o el valor del abono' });
  }

  const numeroLimpio = String(numeroBoleta).trim();
  const monto = Number(valorAbono);

  if (monto <= 0) {
    return res.status(400).json({ status: 'error', mensaje: 'El abono debe ser mayor a cero' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // PASO A: Consultar cómo está la boleta actualmente
    const { data: boletaData, error: boletaError } = await supabase
      .from('boletas')
      .select('saldo_restante, total_abonado, telefono_cliente')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) {
      return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    }

    if (!boletaData.telefono_cliente) {
      return res.status(400).json({ status: 'error', mensaje: 'Esta boleta está libre, primero debes registrar una venta' });
    }

    // PASO B: Registrar el movimiento en la tabla "abonos"
    const { error: insertError } = await supabase
      .from('abonos')
      .insert({
        numero_boleta: numeroLimpio,
        monto: monto,
        fecha_pago: new Date().toISOString(),
        referencia_transferencia: referencia || 'Sin Ref',
        nota: `Origen: ${metodoPago || 'Efectivo'}${esPendiente ? ' | PENDIENTE' : ''}`
      });

    if (insertError) throw insertError;

    // PASO C: Matemáticas - Calcular nuevos saldos
    const nuevoTotalAbonado = Number(boletaData.total_abonado) + monto;
    const nuevoSaldoRestante = Number(boletaData.saldo_restante) - monto;
    
    // Si ya no debe nada o debe a favor (negativo), la marcamos como "Pagada"
    const estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    // PASO D: Actualizar la boleta con los nuevos saldos
    const { error: updateError } = await supabase
      .from('boletas')
      .update({
        total_abonado: nuevoTotalAbonado,
        saldo_restante: nuevoSaldoRestante,
        estado: estadoNuevo
      })
      .eq('numero', numeroLimpio);

    if (updateError) throw updateError;

    // -------------------------------------------------------------------
    // NUEVO PASO E: Marcar la transferencia bancaria como ASIGNADA
    // -------------------------------------------------------------------
    if (referencia && referencia !== 'Sin Ref' && referencia !== 'efectivo') {
      await supabase
        .from('transferencias')
        .update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }) 
        .eq('referencia', referencia);
    }

    // Respuesta exitosa
    return res.status(200).json({ status: 'ok', mensaje: 'Abono registrado con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
