import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Traemos todos los números de la rifa diaria (del 00 al 99)
    const { data, error } = await supabase
      .from('boletas_diarias')
      .select('numero, estado, nombre_cliente, telefono_cliente')
      .order('numero', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', lista: data });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
