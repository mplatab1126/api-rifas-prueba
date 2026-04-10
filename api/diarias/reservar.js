import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { numeros, nombre, apellido, ciudad, telefono } = req.body;
  
  if (!numeros || numeros.length === 0 || !nombre || !apellido || !ciudad || !telefono) {
    return res.status(400).json({ error: 'Faltan datos para la reserva' });
  }

  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);
  const nombreCompleto = `${nombre} ${apellido}`.trim();

  try {
    // 1. Verificamos que los números sigan disponibles
    const { data: checkData, error: checkError } = await supabase
      .from('boletas_diarias')
      .select('numero, estado')
      .in('numero', numeros);

    if (checkError) throw checkError;

    const ocupados = checkData.filter(b => b.estado !== 'Disponible');
    if (ocupados.length > 0) {
      return res.status(400).json({ error: `Los números ${ocupados.map(o=>o.numero).join(', ')} ya fueron tomados por alguien más.` });
    }

    // 2. Actualizamos los números a "Reservado" en Supabase
    const { error: updateError } = await supabase
      .from('boletas_diarias')
      .update({ 
        estado: 'Reservado', 
        nombre_cliente: nombreCompleto, 
        telefono_cliente: telefonoLimpio 
      })
      .in('numero', numeros);

    if (updateError) throw updateError;

    // 3. Guardamos/actualizamos el cliente en la tabla clientes
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

    // 4. Generamos el link de WhatsApp
    const totalPagar = numeros.length * PRECIOS.RIFA_2_CIFRAS;
    const mensaje = `¡Hola Los Plata! 👋\nAcabo de reservar en la RIFA DIARIA.\n\n👤 Nombre: ${nombreCompleto}\n📱 Celular: ${telefonoLimpio}\n🎟️ Mis números: ${numeros.join(', ')}\n💰 Total a pagar: $${totalPagar.toLocaleString('es-CO')}\n\nQuedo atento para enviar el comprobante.`;
    
    // Aquí puse la línea exclusiva de rifas diarias que estaba en tu HTML (311 667 5984)
    const urlWhatsapp = `https://wa.me/573107334957?text=${encodeURIComponent(mensaje)}`;

    return res.status(200).json({ exito: true, url: urlWhatsapp });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor: ' + error.message });
  }
}
