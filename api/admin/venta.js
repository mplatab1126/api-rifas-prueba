import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';
import { limpiarTelefono, esTelefonoValido } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const {
    numeroBoleta, nombre, apellido, ciudad, telefono,
    primerAbono, referenciaAbono, metodoPago, referencia,
    contrasena, esPendiente, idTransferencia, esPagoInteligente,
    esColombia, permitirExceso,
    documento_tipo, documento_numero
  } = req.body;

  // Documento opcional — solo se persiste si viene con valor (no sobrescribe lo ya guardado)
  const docTipoLimpio = documento_tipo ? String(documento_tipo).trim().toUpperCase() : null;
  const docNumeroLimpio = documento_numero ? String(documento_numero).trim() : null;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!numeroBoleta || !telefono) return res.status(400).json({ status: 'error', mensaje: 'Faltan datos' });
  // La tabla clientes exige que nombre, apellido y ciudad no estén vacíos.
  if (!String(nombre || '').trim())   return res.status(400).json({ status: 'error', mensaje: '🚫 Falta el nombre del cliente.' });
  if (!String(apellido || '').trim()) return res.status(400).json({ status: 'error', mensaje: '🚫 Falta el apellido del cliente.' });
  if (!String(ciudad || '').trim())   return res.status(400).json({ status: 'error', mensaje: '🚫 Falta la ciudad del cliente.' });

  // Si esColombia no viene en el body (compatibilidad con peticiones viejas), asumir true.
  const esColombiaFlag = esColombia !== false;
  let telefonoLimpio;
  if (esColombiaFlag) {
    telefonoLimpio = limpiarTelefono(telefono);
    if (!esTelefonoValido(telefonoLimpio)) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 El teléfono "${telefono}" no es válido. Revisa que sea un número celular colombiano correcto (10 dígitos empezando con 3, sin el 57 adelante).` });
    }
  } else {
    telefonoLimpio = String(telefono).replace(/\D/g, '');
    if (telefonoLimpio.length < 7 || telefonoLimpio.length > 15) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 El teléfono extranjero "${telefono}" no es válido. Debe tener entre 7 y 15 dígitos incluyendo el código del país.` });
    }
  }
  const numeroLimpio = String(numeroBoleta).trim();
  const abonoNum = Number(primerAbono) || 0;

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

    const { data: boletaData, error: boletaError } = await supabase
      .from('boletas')
      .select('numero, precio_total, telefono_cliente')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta ya fue vendida' });

    // 2. Traer el historial actual del cliente (si existe)
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_grandes_compradas')
      .eq('telefono', telefonoLimpio)
      .single();

    let grandesCompradas = clienteActual?.boletas_grandes_compradas || 0;

    const precioTotal = Number(boletaData.precio_total) || PRECIOS.RIFA_4_CIFRAS;
    const totalComprado = (clienteActual?.total_comprado || 0) + abonoNum;

    const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
    if (abonoNum > precioTotal && !permitirExceso) {
      return res.status(400).json({
        status: 'error',
        codigo: 'EXCESO_SALDO',
        mensaje: `🚫 El abono de ${fmt(abonoNum)} supera el precio total de la boleta ${numeroLimpio} (${fmt(precioTotal)}). Ajusta el valor.`,
        datos: { saldoRestante: precioTotal, montoAbono: abonoNum, exceso: abonoNum - precioTotal, numeroBoleta: numeroLimpio }
      });
    }

    // Si el asesor autorizó exceso, el saldo queda en 0 (no negativo)
    const saldoRestante = abonoNum > precioTotal ? 0 : (precioTotal - abonoNum);

    // Guard absoluto: nunca persistir un saldo negativo
    if (saldoRestante < 0) {
      return res.status(400).json({ status: 'error', mensaje: `🚫 Esta operación dejaría el saldo en negativo (${fmt(saldoRestante)}). Acción bloqueada.` });
    }

    // 3. Si con este abono inicial la boleta queda en cero, le sumamos +1 a su historial de boletas pagadas
    if (saldoRestante <= 0) {
      grandesCompradas += 1;
    }

    // 4. Guardar/Actualizar el cliente con sus nuevos números
    const clientePayload = {
      telefono: telefonoLimpio,
      nombre: nombre || 'Sin Nombre',
      apellido: apellido || '',
      ciudad: ciudad || '',
      total_comprado: totalComprado,
      boletas_grandes_compradas: grandesCompradas
    };
    if (docTipoLimpio) clientePayload.documento_tipo = docTipoLimpio;
    if (docNumeroLimpio) clientePayload.documento_numero = docNumeroLimpio;

    const { error: clienteError } = await supabase
      .from('clientes')
      .upsert(clientePayload, { onConflict: 'telefono' });

    if (clienteError) throw clienteError;

    // 5. Registrar el abono
    const idTransLimpio = (idTransferencia && idTransferencia.trim() !== '') ? idTransferencia.trim() : null;

    if (abonoNum > 0) {
      const { error: abonoError } = await supabase.from('abonos').insert({
          numero_boleta: numeroLimpio,
          monto: abonoNum,
          fecha_pago: new Date().toISOString(),
          referencia_transferencia: referenciaAbono || 'Sin Ref',
          metodo_pago: metodoPago || 'Efectivo',
          asesor: nombreAsesor,
          tipo: '4cifras',
          origen: esPendiente ? 'pendiente' : (esPagoInteligente || idTransLimpio) ? 'transferencia_real' : 'manual',
          id_transferencia: idTransLimpio
      });

      // ASIGNACIÓN SEGURA AL ID DE LA BASE DE DATOS
      if (idTransferencia && idTransferencia.trim() !== '') {
        await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', idTransferencia);
      } else if (referenciaAbono && referenciaAbono !== 'Sin Ref' && referenciaAbono !== 'efectivo' && referenciaAbono !== 'efectivo_oficina' && referenciaAbono !== '0') {
        // ⚠️ Solo asignamos automáticamente si hay UNA SOLA transferencia LIBRE que coincida.
        // Si hay varias (caso típico de los pagos por llave Bre-B, que comparten la misma
        // referencia), NO asignamos ninguna al azar: la dejamos LIBRE para que el asesor
        // seleccione la correcta a mano. Así evitamos asignar el pago a la boleta equivocada.
        const { data: libres } = await supabase
          .from('transferencias')
          .select('id')
          .eq('referencia', referenciaAbono)
          .eq('estado', 'LIBRE')
          .eq('monto', abonoNum);

        if (libres && libres.length === 1) {
          await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('id', libres[0].id);
        }
      }
    }

    // 6. Actualizar el estado de la boleta
    const estadoNuevo = saldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaVentaColombia = fechaCol.getFullYear() + "-" +
             String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" +
             String(fechaCol.getDate()).padStart(2, '0') + "T" +
             String(fechaCol.getHours()).padStart(2, '0') + ":" +
             String(fechaCol.getMinutes()).padStart(2, '0') + ":" +
             String(fechaCol.getSeconds()).padStart(2, '0');

    const updatePayload = {
        telefono_cliente: telefonoLimpio,
        estado: estadoNuevo,
        total_abonado: abonoNum,
        saldo_restante: saldoRestante,
        asesor: nombreAsesor,
        fecha_venta: fechaVentaColombia
    };
    if (docTipoLimpio) updatePayload.documento_tipo = docTipoLimpio;
    if (docNumeroLimpio) updatePayload.documento_numero = docNumeroLimpio;

    const { error: updateError } = await supabase.from('boletas').update(updatePayload).eq('numero', numeroLimpio);
    if (updateError) throw updateError;

    // Si es efectivo en oficina, registrar ingreso directo a caja
    if (abonoNum > 0 && referenciaAbono === 'efectivo_oficina') {
      const fechaHoyCaja = fechaVentaColombia.split('T')[0];
      await supabase.from('movimientos_caja').insert({
        fecha: fechaHoyCaja,
        tipo: 'ingreso',
        monto: abonoNum,
        descripcion: `Efectivo en oficina - Venta Boleta ${numeroLimpio} (${nombreAsesor})`,
        creado_por: nombreAsesor
      });
    }

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
