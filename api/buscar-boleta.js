import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  const { numero } = req.query;

  if (!numero || numero.length > 4) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const numPadded = numero.padStart(4, '0');

  try {
    const { data, error } = await supabase
      .from('boletas')
      .select('numero, telefono_cliente')
      .eq('numero', numPadded)
      .single();

    if (error || !data) {
      return res.status(404).json({ disponible: false, numero: numPadded });
    }

    // Si no tiene teléfono asignado, está disponible
    const disponible = data.telefono_cliente === null;

    res.status(200).json({ disponible, numero: numPadded });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
}
