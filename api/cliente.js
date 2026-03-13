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
        boletas_cliente: "",
        deuda_cliente: "",
        abonado_cliente: "",
        nombre_cliente: "",
        enlaces_boletas: "",
        resumen: ""
      });
    }

    // 7. EMPACAMOS LOS DATOS
    const listaNumeros = boletas.map(b => b.numero).join(', ');
    
    // Sumamos la deuda total y tomamos el mínimo abonado entre todas las boletas
    const deudaTotal = boletas.reduce((suma, b) => suma + Number(b.saldo_restante), 0);
    const abonadoTotal = Math.min(...boletas.map(b => Number(b.total_abonado)));
    
    const nombre = boletas[0].clientes?.nombre || "Cliente";
    
    // Lista de enlaces con doble salto de línea y emoji
    const listaEnlaces = boletas.map(b => `🎟️ *Boleta ${b.numero}:*\nhttps://www.losplata.com.co/boleta/${b.numero}`).join('\n\n');

    // Resumen bonito: número de boleta + saldo restante de cada una
    const formatearPesos = (valor) =>
      '$' + Number(valor).toLocaleString('es-CO');

    const resumen = boletas.map(b =>
      `🎟️ *Boleta ${b.numero}* → Restante: *${formatearPesos(b.saldo_restante)}*`
    ).join('\n\n');

    // 8. Le respondemos a Chatea Pro con el paquete listo y valores COMPLETOS
    res.status(200).json({
      boletas_cliente: listaNumeros,
      deuda_cliente: deudaTotal,
      abonado_cliente: abonadoTotal,
      nombre_cliente: nombre,
      enlaces_boletas: listaEnlaces,
      resumen
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
