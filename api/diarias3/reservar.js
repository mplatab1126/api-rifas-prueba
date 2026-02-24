import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { numeros, nombre, telefono } = req.body;
  
  if (!numeros || numeros.length === 0 || !nombre || !telefono) {
    return res.status(400).json({ error: 'Faltan datos para la reserva' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const { data: checkData, error: checkError } = await supabase
      .from('boletas_diarias_3cifras') // <-- TABLA NUEVA
      .select('numero, estado')
      .in('numero', numeros);

    if (checkError) throw checkError;

    const ocupados = checkData.filter(b => b.estado !== 'Disponible');
    if (ocupados.length > 0) {
      return res.status(400).json({ error: `Los números ${ocupados.map(o=>o.numero).join(', ')} ya fueron tomados.` });
    }

    const { error: updateError } = await supabase
      .from('boletas_diarias_3cifras') // <-- TABLA NUEVA
      .update({ estado: 'Reservado', nombre_cliente: nombre, telefono_cliente: telefono })
      .in('numero', numeros);

    if (updateError) throw updateError;

    // Calcula el total a pagar (Ajusta este PRECIO_BOLETA a lo que valga la de 3 cifras)
    const PRECIO_BOLETA_3_CIFRAS = 30000; 
    const totalPagar = numeros.length * PRECIO_BOLETA_3_CIFRAS;
    const mensaje = `¡Hola Los Plata! 👋\nAcabo de reservar en la RIFA DE 3 CIFRAS.\n\n👤 Nombre: ${nombre}\n📱 Celular: ${telefono}\n🎟️ Mis números: ${numeros.join(', ')}\n💰 Total a pagar: $${totalPagar.toLocaleString('es-CO')}\n\nQuedo atento para enviar el comprobante.`;
    
    const urlWhatsapp = `https://wa.me/573116675984?text=${encodeURIComponent(mensaje)}`;
    return res.status(200).json({ exito: true, url: urlWhatsapp });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor: ' + error.message });
  }
}
