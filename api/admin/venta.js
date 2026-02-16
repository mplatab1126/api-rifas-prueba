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

  // 4. SEGURIDAD: Validar la contraseña (Puedes cambiar 'LosPlata2026' por la que quieras)
  const claveMaestra = process.env.ADMIN_PASSWORD || '1234';
  if (contrasena !== claveMaestra) {
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
          // Guardamos el método, si está pendiente y de dónde vino la venta
          nota: `Origen: ${metodoPago || 'Efectivo'}${esPendiente ? ' | PENDIENTE' : ''} | Venta: ${referencia || 'Directa'}`
        });

      if (abonoError) throw abonoError;
    }

    // PASO D: Le amarramos la boleta al cliente y actualizamos sus saldos
    const precioTotal = Number(boletaData.precio_total) || 200000; // Asume 200mil si no hay precio en BD
    const saldoRestante = precioTotal - abonoNum;
    
    // Determinamos si ya la pagó toda
    const estadoNuevo = saldoRestante <= 0 ? 'Pagada' : 'Ocupada';

    const { error: updateError } = await supabase
      .from('boletas')
      .update({
        telefono_cliente: telefonoLimpio,
        estado: estadoNuevo,
        total_abonado: abonoNum,
        saldo_restante: saldoRestante
      })
      .eq('numero', numeroLimpio);

    if (updateError) throw updateError;

    // TODO SALIÓ BIEN
    return res.status(200).json({ status: 'ok', mensaje: 'Venta registrada con éxito' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
