import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';
import { limpiarTelefono } from './lib/telefono.js';

const WHATSAPP = '573107334957';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { numeros, nombre, apellido, ciudad, telefono, indicativo } = req.body;

  if (!numeros || numeros.length === 0 || !nombre || !telefono) {
    return res.status(400).json({ error: 'Faltan datos para la reserva' });
  }

  if (numeros.length > 10) {
    return res.status(400).json({ error: 'Máximo 10 boletas por reserva' });
  }

  const telefonoLimpio = limpiarTelefono(telefono, indicativo || '57');
  const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

  try {
    // 1. Verificar disponibilidad
    const { data: checkData, error: checkError } = await supabase
      .from('boletas')
      .select('numero, precio_total, telefono_cliente')
      .in('numero', numeros);

    if (checkError) throw checkError;

    const noEncontrados = numeros.filter(n => !checkData.find(b => b.numero === n));
    if (noEncontrados.length > 0) {
      return res.status(400).json({ error: `Los números ${noEncontrados.join(', ')} no existen.` });
    }

    const ocupados = checkData.filter(b => b.telefono_cliente !== null);
    if (ocupados.length > 0) {
      return res.status(409).json({ error: `Los números ${ocupados.map(o => o.numero).join(', ')} ya fueron tomados por alguien más.` });
    }

    // 2. Calcular total (precio de BD)
    const totalPagar = checkData.reduce((sum, b) => sum + (Number(b.precio_total) || 0), 0);

    // 3. Fecha Colombia
    const fechaCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const fechaVenta = fechaCol.getFullYear() + "-" +
      String(fechaCol.getMonth() + 1).padStart(2, '0') + "-" +
      String(fechaCol.getDate()).padStart(2, '0') + "T" +
      String(fechaCol.getHours()).padStart(2, '0') + ":" +
      String(fechaCol.getMinutes()).padStart(2, '0') + ":" +
      String(fechaCol.getSeconds()).padStart(2, '0');

    // 4. Actualizar boletas a "Reservado" (con candado optimista)
    const { data: updated, error: updateError } = await supabase
      .from('boletas')
      .update({
        telefono_cliente: telefonoLimpio,
        estado: 'Reservado',
        total_abonado: 0,
        saldo_restante: checkData[0]?.precio_total || 0,
        asesor: 'web-perla-roja',
        fecha_venta: fechaVenta
      })
      .in('numero', numeros)
      .is('telefono_cliente', null)
      .select('numero, precio_total');

    if (updateError) throw updateError;

    // Si no se actualizaron todas, alguien las tomó entre el check y el update
    if (!updated || updated.length < numeros.length) {
      // Revertir las que sí se actualizaron
      if (updated && updated.length > 0) {
        await supabase.from('boletas')
          .update({ telefono_cliente: null, estado: null, total_abonado: null, saldo_restante: null, asesor: null, fecha_venta: null })
          .in('numero', updated.map(u => u.numero));
      }
      return res.status(409).json({ error: 'Algunos números fueron tomados por alguien más mientras procesábamos tu reserva. Intenta de nuevo.' });
    }

    // Si cada boleta tiene precio diferente, actualizar saldo_restante individualmente
    const preciosDistintos = new Set(checkData.map(b => Number(b.precio_total)));
    if (preciosDistintos.size > 1) {
      for (const boleta of checkData) {
        await supabase.from('boletas')
          .update({ saldo_restante: Number(boleta.precio_total) || 0 })
          .eq('numero', boleta.numero);
      }
    }

    // 5. Guardar/actualizar cliente
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
      .eq('telefono', telefonoLimpio)
      .single();

    await supabase.from('clientes').upsert({
      telefono: telefonoLimpio,
      nombre: nombre,
      apellido: apellido || '',
      ciudad: ciudad || '',
      total_comprado: clienteActual?.total_comprado || 0,
      boletas_diarias_compradas: clienteActual?.boletas_diarias_compradas || 0,
      boletas_grandes_compradas: clienteActual?.boletas_grandes_compradas || 0
    }, { onConflict: 'telefono' });

    // 6. Bitácora
    await supabase.from('registro_movimientos').insert({
      asesor: 'web-perla-roja',
      accion: 'Reserva Web',
      boleta: numeros.join(', '),
      detalle: `Reserva desde perla-roja.html por ${telefonoLimpio} - ${numeros.length} boleta(s)`
    });

    // 7. Armar WhatsApp
    const totalStr = '$' + totalPagar.toLocaleString('es-CO');
    const mensaje = `¡Hola Los Plata! 👋\nAcabo de reservar mis boletas de *LA PERLA ROJA*.\n\n👤 *Nombre:* ${nombreCompleto}\n📱 *Celular:* ${telefonoLimpio}\n🏙️ *Ciudad:* ${ciudad || ''}\n🎟️ *Números:* ${numeros.join(', ')}\n💰 *Total:* ${totalStr}\n\n¡Quedo atento para enviar el pago!`;
    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`;

    return res.status(200).json({ exito: true, url, total: totalPagar });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor: ' + error.message });
  }
}
