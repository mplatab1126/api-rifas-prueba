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

    if (fecha && hora) {
      let f = fecha;
      if (fecha.includes('/')) {
         const partes = fecha.split('/'); 
         f = `${partes[2].length===2 ? '20'+partes[2] : partes[2]}-${partes[1]}-${partes[0]}`;
      }
      // Busca exactamente en el minuto indicado, ajustado a Colombia
      const exactStart = `${f}T${hora}:00-05:00`;
      const exactEnd = `${f}T${hora}:59-05:00`;
      query = query.gte('fecha_pago', exactStart).lte('fecha_pago', exactEnd);
      
    } else if (fecha) {
      let f = fecha;
      if (fecha.includes('/')) {
         const partes = fecha.split('/'); 
         f = `${partes[2].length===2 ? '20'+partes[2] : partes[2]}-${partes[1]}-${partes[0]}`;
      }
      // Si no puso hora, busca en todo el día
      query = query.gte('fecha_pago', `${f}T00:00:00-05:00`).lte('fecha_pago', `${f}T23:59:59-05:00`);
    }

    query = query.order('fecha_pago', { ascending: false }).limit(10);
    const { data: transferencias, error } = await query;

    if (error) throw error;

    const listaFormateada = transferencias.map(t => {
      // 🌟 IMPRIMIMOS LA FECHA Y LA HORA EN EL BOTÓN PARA QUE LO VEAS CLARO
      const fechaLimpia = new Date(t.fecha_pago).toLocaleString('es-CO', { 
         day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true 
      });
      
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
