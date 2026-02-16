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
    let query = supabase.from('transferencias').select('*');

    // 3. Aplicamos los filtros
    if (referencia) {
      query = query.ilike('referencia', `%${referencia}%`); 
    }
    
    if (monto) {
      query = query.eq('monto', Number(monto));
    }

    if (fecha) {
      // El panel HTML viejo enviaba la fecha como DD/MM/YYYY, la convertimos a YYYY-MM-DD
      let f = fecha;
      if (fecha.includes('/')) {
         const partes = fecha.split('/'); 
         f = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }
      // Filtramos desde las 00:00 hasta las 23:59 de ese día en específico
      query = query.gte('fecha_pago', `${f}T00:00:00.000Z`)
                   .lte('fecha_pago', `${f}T23:59:59.999Z`);
    }

    // Ordenamos para ver las más recientes primero
    query = query.order('fecha_pago', { ascending: false }).limit(10);

    const { data: transferencias, error } = await query;

    if (error) throw error;

    // 4. Transformamos los datos al formato exacto que espera tu panel HTML
    const listaFormateada = transferencias.map(t => {
      // Formatear la fecha para que el asesor la lea fácil
      const fechaLimpia = new Date(t.fecha_pago).toLocaleDateString('es-CO');
      
      return {
        monto: t.monto,
        referencia: t.referencia,
        plataforma: t.plataforma || 'Banco',
        fecha: fechaLimpia,
        status: t.estado || 'LIBRE'
      };
    });

    return res.status(200).json({ status: 'ok', lista: listaFormateada });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
