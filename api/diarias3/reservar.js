import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { PRECIOS } from '../config/precios.js';
import { limpiarTelefono, esTelefonoValido } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { numeros, nombre, apellido, ciudad, telefono } = req.body;
  
  if (!numeros || numeros.length === 0 || !nombre || !apellido || !ciudad || !telefono) {
    return res.status(400).json({ error: 'Faltan datos para la reserva' });
  }

  const telefonoLimpio = limpiarTelefono(telefono);
  if (!esTelefonoValido(telefonoLimpio)) {
    return res.status(400).json({ error: 'El número de teléfono no es válido. Escribe solo tu número celular, sin el código de país (57).' });
  }
  const nombreCompleto = `${nombre} ${apellido}`.trim();

  try {
    const { data: checkData, error: checkError } = await supabase
      .from('boletas_diarias_3cifras')
      .select('numero, estado')
      .in('numero', numeros);

    if (checkError) throw checkError;

    const ocupados = checkData.filter(b => b.estado !== 'Disponible');
    if (ocupados.length > 0) {
      return res.status(400).json({ error: `Los números ${ocupados.map(o=>o.numero).join(', ')} ya fueron tomados.` });
    }

    const { error: updateError } = await supabase
      .from('boletas_diarias_3cifras')
      .update({ estado: 'Reservado', nombre_cliente: nombreCompleto, telefono_cliente: telefonoLimpio })
      .in('numero', numeros);

    if (updateError) throw updateError;

    // Guardamos/actualizamos el cliente en la tabla clientes
    const { data: clienteActual } = await supabase
      .from('clientes')
      .select('total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
      .eq('telefono', telefonoLimpio)
      .single();

    await supabase.from('clientes').upsert({
      telefono: telefonoLimpio,
      nombre: nombre,
      apellido: apellido,
      ciudad: ciudad,
      total_comprado: clienteActual?.total_comprado || 0,
      boletas_diarias_compradas: clienteActual?.boletas_diarias_compradas || 0,
      boletas_grandes_compradas: clienteActual?.boletas_grandes_compradas || 0
    }, { onConflict: 'telefono' });

    const totalPagar = numeros.length * PRECIOS.RIFA_3_CIFRAS;
    const mensaje = `¡Hola Los Plata! 👋\nAcabo de reservar en la RIFA DE 3 CIFRAS.\n\n👤 Nombre: ${nombreCompleto}\n📱 Celular: ${telefonoLimpio}\n🎟️ Mis números: ${numeros.join(', ')}\n💰 Total a pagar: $${totalPagar.toLocaleString('es-CO')}\n\nMuchas gracias`;
    
    const urlWhatsapp = `https://wa.me/573107334957?text=${encodeURIComponent(mensaje)}`;
    return res.status(200).json({ exito: true, url: urlWhatsapp });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor: ' + error.message });
  }
}
