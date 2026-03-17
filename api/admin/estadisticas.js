import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { contrasena, tipo = '4cifras' } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  // Agregué Alejo Plata por si acaso también usa ese alias
  if (nombreAsesor !== 'Mateo' && nombreAsesor !== 'Alejo P' && nombreAsesor !== 'Alejo Plata') {
    return res.status(403).json({ 
      status: 'error', 
      mensaje: 'Acceso Denegado: Solo gerencia tiene permisos para ver el rendimiento de la empresa.' 
    });
  }

  // Determinar tabla de boletas e identificador de cifras según el tipo seleccionado
  const tablaBoletasMap = { '2cifras': 'boletas_diarias', '3cifras': 'boletas_diarias_3cifras', '4cifras': 'boletas' };
  const patronLengthMap = { '2cifras': '__', '3cifras': '___', '4cifras': '____' };
  const tablaBoletas = tablaBoletasMap[tipo] || 'boletas';
  const patronLength = patronLengthMap[tipo] || '____';

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 1. Traemos los Abonos filtrados por cifras del número de boleta
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('monto, fecha_pago, asesor, numero_boleta')
      .like('numero_boleta', patronLength)
      .limit(100000); 
    if (errAbonos) throw errAbonos;

    // 2. Traemos las Ventas filtradas por cifras del número de boleta
    const { data: ventas, error: errVentas } = await supabase
      .from('registro_movimientos')
      .select('created_at, asesor, boleta, detalle')
      .eq('accion', 'Nueva Venta')
      .like('boleta', patronLength)
      .limit(100000); 
    if (errVentas) throw errVentas;

    // 3. Traemos el resumen global de la tabla de boletas correspondiente
    const { data: boletasGlobal, error: errBoletas } = await supabase
      .from(tablaBoletas)
      .select('estado, total_abonado, telefono_cliente, asesor')
      .limit(100000); 
    if (errBoletas) throw errBoletas;

    // 4. Traemos el rendimiento de Chatea Pro 
    const { data: chateaData, error: errChatea } = await supabase
      .from('rendimiento_asesores')
      .select('*')
      .limit(10000);
    if (errChatea) throw errChatea;

    // 5. Rendimiento de Facebook Ads
    const { data: fbData, error: errFb } = await supabase
      .from('metricas_facebook')
      .select('*')
      .limit(10000);
    if (errFb) throw errFb;

    // 6. Gastos que afectan el estado de resultados
    const { data: gastosData, error: errGastos } = await supabase
      .from('gastos')
      .select('id, fecha, monto, descripcion, categoria, subcategoria')
      .in('categoria', ['Gastos Operacionales', 'Gastos Rifa Apartamento'])
      .limit(10000);
    if (errGastos) throw errGastos;

    // 7. Retiros de ganancia
    const { data: retirosData, error: errRetiros } = await supabase
      .from('gastos')
      .select('id, fecha, monto, descripcion, subcategoria')
      .eq('categoria', 'Retiro de Ganancia')
      .limit(10000);
    if (errRetiros) throw errRetiros;

    let registradas = 0;
    let separadas_cero = 0;
    let libres = 0;
    let pagadas = 0;
    let recaudo_boletas = 0;
    const recaudo_por_asesor = {};
    const total = boletasGlobal.length;

    boletasGlobal.forEach(b => {
        const abonado = Number(b.total_abonado || 0);
        recaudo_boletas += abonado;

        if (!b.telefono_cliente || b.estado === 'LIBRE') {
            libres++;
        } else {
            registradas++;
            if (b.estado === 'Pagada') pagadas++;
            if (!b.total_abonado || abonado === 0) {
                separadas_cero++;
            }
            if (abonado > 0 && b.asesor) {
                recaudo_por_asesor[b.asesor] = (recaudo_por_asesor[b.asesor] || 0) + abonado;
            }
        }
    });

    return res.status(200).json({ 
        status: 'ok', 
        abonos: abonos, 
        ventas: ventas,
        globales: { registradas, separadas_cero, libres, pagadas, total, recaudo_boletas, recaudo_por_asesor },
        chatea: chateaData,
        fb: fbData,
        gastos: gastosData,
        retiros: retirosData
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
