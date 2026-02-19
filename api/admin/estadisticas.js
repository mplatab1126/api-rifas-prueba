import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { contrasena } = req.body;
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 1. Traemos todos los abonos (Para saber el dinero que entró)
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('monto, fecha_pago, asesor, numero_boleta');
    if (errAbonos) throw errAbonos;

    // 2. Traemos las ventas de la bitácora (Para saber TODAS las boletas registradas, incluso las de $0)
    const { data: ventas, error: errVentas } = await supabase
      .from('registro_movimientos')
      .select('created_at, asesor, boleta')
      .eq('accion', 'Nueva Venta');
    if (errVentas) throw errVentas;

    return res.status(200).json({ status: 'ok', abonos: abonos, ventas: ventas });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
