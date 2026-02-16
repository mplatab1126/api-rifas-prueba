import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { numero } = req.query;
  if (!numero) return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Buscamos los abonos de esta boleta, ordenados por los más recientes primero
    const { data, error } = await supabase
      .from('abonos')
      .select('*')
      .eq('numero_boleta', numero)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;
    
    return res.status(200).json({ status: 'ok', lista: data });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
