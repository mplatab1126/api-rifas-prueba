import { supabase } from '../lib/supabase.js';

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

  // Determinar tabla de boletas según el tipo seleccionado
  const tablaBoletasMap = { '2cifras': 'boletas_diarias', '3cifras': 'boletas_diarias_3cifras', '4cifras': 'boletas' };
  const tablaBoletas = tablaBoletasMap[tipo] || 'boletas';
  const patronLengthMap = { '2cifras': '__', '3cifras': '___', '4cifras': '____' };

  try {
    // 1. Traemos los Abonos filtrados por tipo de boleta
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('monto, fecha_pago, asesor, numero_boleta')
      .eq('tipo', tipo)
      .limit(100000); 
    if (errAbonos) throw errAbonos;

    // 2. Traemos las Ventas filtradas por cifras del número de boleta
    const patronLength = patronLengthMap[tipo] || '____';
    const { data: ventas, error: errVentas } = await supabase
      .from('registro_movimientos')
      .select('created_at, asesor, boleta, detalle')
      .eq('accion', 'Nueva Venta')
      .like('boleta', patronLength)
      .limit(100000); 
    if (errVentas) throw errVentas;

    // 3. Traemos el resumen global de la tabla de boletas correspondiente
    const boletasSelect = tipo === '4cifras'
      ? 'numero, estado, total_abonado, telefono_cliente, asesor, fecha_venta'
      : 'numero, estado, total_abonado, telefono_cliente, asesor';
    const { data: boletasGlobal, error: errBoletas } = await supabase
      .from(tablaBoletas)
      .select(boletasSelect)
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

    // 6. Todos los gastos (excepto Pendientes) con campos extendidos
    const { data: todosGastosData, error: errGastos } = await supabase
      .from('gastos')
      .select('id, fecha, hora, monto, descripcion, categoria, subcategoria, plataforma, reportado_por, referencia, url_comprobante')
      .neq('categoria', 'Pendiente')
      .order('fecha', { ascending: false })
      .limit(15000);
    if (errGastos) throw errGastos;

    const gastosData = (todosGastosData || []).filter(g =>
      ['Gastos Operacionales', 'Gastos Rifa Apartamento'].includes(g.categoria)
    );
    const retirosData = (todosGastosData || []).filter(g =>
      g.categoria === 'Retiro de Ganancia'
    );

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

    const boletas_detalle = boletasGlobal
        .filter(b => b.telefono_cliente && b.estado !== 'LIBRE')
        .map(b => ({ n: b.numero, a: Number(b.total_abonado || 0), s: b.asesor || '', f: b.fecha_venta || null }));

    return res.status(200).json({ 
        status: 'ok', 
        abonos: abonos, 
        ventas: ventas,
        globales: { registradas, separadas_cero, libres, pagadas, total, recaudo_boletas, recaudo_por_asesor },
        boletas_detalle,
        chatea: chateaData,
        fb: fbData,
        gastos: gastosData,
        retiros: retirosData,
        todosGastos: todosGastosData || []
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
