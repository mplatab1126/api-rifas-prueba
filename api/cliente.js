import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Configuramos los permisos (CORS) para que cualquiera pueda consultar
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Recibimos el teléfono que manda Chatea Pro
  const { telefono } = req.query;

  if (!telefono) {
    return res.status(400).json({ error: 'Falta el número de teléfono' });
  }

  // 3. Limpiamos el número y sacamos los últimos 10 dígitos
  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);

  // 4. Conectamos con tu Bóveda de Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // 5. Buscamos TODAS las boletas que le pertenecen a este teléfono
    // Agregamos "total_abonado" para traerlo de la base de datos
    const { data: boletas, error } = await supabase
      .from('boletas')
      .select(`
        numero,
        saldo_restante,
        total_abonado,
        clientes (nombre)
      `)
      .eq('telefono_cliente', telefonoLimpio);

    if (error) throw error;

    // 6. Si el cliente no tiene boletas (es un prospecto nuevo)
    if (!boletas || boletas.length === 0) {
      return res.status(200).json({
        boletas_cliente: "Ninguna",
        deuda_cliente: 0,
        abonado_cliente: 0,
        nombre_cliente: "No encontrado",
        enlaces_boletas: "Ninguno"
      });
    }

    // 7. EMPACAMOS LOS DATOS
    const listaNumeros = boletas.map(b => b.numero).join(', ');
    
    // Sumamos la deuda y lo abonado (sin divisiones, valor completo)
    const deudaTotal = boletas.reduce((suma, b) => suma + Number(b.saldo_restante), 0);
    const abonadoTotal = boletas.reduce((suma, b) => suma + Number(b.total_abonado), 0);
    
    const nombre = boletas[0].clientes?.nombre || "Cliente";
    
    // Lista de enlaces con doble salto de línea y emoji
    const listaEnlaces = boletas.map(b => `🎟️ *Boleta ${b.numero}:*\nhttps://www.losplata.com.co/boleta/${b.numero}`).join('\n\n');

    // 8. Le respondemos a Chatea Pro con el paquete listo y valores COMPLETOS
    res.status(200).json({
      boletas_cliente: listaNumeros,
      deuda_cliente: deudaTotal,        // Ej: 150000
      abonado_cliente: abonadoTotal,    // Ej: 50000
      nombre_cliente: nombre,
      enlaces_boletas: listaEnlaces 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
