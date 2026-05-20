import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { contrasena, tipo = '4cifras', rifa_id = null } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  // Agregué Alejo Plata por si acaso también usa ese alias
  if (nombreAsesor !== 'Mateo' && nombreAsesor !== 'Alejo P' && nombreAsesor !== 'Alejo Plata') {
    return res.status(403).json({
      status: 'error',
      mensaje: 'Acceso Denegado: Solo gerencia tiene permisos para ver el rendimiento de la empresa.'
    });
  }

  // ─── Modo histórico: cuando se pide una rifa pasada por su rifa_id ───
  // Solo usa abonos_historico y boletas_historico filtrando por rifa_id.
  // Las demás fuentes (chatea, fb, gastos) no aplican a rifas archivadas.
  const esHistorico = rifa_id && /^[0-9a-f-]{36}$/i.test(rifa_id);
  if (esHistorico) {
    return await responderHistorico({ res, rifa_id });
  }

  // ─── Modo "todas las rifas": combina la rifa actual + todas las históricas ───
  if (rifa_id === 'todas') {
    return await responderTodasLasRifas({ res });
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
        .map(b => ({ n: b.numero, a: Number(b.total_abonado || 0), s: b.asesor || '', f: b.fecha_venta || null, p: b.estado === 'Pagada' }));

    const precioMap = { '2cifras': PRECIOS.RIFA_2_CIFRAS, '3cifras': PRECIOS.RIFA_3_CIFRAS, '4cifras': PRECIOS.RIFA_4_CIFRAS };
    const precio_boleta = precioMap[tipo] || PRECIOS.RIFA_4_CIFRAS;

    return res.status(200).json({
        status: 'ok',
        abonos: abonos,
        ventas: ventas,
        globales: { registradas, separadas_cero, libres, pagadas, total, recaudo_boletas, recaudo_por_asesor, precio_boleta },
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

// ────────────────────────────────────────────────────────────────────────────
// Responder con datos de una rifa pasada (modo histórico).
// Lee de abonos_historico y boletas_historico.
// ────────────────────────────────────────────────────────────────────────────
async function responderHistorico({ res, rifa_id }) {
  try {
    // Abonos individuales de la rifa (puede ser miles, paginamos por seguridad)
    const { data: abonosH, error: errA } = await supabase
      .from('abonos_historico')
      .select('numero_boleta, monto, fecha_pago, asesor')
      .eq('rifa_id', rifa_id)
      .limit(100000);
    if (errA) throw errA;

    // Snapshot del estado final de cada boleta
    const { data: boletasH, error: errB } = await supabase
      .from('boletas_historico')
      .select('numero, estado, total_abonado, asesor, telefono_cliente, precio_total, fecha_venta, rifa_nombre')
      .eq('rifa_id', rifa_id)
      .limit(100000);
    if (errB) throw errB;

    if (!boletasH || boletasH.length === 0) {
      return res.status(404).json({ status: 'error', mensaje: 'Rifa histórica no encontrada o sin datos.' });
    }

    // Adaptar abonos al mismo shape que usa el frontend
    const abonos = (abonosH || []).map(a => ({
      monto: Number(a.monto || 0),
      fecha_pago: a.fecha_pago,
      asesor: a.asesor,
      numero_boleta: a.numero_boleta,
      tipo: '4cifras'
    }));

    // Calcular agregados desde el snapshot de boletas (la verdad oficial)
    let registradas = 0, separadas_cero = 0, libres = 0, pagadas = 0, recaudo_boletas = 0;
    const recaudo_por_asesor = {};
    const PRECIO_DEFAULT = Number(boletasH[0]?.precio_total) || 80000;

    boletasH.forEach(b => {
      const abonado = Number(b.total_abonado || 0);
      recaudo_boletas += abonado;
      const tieneCliente = !!b.telefono_cliente || abonado > 0 || (b.estado && b.estado !== 'LIBRE' && b.estado !== 'Disponible');
      if (!tieneCliente) {
        libres++;
      } else {
        registradas++;
        if (b.estado === 'Pagada') pagadas++;
        if (abonado === 0) separadas_cero++;
        if (abonado > 0 && b.asesor) {
          recaudo_por_asesor[b.asesor] = (recaudo_por_asesor[b.asesor] || 0) + abonado;
        }
      }
    });

    // Detalle de boletas para los gráficos del frontend
    const boletas_detalle = boletasH
      .filter(b => Number(b.total_abonado || 0) > 0 || b.estado === 'Pagada' || (b.telefono_cliente && b.estado !== 'Disponible'))
      .map(b => ({
        n: b.numero,
        a: Number(b.total_abonado || 0),
        s: b.asesor || '',
        f: b.fecha_venta || null,
        p: b.estado === 'Pagada'
      }));

    // El total es la cuenta de filas del snapshot (rifa de 4cifras = 10000 idealmente)
    const total = Math.max(boletasH.length, registradas + libres);

    return res.status(200).json({
      status: 'ok',
      modo: 'historico',
      rifa_id,
      rifa_nombre: boletasH[0].rifa_nombre,
      abonos,
      ventas: [],
      globales: {
        registradas,
        separadas_cero,
        libres,
        pagadas,
        total,
        recaudo_boletas,
        recaudo_por_asesor,
        precio_boleta: PRECIO_DEFAULT
      },
      boletas_detalle,
      chatea: [],
      fb: [],
      gastos: [],
      retiros: [],
      todosGastos: []
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Responder con datos de TODAS las rifas combinadas (rifa actual + históricas).
// Suma abonos y boletas de las 3 tablas. Para la rifa actual usa el snapshot
// vivo de `boletas` y los abonos de `abonos`. Para las pasadas, abonos_historico
// y boletas_historico.
// ────────────────────────────────────────────────────────────────────────────
async function responderTodasLasRifas({ res }) {
  try {
    // 1. Abonos: actuales (tipo=4cifras) + históricos (todas las rifas)
    const [abonosActResp, abonosHistResp] = await Promise.all([
      supabase.from('abonos').select('monto, fecha_pago, asesor, numero_boleta').eq('tipo', '4cifras').limit(100000),
      supabase.from('abonos_historico').select('monto, fecha_pago, asesor, numero_boleta, rifa_nombre').limit(200000),
    ]);
    if (abonosActResp.error)  throw abonosActResp.error;
    if (abonosHistResp.error) throw abonosHistResp.error;

    const abonos = [
      ...(abonosActResp.data || []).map(a => ({ ...a, tipo: '4cifras' })),
      ...(abonosHistResp.data || []).map(a => ({ ...a, tipo: '4cifras' })),
    ];

    // 2. Boletas: actuales (tabla boletas) + snapshots históricos
    const [boletasActResp, boletasHistResp] = await Promise.all([
      supabase.from('boletas').select('numero, estado, total_abonado, telefono_cliente, asesor, fecha_venta').limit(100000),
      supabase.from('boletas_historico').select('numero, estado, total_abonado, telefono_cliente, asesor, fecha_venta, rifa_nombre').limit(200000),
    ]);
    if (boletasActResp.error)  throw boletasActResp.error;
    if (boletasHistResp.error) throw boletasHistResp.error;

    const boletas = [
      ...(boletasActResp.data || []),
      ...(boletasHistResp.data || []),
    ];

    // 3. Agregados acumulados
    let registradas = 0, separadas_cero = 0, libres = 0, pagadas = 0, recaudo_boletas = 0;
    const recaudo_por_asesor = {};

    boletas.forEach(b => {
      const abonado = Number(b.total_abonado || 0);
      recaudo_boletas += abonado;
      const tieneCliente = !!b.telefono_cliente || abonado > 0 || (b.estado && b.estado !== 'LIBRE' && b.estado !== 'Disponible');
      if (!tieneCliente) {
        libres++;
      } else {
        registradas++;
        if (b.estado === 'Pagada') pagadas++;
        if (abonado === 0) separadas_cero++;
        if (abonado > 0 && b.asesor) {
          recaudo_por_asesor[b.asesor] = (recaudo_por_asesor[b.asesor] || 0) + abonado;
        }
      }
    });

    const boletas_detalle = boletas
      .filter(b => Number(b.total_abonado || 0) > 0 || b.estado === 'Pagada' || (b.telefono_cliente && b.estado !== 'Disponible' && b.estado !== 'LIBRE'))
      .map(b => ({
        n: b.numero,
        a: Number(b.total_abonado || 0),
        s: b.asesor || '',
        f: b.fecha_venta || null,
        p: b.estado === 'Pagada'
      }));

    return res.status(200).json({
      status: 'ok',
      modo: 'todas',
      rifa_nombre: 'Histórico Total (todas las rifas)',
      abonos,
      ventas: [],
      globales: {
        registradas,
        separadas_cero,
        libres,
        pagadas,
        total: boletas.length,
        recaudo_boletas,
        recaudo_por_asesor,
        precio_boleta: PRECIOS.RIFA_4_CIFRAS
      },
      boletas_detalle,
      chatea: [],
      fb: [],
      gastos: [],
      retiros: [],
      todosGastos: []
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
