import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Configuramos permisos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Solo aceptamos peticiones POST (más seguras para enviar datos)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // 3. Recibimos el número de boleta y el teléfono que escribió el cliente
  const { numero_boleta, telefono } = req.body;

  if (!numero_boleta || !telefono) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  // 4. Limpiamos ambos datos (Boleta a 4 dígitos, Teléfono a 10 dígitos)
  const boletaLimpia = ("0000" + String(numero_boleta).trim()).slice(-4);
  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // 5. Buscamos la boleta en Supabase
    const { data: boleta, error } = await supabase
      .from('boletas')
      .select(`
        numero,
        total_abonado,
        saldo_restante,
        telefono_cliente,
        clientes (nombre, apellido, ciudad)
      `)
      .eq('numero', boletaLimpia)
      .single(); // Solo queremos 1 resultado

    if (error || !boleta) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    // 6. VERIFICACIÓN DE SEGURIDAD: Comparamos el teléfono
    // Extraemos los últimos 10 dígitos del teléfono real de la base de datos
    const telefonoRealDB = String(boleta.telefono_cliente).replace(/\D/g, '').slice(-10);

    if (telefonoLimpio !== telefonoRealDB) {
      return res.status(401).json({ error: 'El número de teléfono no coincide con el titular' });
    }

    // 7. Si todo está perfecto, enviamos los datos al Frontend
    res.status(200).json({
      numero: boleta.numero,
      nombre: boleta.clientes?.nombre || '—',
      apellido: boleta.clientes?.apellido || '',
      ciudad: boleta.clientes?.ciudad || '—',
      telefono: boleta.telefono_cliente,
      total: boleta.total_abonado,
      restante: boleta.saldo_restante
    });

  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
}
