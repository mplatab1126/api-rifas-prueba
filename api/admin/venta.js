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

  // 2. Solo aceptamos POST (porque enviamos datos sensibles)
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  // 3. Recibimos todo el "paquete" de datos que manda tu HTML
  const {
    numeroBoleta, nombre, apellido, ciudad, telefono,
    primerAbono, referenciaAbono, metodoPago, referencia,
    contrasena, esPendiente
  } = req.body;

  // 4. SEGURIDAD: Validar la contraseña y el Asesor
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  }

  if (!numeroBoleta || !telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan datos (Boleta o Teléfono)' });
  }

  // 5. Limpiamos los datos
  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);
  const numeroLimpio = String(numeroBoleta).trim();
  const abonoNum = Number(primerAbono) || 0;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // PASO A: Verificar que la boleta realmente esté libre y ver cuánto cuesta
    const { data: boletaData, error: boletaError } = await supabase
      .from('boletas')
      .select('numero, precio_total, telefono_cliente')
      .eq('numero', numeroLimpio)
      .single();

    if (boletaError || !boletaData) {
      return res.status(404).json({ status: 'error', mensaje: 'La boleta no existe' });
    }
    if (boletaData.telefono_cliente) {
      return res.status(400).json({ status: 'error', mensaje: 'Esta boleta ya fue vendida a otra persona' });
    }

    // PASO B: Crear o actualizar al cliente (upsert)
    const { error: clienteError } = await supabase
      .from('clientes')
      .upsert({
        telefono: telefonoLimpio,
        nombre: nombre || 'Sin Nombre',
        apellido: apellido || '',
        ciudad: ciudad || ''
      }, { onConflict: 'telefono' }); // Si el teléfono ya existe, solo actualiza sus datos

    if (clienteError) throw clienteError;

    // PASO C: Si la persona dio dinero, lo registramos en la tabla 'abonos'
    if (abonoNum > 0) {
      const { error: abonoError } = await supabase
        .from('abonos')
        .insert({
          numero_boleta: numeroLimpio,
          monto: abonoNum,
          fecha_pago: new Date().toISOString(),
          referencia_transferencia: referenciaAbono || 'Sin Ref',
          nota: `Origen: ${metodoPago || 'Efectivo'}${esPendiente ? ' | PENDIENTE' : ''} | Venta: ${referencia || 'Directa'}`,
          asesor: nombreAsesor // 🌟 NUEVA COLUMNA
        });

      if (referenciaAbono && referenciaAbono !== 'Sin Ref' && referenciaAbono !== 'efectivo') {
        await supabase
          .from('transferencias')
          .update({ estado: `ASIGNADA a boleta ${numeroLimpio}` })
          .eq('referencia', referenciaAbono);
      }
    }

    // PASO D: Le amarramos la boleta al cliente y actualizamos sus saldos
    const precioTotal = Number(boletaData.precio_total) || 200000; 
    const saldoRestante = precioTotal - abonoNum;
    
    const estadoNuevo = saldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    // --- MAGIA: OBTENER HORA EXACTA DE COLOMBIA ---
    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaVentaColombia = fechaCol.getFullYear() + "-" + 
             String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" + 
             String(fechaCol.getDate()).padStart(2, '0') + "T" + 
             String(fechaCol.getHours()).padStart(2, '0') + ":" + 
             String(fechaCol.getMinutes()).padStart(2, '0') + ":" + 
             String(fechaCol.getSeconds()).padStart(2, '0');
    // ----------------------------------------------

    const { error: updateError } = await supabase
      .from('boletas')
      .update({
        telefono_cliente: telefonoLimpio,
        estado: estadoNuevo,
        total_abonado: abonoNum,
        saldo_restante: saldoRestante,
        asesor: nombreAsesor, 
        fecha_venta: fechaVentaColombia // 🌟 AHORA SÍ ES HORA COLOMBIA
      })
      .eq('numero', numeroLimpio);

    if (updateError) throw updateError;

    // TODO SALIÓ BIEN
    return res.status(200).json({ status: 'ok', mensaje: 'Venta registrada con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
