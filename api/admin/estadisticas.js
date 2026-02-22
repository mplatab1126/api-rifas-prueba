import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  if (nombreAsesor !== 'Mateo' && nombreAsesor !== 'Alejo P') {
    return res.status(403).json({ 
      status: 'error', 
      mensaje: 'Acceso Denegado: Solo Mateo y Alejo P tienen permisos para ver el rendimiento de la empresa.' 
    });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 1. Traemos los Abonos
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('monto, fecha_pago, asesor, numero_boleta');
    if (errAbonos) throw errAbonos;

    // 2. Traemos las Ventas (ahora incluimos el "detalle" para saber si el abono fue $0)
    const { data: ventas, error: errVentas } = await supabase
      .from('registro_movimientos')
      .select('created_at, asesor, boleta, detalle')
      .eq('accion', 'Nueva Venta');
    if (errVentas) throw errVentas;

    // 3. Traemos el resumen global del Apartamento (10.000 boletas)
    const { data: boletasGlobal, error: errBoletas } = await supabase
      .from('boletas')
      .select('estado, total_abonado, telefono_cliente');
    if (errBoletas) throw errBoletas;

    let registradas = 0;
    let separadas_cero = 0;
    let libres = 0;

    // Calculamos el inventario global
    boletasGlobal.forEach(b => {
        if (!b.telefono_cliente || b.estado === 'LIBRE') {
            libres++;
        } else {
            registradas++;
            if (!b.total_abonado || Number(b.total_abonado) === 0) {
                separadas_cero++;
            }
        }
    });

    return res.status(200).json({ 
        status: 'ok', 
        abonos: abonos, 
        ventas: ventas,
        globales: { registradas, separadas_cero, libres }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
