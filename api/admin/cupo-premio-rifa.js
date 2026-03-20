import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const { data: configRifa } = await supabase
      .from('config_rifa_diaria')
      .select('modo_premio, total_boletas_premio')
      .eq('tipo', '3cifras')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!configRifa || configRifa.modo_premio !== 'boletas') {
      return res.status(200).json({ status: 'error', mensaje: 'La rifa actual no premia con boletas del apartamento.' });
    }

    const limite = configRifa.total_boletas_premio || 0;
    if (limite <= 0) {
      return res.status(200).json({ status: 'error', mensaje: 'No se configuró el total de boletas premio para esta rifa.' });
    }

    const hoyCol = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const hoyStr = hoyCol.getFullYear() + '-' + String(hoyCol.getMonth()+1).padStart(2,'0') + '-' + String(hoyCol.getDate()).padStart(2,'0');

    const { count: usados } = await supabase
      .from('abonos')
      .select('id', { count: 'exact', head: true })
      .eq('referencia_transferencia', 'premio_rifa_diaria')
      .gte('fecha_pago', hoyStr + 'T00:00:00')
      .lte('fecha_pago', hoyStr + 'T23:59:59');

    const disponibles = Math.max(0, limite - (usados || 0));

    return res.status(200).json({
      status: 'ok',
      total: limite,
      usados: usados || 0,
      disponibles
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
