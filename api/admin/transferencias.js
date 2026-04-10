import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  // RECIBIMOS TODOS LOS DATOS DESDE EL PANEL HTML (Incluyendo Plataforma)
  const { fecha, hora, monto, referencia, plataforma } = req.body;

  if (!fecha && !monto && !referencia && !hora && !plataforma) {
    return res.status(400).json({ status: 'error', mensaje: 'Debes enviar al menos un dato para buscar' });
  }

  try {
    let query = supabase.from('transferencias').select('*');

    // BÚSQUEDA INTELIGENTE POR REFERENCIA
    if (referencia) {
        const refLimpia = referencia.trim(); 
        query = query.ilike('referencia', `%${refLimpia}%`); 
    }
    
    if (monto) query = query.eq('monto', Number(monto));
    if (plataforma) query = query.ilike('plataforma', `%${plataforma}%`); // Filtramos por plataforma

    // BUSCAMOS POR FECHA
    if (fecha) {
      let f = fecha;
      if (fecha.includes('/')) {
         const partes = fecha.split('/'); 
         f = `${partes[2].length===2 ? '20'+partes[2] : partes[2]}-${partes[1]}-${partes[0]}`;
      }
      query = query.eq('fecha_pago', f); // Busca solo la fecha exacta
    }
    
    // --- 🌟 AQUÍ ESTÁ LA CORRECCIÓN PARA LA HORA 🌟 ---
    if (hora) {
      // Tomamos solo "HH:mm" del input
      const horaLimpia = hora.substring(0, 5); 
      // Buscamos todo lo que haya caído dentro de ese minuto exacto (Ej: 19:04:00 a 19:04:59)
      query = query.gte('hora_pago', `${horaLimpia}:00`).lte('hora_pago', `${horaLimpia}:59`);
    }

    query = query.order('fecha_pago', { ascending: false }).limit(10);
    const { data: transferencias, error } = await query;

    if (error) throw error;

    const listaFormateada = transferencias.map(t => {
      // Unimos la fecha y la hora (si la tiene) para mostrarlas en el HTML
      const fechaLimpia = t.hora_pago ? `${t.fecha_pago} a las ${t.hora_pago}` : t.fecha_pago;
      
      return {
        id: t.id,
        monto: t.monto,
        referencia: t.referencia,
        plataforma: t.plataforma || 'Banco',
        fecha: fechaLimpia,
        status: t.estado || 'LIBRE',
        url_comprobante: t.url_comprobante || null // ✨ AQUÍ AGREGAMOS LA URL ✨
      };
    });

    return res.status(200).json({ status: 'ok', lista: listaFormateada });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
