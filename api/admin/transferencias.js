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

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  // 2. Recibimos los filtros que mandó el asesor desde el panel
  const { fecha, monto, referencia } = req.body;

  if (!fecha && !monto && !referencia) {
    return res.status(400).json({ status: 'error', mensaje: 'Debes enviar al menos un dato para buscar' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 3. Empezamos a armar la consulta a la tabla 'transferencias'
    let query = supabase.from('transferencias').select('*');

    // 4. Aplicamos los filtros inteligentemente (los que el asesor haya llenado)
    if (referencia) {
      // Usamos ilike para que busque coincidencias (ej: si busca "1234", trae "M012345")
      query = query.ilike('referencia', `%${referencia}%`); 
    }
    
    if (monto) {
      query = query.eq('monto', Number(monto));
    }

    if (fecha) {
      // Dependiendo de cómo guardes la fecha, buscamos coincidencias de ese día
      query = query.ilike('fecha', `%${fecha}%`); 
    }

    // Ordenamos para ver las más recientes primero y limitamos a 10 resultados para no saturar
    query = query.order('id', { ascending: false }).limit(10);

    const { data: transferencias, error } = await query;

    if (error) throw error;

    // 5. Transformamos los datos al formato exacto que espera tu panel HTML
    const listaFormateada = transferencias.map(t => ({
      monto: t.monto,
      referencia: t.referencia,
      plataforma: t.plataforma || 'Banco', // Nequi, Daviplata, etc.
      fecha: t.fecha || '',
      status: t.estado || 'LIBRE' // LIBRE o USADO
    }));

    return res.status(200).json({ 
      status: 'ok', 
      lista: listaFormateada 
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
