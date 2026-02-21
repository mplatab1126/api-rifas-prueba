import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { contrasena } = req.body;
  // 1. Vercel lee el secreto y descubre quién es el asesor según la contraseña que envió
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  // 2. Si la contraseña no existe, lo bloquea
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  // 3. CANDADO DE SEGURIDAD: Solo Mateo y Alejo P pasan de aquí
  if (nombreAsesor !== 'Mateo' && nombreAsesor !== 'Alejo P') {
    return res.status(403).json({ 
      status: 'error', 
      mensaje: 'Acceso Denegado: Solo Mateo y Alejo P tienen permisos para ver el rendimiento de la empresa.' 
    });
  }

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
