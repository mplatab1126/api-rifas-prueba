import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  // RECIBIMOS LA HORA DESDE EL PANEL HTML
  const { fecha, hora, monto, referencia } = req.body;

  if (!fecha && !monto && !referencia && !hora) {
    return res.status(400).json({ status: 'error', mensaje: 'Debes enviar al menos un dato para buscar' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    let query = supabase.from('transferencias').select('*');

    if (referencia) query = query.ilike('referencia', `%${referencia}%`); 
    if (monto) query = query.eq('monto', Number(monto));

    // --- NUEVA BÚSQUEDA MÁS SIMPLE Y EXACTA ---
    if (fecha) {
      let f = fecha;
      if (fecha.includes('/')) {
         const partes = fecha.split('/'); 
         f = `${partes[2].length===2 ? '20'+partes[2] : partes[2]}-${partes[1]}-${partes[0]}`;
      }
      query = query.eq('fecha_pago', f); // Busca solo la fecha exacta
    }
    
    if (hora) {
      query = query.ilike('hora_pago', `${hora}%`); // Busca que la hora coincida
    }

    query = query.order('fecha_pago', { ascending: false }).limit(10);
    const { data: transferencias, error } = await query;

    if (error) throw error;

    const listaFormateada = transferencias.map(t => {
      // Unimos la fecha y la hora (si la tiene) para mostrarlas en el HTML
      const fechaLimpia = t.hora_pago ? `${t.fecha_pago} a las ${t.hora_pago}` : t.fecha_pago;
      
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
