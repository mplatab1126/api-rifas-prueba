import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroBoleta, valorAbono, metodoPago, referencia, contrasena, esPendiente, idTransferencia, esPagoInteligente, esPremioRifa } = req.body;

  const ASESORES_INDEPENDIENTES = ['alejandra plata', 'joaquín', 'joaquin', 'lili', 'liliana', 'luisa', 'luisa rivera', 'nena'];
  const esIndependiente = (nombre) => nombre && ASESORES_INDEPENDIENTES.some(ind => nombre.toLowerCase().includes(ind));

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];

  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  if (!numeroBoleta || !valorAbono) return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta o el valor del abono' });

  const numeroLimpio = String(numeroBoleta).trim();
  let monto = Number(valorAbono);
  const esPremioRifaFlag = esPremioRifa || (referencia === 'premio_rifa_diaria');
  if (!esPremioRifaFlag && monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'El abono debe ser mayor a cero' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 🚨 NUEVA VALIDACIÓN ANTI-DUPLICADOS (Bloqueo por ID)
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

    let { data: boletaData, error: boletaError } = await supabase
      .from(tabla)
      .select('saldo_restante, total_abonado, telefono_cliente, asesor')
      .eq('numero', numeroLimpio)
      .single();

    // Si no se encontró, buscar en las otras tablas (por si el número llegó sin ceros)
    if ((boletaError || !boletaData) && numeroLimpio.length < 3) {
      const padded3 = numeroLimpio.padStart(3, '0');
      const { data: d3 } = await supabase.from('boletas_diarias_3cifras')
        .select('saldo_restante, total_abonado, telefono_cliente, asesor')
        .eq('numero', padded3).single();
      if (d3 && d3.telefono_cliente) {
        boletaData = d3; boletaError = null;
        tabla = 'boletas_diarias_3cifras'; esDiaria = true;
      }
    }
    if ((boletaError || !boletaData) && numeroLimpio.length < 2) {
      const padded2 = numeroLimpio.padStart(2, '0');
      const { data: d2 } = await supabase.from('boletas_diarias')
        .select('saldo_restante, total_abonado, telefono_cliente, asesor')
        .eq('numero', padded2).single();
      if (d2 && d2.telefono_cliente) {
        boletaData = d2; boletaError = null;
        tabla = 'boletas_diarias'; esDiaria = true;
      }
    }

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (!boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta está libre' });

    // 2. Calcular saldo base de fallback según el tipo de boleta
    const precioBase = numeroLimpio.length === 3 ? 5000 : (esDiaria ? 20000 : 200000);
    const saldoActual = boletaData.saldo_restante !== null && boletaData.saldo_restante !== undefined ? Number(boletaData.saldo_restante) : precioBase;
    const abonadoActual = boletaData.total_abonado !== null && boletaData.total_abonado !== undefined ? Number(boletaData.total_abonado) : 0;

    const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
    if (saldoActual <= 0) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 La boleta ${numeroLimpio} ya está PAGADA COMPLETAMENTE. No acepta más abonos.` });
    }

    // Premio Rifa: pagar automáticamente el 100% del saldo restante
    if (esPremioRifaFlag) {
      monto = saldoActual;
    }

    if (monto > saldoActual) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 El abono de ${fmt(monto)} supera el saldo restante de ${fmt(saldoActual)} de la boleta ${numeroLimpio}. Ajusta el valor para no exceder lo que debe el cliente.` });
    }

    const nuevoTotalAbonado = abonadoActual + monto;
    const nuevoSaldoRestante = saldoActual - monto;

    // Guard absoluto: nunca persistir un saldo negativo
    if (nuevoSaldoRestante < 0) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 Esta operación dejaría el saldo en negativo (${fmt(nuevoSaldoRestante)}). Acción bloqueada.` });
    }

    // 3. Validar grupo de asesores ANTES de tocar la base de datos
    const asesorBoleta = boletaData.asesor || '';
    if (asesorBoleta) {
        const grupoQuieneAbona = esIndependiente(nombreAsesor) ? 'independiente' : 'regular';
        const grupoBoleta = esIndependiente(asesorBoleta) ? 'independiente' : 'regular';
        if (grupoQuieneAbona !== grupoBoleta) {
            return res.status(400).json({
                status: 'error',
                mensaje: `🚫 Esta boleta pertenece al equipo "${grupoBoleta}". Tu equipo (${grupoQuieneAbona}) no puede registrar abonos en boletas de otro grupo.`
            });
        }
    }

    // Validación de cupo para premio rifa diaria
    if (esPremioRifa || referencia === 'premio_rifa_diaria') {
      if (numeroLimpio.length !== 4) {
        return res.status(400).json({ status: 'error', mensaje: '🚫 El modo Premio Rifa solo aplica para boletas del apartamento (4 cifras).' });
      }

      const { data: configRifa } = await supabase
        .from('config_rifa_diaria')
        .select('total_boletas_premio')
        .eq('tipo', '3cifras')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const limite = configRifa?.total_boletas_premio || 0;
      if (limite <= 0) {
        return res.status(400).json({ status: 'error', mensaje: '🚫 No hay boletas premio configuradas para la rifa actual. La gerencia debe configurar el total de boletas premio al iniciar la rifa.' });
      }

      const hoyCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
      const hoyStr = hoyCol.getFullYear() + '-' + String(hoyCol.getMonth()+1).padStart(2,'0') + '-' + String(hoyCol.getDate()).padStart(2,'0');

      const { count: usados } = await supabase
        .from('abonos')
        .select('id', { count: 'exact', head: true })
        .eq('referencia_transferencia', 'premio_rifa_diaria')
        .gte('fecha_pago', hoyStr + 'T00:00:00')
        .lte('fecha_pago', hoyStr + 'T23:59:59');

      if ((usados || 0) >= limite) {
        return res.status(400).json({ status: 'error', mensaje: `🚫 Ya se usaron las ${limite} boletas premio de esta rifa. No se pueden registrar más abonos como Premio Rifa.` });
      }
    }

    // Crear hora de Colombia
    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaPagoColombia = fechaCol.getFullYear() + "-" +
             String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" +
             String(fechaCol.getDate()).padStart(2, '0') + "T" +
             String(fechaCol.getHours()).padStart(2, '0') + ":" +
             String(fechaCol.getMinutes()).padStart(2, '0') + ":" +
             String(fechaCol.getSeconds()).padStart(2, '0');
    
    // 4. Insertar el Abono (solo llega aquí si pasó TODAS las validaciones)
    const tipoBoleta = tabla === 'boletas_diarias' ? '2cifras' : (tabla === 'boletas_diarias_3cifras' ? '3cifras' : '4cifras');

    const { error: insertError } = await supabase
      .from('abonos')
      .insert({
        numero_boleta: numeroLimpio,
        monto: monto,
        fecha_pago: fechaPagoColombia,
        referencia_transferencia: referencia || 'Sin Ref',
        metodo_pago: metodoPago || 'Efectivo',
        es_pendiente: !!esPendiente,
        asesor: nombreAsesor,
        tipo: tipoBoleta,
        origen: (esPagoInteligente || (idTransferencia && idTransferencia.trim() !== '')) ? 'transferencia_real' : 'manual'
      });
    if (insertError) throw insertError;
    
    let estadoNuevo = '';
    if (esDiaria) estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Reservado';
    else estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    // 5. ACTUALIZAR ESTADÍSTICAS DEL CLIENTE
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_grandes_compradas, boletas_diarias_compradas')
      .eq('telefono', boletaData.telefono_cliente)
      .single();

    if (clienteActual) {
        let totalComprado = (clienteActual.total_comprado || 0) + (esPremioRifaFlag ? 0 : monto);
        let diariasCompradas = clienteActual.boletas_diarias_compradas || 0;
        let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;

        if (saldoActual > 0 && nuevoSaldoRestante <= 0) {
            if (esDiaria) diariasCompradas += 1;
            else grandesCompradas += 1;
        }

        await supabase.from('clientes').update({
            total_comprado: totalComprado,
            boletas_diarias_compradas: diariasCompradas,
            boletas_grandes_compradas: grandesCompradas
        }).eq('telefono', boletaData.telefono_cliente);
    }

    // 6. Actualizar la boleta (el campo asesor nunca se modifica en abonos)
    let updatePayload = {
        total_abonado: nuevoTotalAbonado,
        saldo_restante: nuevoSaldoRestante,
        estado: estadoNuevo
    };

    const { error: updateError } = await supabase.from(tabla).update(updatePayload).eq('numero', numeroLimpio);
    if (updateError) throw updateError;

    // 7. Amarrar la referencia a la boleta (ASIGNACIÓN SEGURA POR ID)
    if (idTransferencia && idTransferencia.trim() !== '') {
      await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', idTransferencia);
    } else if (referencia && referencia !== 'Sin Ref' && referencia !== 'efectivo' && referencia !== 'efectivo_oficina' && referencia !== 'premio_rifa_diaria' && referencia !== '0') {
      const { data: transLibre } = await supabase
        .from('transferencias')
        .select('id')
        .eq('referencia', referencia)
        .eq('estado', 'LIBRE')
        .eq('monto', monto)
        .limit(1)
        .maybeSingle();

      if (transLibre) {
        await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', transLibre.id);
      }
    }

    // 8. Si es efectivo en oficina, registrar ingreso directo a caja
    if (referencia === 'efectivo_oficina') {
      const fechaHoyCaja = fechaPagoColombia.split('T')[0];
      await supabase.from('movimientos_caja').insert({
        fecha: fechaHoyCaja,
        tipo: 'ingreso',
        monto: monto,
        descripcion: `Efectivo en oficina - Boleta ${numeroLimpio} (${nombreAsesor})`,
        creado_por: nombreAsesor
      });
    }

    // GUARDAR EN LA BITÁCORA
    const { error: errorBitacora } = await supabase.from('registro_movimientos').insert({
        asesor: nombreAsesor,
        accion: 'Nuevo Abono',
        boleta: numeroLimpio,
        detalle: `Abonó $${monto} usando ${metodoPago}`
    });
    
    if (errorBitacora) throw new Error("Error en Bitácora: " + errorBitacora.message);
    
    return res.status(200).json({ status: 'ok', mensaje: 'Abono y estadísticas registrados con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
