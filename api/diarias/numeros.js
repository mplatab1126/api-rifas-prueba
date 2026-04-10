import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

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
