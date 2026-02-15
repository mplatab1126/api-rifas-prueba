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

  // 3. EL TRUCO UNIVERSAL: Limpiamos el número y sacamos los últimos 10 dígitos
  const telefonoLimpio = String(telefono).replace(/\D/g, '').slice(-10);

  // 4. Conectamos con tu Bóveda de Supabase usando las variables de entorno de Vercel
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // 5. Buscamos TODAS las boletas que le pertenecen a este teléfono
    // Y de paso, le pedimos a Supabase que nos traiga el nombre del cliente de la otra tabla
    const { data: boletas, error } = await supabase
      .from('boletas')
      .select(`
        numero,
        saldo_restante,
        clientes (nombre)
      `)
      .eq('telefono_cliente', telefonoLimpio);

    if (error) throw error;

    // 6. Si el cliente no tiene boletas (es un prospecto nuevo)
    if (!boletas || boletas.length === 0) {
      return res.status(200).json({
        boletas_cliente: "Ninguna",
        deuda_cliente: 0,
        nombre_cliente: "No encontrado"
      });
    }

    // 7. EMPACAMOS LOS DATOS: Unimos las boletas y sumamos la deuda total
    const listaNumeros = boletas.map(b => b.numero).join(', ');
    const deudaTotal = boletas.reduce((suma, b) => suma + Number(b.saldo_restante), 0);
    const nombre = boletas[0].clientes?.nombre || "Cliente";

    // 8. Le respondemos a Chatea Pro con el paquete listo
    res.status(200).json({
      boletas_cliente: listaNumeros,
      deuda_cliente: deudaTotal,
      nombre_cliente: nombre
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
