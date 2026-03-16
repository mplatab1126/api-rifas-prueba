import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Traemos las últimas transferencias para sacar los nombres de las plataformas
    const { data, error } = await supabase
      .from('transferencias')
      .select('plataforma')
      .limit(1000);

    if (error) throw error;

    // Magia de Javascript: Filtramos los nombres para que no haya repetidos
    const plataformasUnicas = [...new Set(data.map(t => t.plataforma).filter(Boolean))];

    // Agregamos las básicas por defecto para que nunca falten
    const plataformasFinales = [...new Set(['Nequi', 'Bancolombia', 'Efectivo', 'Corresponsal', ...plataformasUnicas])];

    return res.status(200).json({ status: 'ok', lista: plataformasFinales });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
