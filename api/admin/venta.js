import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const {
    numeroBoleta, nombre, apellido, ciudad, telefono,
    primerAbono, referenciaAbono, metodoPago, referencia,
    contrasena, esPendiente, idTransferencia, esPagoInteligente
  } = req.body;

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!numeroBoleta || !telefono) return res.status(400).json({ status: 'error', mensaje: 'Faltan datos' });

  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);
  const numeroLimpio = String(numeroBoleta).trim();
  const abonoNum = Number(primerAbono) || 0;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 🚨 1. NUEVA VALIDACIÓN ANTI-DUPLICADOS (Bloqueo por ID)
    if (idTransferencia && idTransferencia.trim() !== '') {
      const { data: dbTrans, error: errTrans } = await supabase
        .from('transferencias')
        .select('estado')
        .eq('id', idTransferencia)
        .single();

      if (errTrans || !dbTrans) return res.status(400).json({ status: 'error', mensaje: 'No se encontró la transferencia en el banco.' });
      if (dbTrans.estado !== 'LIBRE') return res.status(400).json({ status: 'error', mensaje: `🛑 Esta transferencia ya está asignada (${dbTrans.estado}). Otro asesor pudo haberla usado.` });
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

    const { data: boletaData, error: boletaError } = await supabase
      .from(tabla)
      .select(esDiaria ? 'numero, telefono_cliente' : 'numero, precio_total, telefono_cliente')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta ya fue vendida' });

    // 2. Traer el historial actual del cliente (si existe)
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_grandes_compradas, boletas_diarias_compradas')
      .eq('telefono', telefonoLimpio)
      .single();

    let totalComprado = (clienteActual?.total_comprado || 0) + abonoNum;
    let diariasCompradas = clienteActual?.boletas_diarias_compradas || 0;
    let grandesCompradas = clienteActual?.boletas_grandes_compradas || 0;

    const precioTotal = numeroLimpio.length === 3 ? 5000 : (esDiaria ? 20000 : (Number(boletaData.precio_total) || 200000));

    const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
    if (abonoNum > precioTotal) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 El abono de ${fmt(abonoNum)} supera el precio total de la boleta ${numeroLimpio} (${fmt(precioTotal)}). Ajusta el valor.` });
    }

    const saldoRestante = precioTotal - abonoNum;

    // Guard absoluto: nunca persistir un saldo negativo
    if (saldoRestante < 0) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 Esta operación dejaría el saldo en negativo (${fmt(saldoRestante)}). Acción bloqueada.` });
    }

    // 3. Si con este abono inicial la boleta queda en cero, le sumamos +1 a su historial de boletas pagadas
    if (saldoRestante <= 0) {
        if (esDiaria) diariasCompradas += 1;
        else grandesCompradas += 1;
    }

    // 4. Guardar/Actualizar el cliente con sus nuevos números
    const { error: clienteError } = await supabase
      .from('clientes')
      .upsert({
        telefono: telefonoLimpio,
        nombre: nombre || 'Sin Nombre',
        apellido: apellido || '',
        ciudad: ciudad || '',
        total_comprado: totalComprado,
        boletas_diarias_compradas: diariasCompradas,
        boletas_grandes_compradas: grandesCompradas
      }, { onConflict: 'telefono' });

    if (clienteError) throw clienteError;

    // 5. Registrar el abono
    const tipoBoleta = tabla === 'boletas_diarias' ? '2cifras' : (tabla === 'boletas_diarias_3cifras' ? '3cifras' : '4cifras');

    if (abonoNum > 0) {
      const { error: abonoError } = await supabase.from('abonos').insert({
          numero_boleta: numeroLimpio,
          monto: abonoNum,
          fecha_pago: new Date().toISOString(),
          referencia_transferencia: referenciaAbono || 'Sin Ref',
          metodo_pago: metodoPago || 'Efectivo',
          es_pendiente: !!esPendiente,
          asesor: nombreAsesor,
          tipo: tipoBoleta,
          origen: (esPagoInteligente || (idTransferencia && idTransferencia.trim() !== '')) ? 'transferencia_real' : 'manual'
      });

      // ASIGNACIÓN SEGURA AL ID DE LA BASE DE DATOS
      if (idTransferencia && idTransferencia.trim() !== '') {
        await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', idTransferencia);
      } else if (referenciaAbono && referenciaAbono !== 'Sin Ref' && referenciaAbono !== 'efectivo' && referenciaAbono !== '0') {
        const { data: transLibre } = await supabase
          .from('transferencias')
          .select('id')
          .eq('referencia', referenciaAbono)
          .eq('estado', 'LIBRE')
          .eq('monto', abonoNum)
          .limit(1)
          .maybeSingle();

        if (transLibre) {
          await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', transLibre.id);
        }
      }
    }

    // 6. Actualizar el estado de la boleta
    const estadoNuevo = saldoRestante <= 0 ? 'Pagada' : (esDiaria ? 'Reservado' : 'Ocupada');

    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaVentaColombia = fechaCol.getFullYear() + "-" + 
             String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" + 
             String(fechaCol.getDate()).padStart(2, '0') + "T" + 
             String(fechaCol.getHours()).padStart(2, '0') + ":" + 
             String(fechaCol.getMinutes()).padStart(2, '0') + ":" + 
             String(fechaCol.getSeconds()).padStart(2, '0');

    let updatePayload = {
        telefono_cliente: telefonoLimpio,
        estado: estadoNuevo,
        total_abonado: abonoNum,
        saldo_restante: saldoRestante
    };

    updatePayload.asesor = nombreAsesor;
    if (!esDiaria) {
        updatePayload.fecha_venta = fechaVentaColombia;
    }

    const { error: updateError } = await supabase.from(tabla).update(updatePayload).eq('numero', numeroLimpio);
    if (updateError) throw updateError;

    // GUARDAR EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({
        asesor: nombreAsesor,
        accion: 'Nueva Venta',
        boleta: numeroLimpio,
        detalle: `Venta separada por ${telefonoLimpio} con abono de $${abonoNum}`
    });
    
    return res.status(200).json({ status: 'ok', mensaje: 'Venta y estadísticas registradas con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
