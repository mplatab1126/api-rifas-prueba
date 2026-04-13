/**
 * Endpoint público: reserva boletas de la rifa principal (4 cifras)
 * desde la página rifa.html. Esto NO registra un pago — solamente
 * separa las boletas a nombre del cliente. El cliente luego debe
 * mandar el comprobante de transferencia por WhatsApp y un asesor
 * valida y marca el abono desde admin.html.
 *
 * Es el equivalente al de diarias3/reservar.js, pero para la tabla
 * `boletas` (4 cifras), usando el precio_total de cada boleta
 * y dejándolas en estado "Ocupada" (mismo que usa admin/venta.js).
 *
 * Flujo:
 * 1. Validamos que todos los números sigan libres (telefono_cliente null).
 * 2. Calculamos el total a pagar (suma de precio_total de cada una).
 * 3. Guardamos / actualizamos al cliente en la tabla `clientes`.
 * 4. Marcamos las boletas como "Ocupada" con telefono_cliente y
 *    saldo_restante = precio_total (sin abono todavía).
 * 5. Registramos en la bitácora.
 * 6. Devolvemos un link de WhatsApp con el mensaje listo.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ exito: false, error: 'Método no permitido' });
  }

  const { numeros, nombre, apellido, ciudad, telefono } = req.body || {};

  if (!Array.isArray(numeros) || numeros.length === 0 || !nombre || !apellido || !ciudad || !telefono) {
    return res.status(400).json({ exito: false, error: 'Faltan datos para la reserva.' });
  }

  // Limpiamos datos del cliente
  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);
  if (telefonoLimpio.length !== 10) {
    return res.status(400).json({ exito: false, error: 'El celular debe tener 10 dígitos.' });
  }
  const nombreCompleto = `${nombre} ${apellido}`.trim();

  // Normalizamos los números: siempre 4 cifras con ceros a la izquierda
  const numerosLimpios = numeros
    .map(n => String(n).replace(/\D/g, ''))
    .filter(n => n.length > 0 && n.length <= 4)
    .map(n => n.padStart(4, '0'));

  if (numerosLimpios.length === 0) {
    return res.status(400).json({ exito: false, error: 'Los números no son válidos.' });
  }

  // Evitar duplicados dentro del mismo pedido
  const numerosUnicos = [...new Set(numerosLimpios)];

  try {
    // 1. Verificamos que todos los números sigan libres
    const { data: checkData, error: checkError } = await supabase
      .from('boletas')
      .select('numero, telefono_cliente, precio_total')
      .in('numero', numerosUnicos);

    if (checkError) throw checkError;

    if (!checkData || checkData.length !== numerosUnicos.length) {
      return res.status(400).json({
        exito: false,
        error: 'Algunos números no existen en la rifa. Recarga la página.'
      });
    }

    const ocupados = checkData.filter(b => b.telefono_cliente);
    if (ocupados.length > 0) {
      return res.status(400).json({
        exito: false,
        error: `Los números ${ocupados.map(o => o.numero).join(', ')} ya fueron tomados por otro cliente.`
      });
    }

    // 2. Calculamos el total a pagar con el precio real de cada boleta
    const totalPagar = checkData.reduce(
      (suma, b) => suma + (Number(b.precio_total) || PRECIOS.RIFA_4_CIFRAS),
      0
    );

    // 3. Guardamos / actualizamos al cliente sin pisar su historial
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
      .eq('telefono', telefonoLimpio)
      .single();

    const { error: upsertError } = await supabase.from('clientes').upsert({
      telefono: telefonoLimpio,
      nombre: nombre,
      apellido: apellido,
      ciudad: ciudad,
      total_comprado: clienteActual?.total_comprado || 0,
      boletas_diarias_compradas: clienteActual?.boletas_diarias_compradas || 0,
      boletas_grandes_compradas: clienteActual?.boletas_grandes_compradas || 0,
    }, { onConflict: 'telefono' });
    if (upsertError) throw upsertError;

    // 4. Marcamos las boletas como "Ocupada" (separadas sin pago todavía)
    // Actualizamos una por una para respetar el precio_total individual
    // de cada boleta (por si la gerencia maneja precios distintos).
    const fechaCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const fechaVenta =
      fechaCol.getFullYear() + '-' +
      String(fechaCol.getMonth() + 1).padStart(2, '0') + '-' +
      String(fechaCol.getDate()).padStart(2, '0') + 'T' +
      String(fechaCol.getHours()).padStart(2, '0') + ':' +
      String(fechaCol.getMinutes()).padStart(2, '0') + ':' +
      String(fechaCol.getSeconds()).padStart(2, '0');

    for (const b of checkData) {
      const precio = Number(b.precio_total) || PRECIOS.RIFA_4_CIFRAS;
      const { error: upErr } = await supabase
        .from('boletas')
        .update({
          telefono_cliente: telefonoLimpio,
          estado: 'Ocupada',
          total_abonado: 0,
          saldo_restante: precio,
          asesor: 'Pagina Web',
          fecha_venta: fechaVenta,
        })
        .eq('numero', b.numero);

      if (upErr) throw upErr;
    }

    // 5. Registramos en la bitácora (una línea por boleta reservada)
    const bitacora = checkData.map(b => ({
      asesor: 'Pagina Web',
      accion: 'Nueva Venta',
      boleta: b.numero,
      detalle: `Reserva desde web por ${telefonoLimpio} (${nombreCompleto})`,
    }));
    await supabase.from('registro_movimientos').insert(bitacora);

    // 6. Armamos el mensaje de WhatsApp listo para enviar
    const mensaje =
      `¡Hola Los Plata! 👋\nAcabo de reservar en la RIFA PRINCIPAL.\n\n` +
      `👤 Nombre: ${nombreCompleto}\n` +
      `📱 Celular: ${telefonoLimpio}\n` +
      `🎟️ Mis boletas: ${numerosUnicos.join(', ')}\n` +
      `💰 Total a pagar: $${totalPagar.toLocaleString('es-CO')}\n\n` +
      `Aquí va el comprobante de pago 👇`;

    const urlWhatsapp = `https://wa.me/573107334957?text=${encodeURIComponent(mensaje)}`;

    return res.status(200).json({
      exito: true,
      url: urlWhatsapp,
      total: totalPagar,
      numeros: numerosUnicos,
    });
  } catch (error) {
    return res.status(500).json({ exito: false, error: 'Error del servidor: ' + error.message });
  }
}
