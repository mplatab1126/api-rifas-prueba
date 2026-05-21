import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroBoleta, valorAbono, metodoPago, referencia, contrasena, esPendiente, idTransferencia, esPagoInteligente, permitirExceso, boletasRepartidas } = req.body;

  const ASESORES_INDEPENDIENTES = ['alejandra plata', 'joaquín', 'joaquin', 'lili', 'liliana', 'luisa', 'luisa rivera', 'nena'];
  const esIndependiente = (nombre) => nombre && ASESORES_INDEPENDIENTES.some(ind => nombre.toLowerCase().includes(ind));

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  if (!numeroBoleta || !valorAbono) return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta o el valor del abono' });

  const numeroLimpio = String(numeroBoleta).trim();
  const monto = Number(valorAbono);
  if (monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'El abono debe ser mayor a cero' });

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

    const { data: boletaData, error: boletaError } = await supabase
      .from('boletas')
      .select('saldo_restante, total_abonado, telefono_cliente, asesor')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (!boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta está libre' });

    // 2. Calcular saldo de fallback (si la boleta no tiene saldo_restante guardado)
    const saldoActual = boletaData.saldo_restante !== null && boletaData.saldo_restante !== undefined ? Number(boletaData.saldo_restante) : PRECIOS.RIFA_4_CIFRAS;
    const abonadoActual = boletaData.total_abonado !== null && boletaData.total_abonado !== undefined ? Number(boletaData.total_abonado) : 0;

    const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
    if (saldoActual <= 0) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 La boleta ${numeroLimpio} ya está PAGADA COMPLETAMENTE. No acepta más abonos.` });
    }

    if (monto > saldoActual && !permitirExceso) {
      return res.status(400).json({
        status: 'error',
        codigo: 'EXCESO_SALDO',
        mensaje: `🚫 El abono de ${fmt(monto)} supera el saldo restante de ${fmt(saldoActual)} de la boleta ${numeroLimpio}. Ajusta el valor para no exceder lo que debe el cliente.`,
        datos: { saldoRestante: saldoActual, montoAbono: monto, exceso: monto - saldoActual, numeroBoleta: numeroLimpio }
      });
    }

    const nuevoTotalAbonado = abonadoActual + monto;
    // Si el asesor autorizó exceso, el saldo queda en 0 (no negativo)
    const nuevoSaldoRestante = monto > saldoActual ? 0 : (saldoActual - monto);

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

    // Crear hora de Colombia
    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaPagoColombia = fechaCol.getFullYear() + "-" +
             String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" +
             String(fechaCol.getDate()).padStart(2, '0') + "T" +
             String(fechaCol.getHours()).padStart(2, '0') + ":" +
             String(fechaCol.getMinutes()).padStart(2, '0') + ":" +
             String(fechaCol.getSeconds()).padStart(2, '0');

    // 4. Insertar el Abono (solo llega aquí si pasó TODAS las validaciones)
    const idTransLimpio = (idTransferencia && idTransferencia.trim() !== '') ? idTransferencia.trim() : null;

    const { error: insertError } = await supabase
      .from('abonos')
      .insert({
        numero_boleta: numeroLimpio,
        monto: monto,
        fecha_pago: fechaPagoColombia,
        referencia_transferencia: referencia || 'Sin Ref',
        metodo_pago: metodoPago || 'Efectivo',
        asesor: nombreAsesor,
        tipo: '4cifras',
        origen: esPendiente ? 'pendiente' : (esPagoInteligente || idTransLimpio) ? 'transferencia_real' : 'manual',
        id_transferencia: idTransLimpio
      });
    if (insertError) throw insertError;

    const estadoNuevo = nuevoSaldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    // 5. ACTUALIZAR ESTADÍSTICAS DEL CLIENTE
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_grandes_compradas')
      .eq('telefono', boletaData.telefono_cliente)
      .single();

    if (clienteActual) {
        const totalComprado = (clienteActual.total_comprado || 0) + monto;
        let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;

        if (saldoActual > 0 && nuevoSaldoRestante <= 0) {
            grandesCompradas += 1;
        }

        await supabase.from('clientes').update({
            total_comprado: totalComprado,
            boletas_grandes_compradas: grandesCompradas
        }).eq('telefono', boletaData.telefono_cliente);
    }

    // 6. Actualizar la boleta (el campo asesor nunca se modifica en abonos)
    const updatePayload = {
        total_abonado: nuevoTotalAbonado,
        saldo_restante: nuevoSaldoRestante,
        estado: estadoNuevo
    };

    const { error: updateError } = await supabase.from('boletas').update(updatePayload).eq('numero', numeroLimpio);
    if (updateError) throw updateError;

    // 7. Amarrar la referencia a la boleta (ASIGNACIÓN SEGURA POR ID)
    // Si viene `boletasRepartidas`, la transferencia se reparte entre boletas de distintos clientes
    // y el estado deja constancia de todas las boletas involucradas.
    const estadoTransferencia = Array.isArray(boletasRepartidas) && boletasRepartidas.length > 1
      ? `ASIGNADA REPARTIDA: ${boletasRepartidas.map(b => String(b).trim()).filter(Boolean).join(', ')}`
      : `ASIGNADA a boleta ${numeroLimpio}`;
    if (idTransferencia && idTransferencia.trim() !== '') {
      await supabase.from('transferencias').update({ estado: estadoTransferencia }).eq('id', idTransferencia);
    } else if (referencia && referencia !== 'Sin Ref' && referencia !== 'efectivo' && referencia !== 'efectivo_oficina' && referencia !== '0') {
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
