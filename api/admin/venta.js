import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroBoleta, nombre, apellido, ciudad, telefono, primerAbono, referenciaAbono, metodoPago, referencia, contrasena, esPendiente } = req.body;

  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!numeroBoleta || !telefono) return res.status(400).json({ status: 'error', mensaje: 'Faltan datos' });

  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);
  const numeroLimpio = String(numeroBoleta).trim();
  const abonoNum = Number(primerAbono) || 0;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const esDiaria = numeroLimpio.length === 2;
    const tabla = esDiaria ? 'boletas_diarias' : 'boletas';

    const { data: boletaData, error: boletaError } = await supabase.from(tabla).select(esDiaria ? 'numero, telefono_cliente' : 'numero, precio_total, telefono_cliente').eq('numero', numeroLimpio).single();

    if (boletaError || !boletaData) return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    if (boletaData.telefono_cliente) return res.status(400).json({ status: 'error', mensaje: 'Esta boleta ya fue vendida' });

    const { data: clienteActual } = await supabase.from('clientes').select('total_comprado, boletas_grandes_compradas, boletas_diarias_compradas').eq('telefono', telefonoLimpio).single();

    let totalComprado = (clienteActual?.total_comprado || 0) + abonoNum;
    let diariasCompradas = clienteActual?.boletas_diarias_compradas || 0;
    let grandesCompradas = clienteActual?.boletas_grandes_compradas || 0;

    const precioTotal = esDiaria ? 20000 : (Number(boletaData.precio_total) || 200000);
    const saldoRestante = precioTotal - abonoNum;

    if (saldoRestante <= 0) {
        if (esDiaria) diariasCompradas += 1;
        else grandesCompradas += 1;
    }

    const { error: clienteError } = await supabase.from('clientes').upsert({ telefono: telefonoLimpio, nombre: nombre || 'Sin Nombre', apellido: apellido || '', ciudad: ciudad || '', total_comprado: totalComprado, boletas_diarias_compradas: diariasCompradas, boletas_grandes_compradas: grandesCompradas }, { onConflict: 'telefono' });
    if (clienteError) throw clienteError;

    if (abonoNum > 0) {
      await supabase.from('abonos').insert({ numero_boleta: numeroLimpio, monto: abonoNum, fecha_pago: new Date().toISOString(), referencia_transferencia: referenciaAbono || 'Sin Ref', nota: `Origen: ${metodoPago || 'Efectivo'}${esPendiente ? ' | PENDIENTE' : ''} | Venta: ${referencia || 'Directa'}`, asesor: nombreAsesor });
      if (referenciaAbono && referenciaAbono !== 'Sin Ref' && referenciaAbono !== 'efectivo') {
        await supabase.from('transferencias').update({ estado: `ASIGNADA a boleta ${numeroLimpio}` }).eq('referencia', referenciaAbono);
      }
    }

    const estadoNuevo = saldoRestante <= 0 ? 'Pagada' : (esDiaria ? 'Reservado' : 'Ocupada');
    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fVenta = fechaCol.getFullYear() + "-" + String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" + String(fechaCol.getDate()).padStart(2, '0') + "T" + String(fechaCol.getHours()).padStart(2, '0') + ":" + String(fechaCol.getMinutes()).padStart(2, '0') + ":" + String(fechaCol.getSeconds()).padStart(2, '0');

    let updatePayload = { telefono_cliente: telefonoLimpio, estado: estadoNuevo, total_abonado: abonoNum, saldo_restante: saldoRestante };
    if (!esDiaria) { updatePayload.asesor = nombreAsesor; updatePayload.fecha_venta = fVenta; }

    await supabase.from(tabla).update(updatePayload).eq('numero', numeroLimpio);

    // GUARDAMOS EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({ asesor: nombreAsesor, accion: 'Nueva Venta', boleta: numeroLimpio, detalle: `Se separó a nombre de ${telefonoLimpio} con abono de $${abonoNum}` });

    return res.status(200).json({ status: 'ok', mensaje: 'Venta registrada con éxito' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
