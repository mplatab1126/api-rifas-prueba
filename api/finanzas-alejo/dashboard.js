import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error' });

  const { contrasena } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const nombreLower = nombreAsesor.toLowerCase().trim();
  if (nombreLower !== 'alejo p' && nombreLower !== 'alejo plata') {
    return res.status(403).json({ status: 'error', mensaje: 'Acceso restringido' });
  }

  try {
    const [movsRes, catsRes, cuentasRes, activosRes] = await Promise.all([
      supabase.from('finanzas_alejo_movimientos').select('*').order('fecha', { ascending: false }).limit(50),
      supabase.from('finanzas_alejo_categorias').select('*'),
      supabase.from('finanzas_alejo_cuentas').select('*').eq('activa', true),
      supabase.from('finanzas_alejo_activos').select('*').eq('activo', true)
    ]);

    const movs = movsRes.data || [];
    const cats = catsRes.data || [];
    const cuentas = cuentasRes.data || [];
    const activos = activosRes.data || [];

    const catMap = {};
    for (const c of cats) catMap[c.id] = c.nombre;
    const cuentaMap = {};
    for (const c of cuentas) cuentaMap[c.id] = c.nombre;

    // Saldos por cuenta. Trae todos los movimientos para sumar deltas.
    const saldos = {};
    for (const c of cuentas) saldos[c.id] = Number(c.saldo_inicial || 0);
    const { data: todosMovs } = await supabase
      .from('finanzas_alejo_movimientos')
      .select('tipo, monto, cuenta_id, fecha, categoria_id');
    for (const m of todosMovs || []) {
      if (!m.cuenta_id) continue;
      const delta = m.tipo === 'ingreso' || m.tipo === 'deuda_cobrar' ? Number(m.monto) : -Number(m.monto);
      saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) + delta;
    }

    // Fechas clave
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    const inicio3MesesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1).toISOString().slice(0, 10);
    const finMesPrev = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10);

    // Recorre todos los movimientos una sola vez y acumula lo que necesitamos.
    let ingresosMes = 0, gastosMes = 0, meDeben = 0, gastos3MesesPrev = 0;
    const distribucionMap = {}; // categoria_id -> monto del mes actual
    let mesesPreviosConGastos = new Set();
    for (const m of todosMovs || []) {
      const monto = Number(m.monto);
      if (m.tipo === 'deuda_cobrar') meDeben += monto;
      if (m.fecha >= mesInicio) {
        if (m.tipo === 'ingreso') ingresosMes += monto;
        if (m.tipo === 'gasto') {
          gastosMes += monto;
          const cat = m.categoria_id || 0;
          distribucionMap[cat] = (distribucionMap[cat] || 0) + monto;
        }
      }
      if (m.tipo === 'gasto' && m.fecha >= inicio3MesesPrev && m.fecha <= finMesPrev) {
        gastos3MesesPrev += monto;
        mesesPreviosConGastos.add(m.fecha.slice(0, 7));
      }
    }
    const saldoTotal = Object.values(saldos).reduce((a, b) => a + b, 0);

    // Capital: suma valor_actual (o valor_compra si no hay) de activos vigentes.
    const capital = activos.reduce((acc, a) => {
      const v = a.valor_actual != null ? Number(a.valor_actual) : Number(a.valor_compra || 0);
      return acc + v;
    }, 0);

    // Ahorro y tasa de ahorro del mes actual.
    const ahorroMes = ingresosMes - gastosMes;
    const tasaAhorro = ingresosMes > 0 ? (ahorroMes / ingresosMes) * 100 : null;

    // Fondo de emergencia: meses cubiertos por el saldo liquido al ritmo de gasto promedio.
    // Promedio = gastos de los meses previos con datos / cantidad de meses con datos.
    // Si no hay historia previa, no calculamos (null) para no engañar.
    const cantMesesBase = mesesPreviosConGastos.size;
    const gastoPromedioMensual = cantMesesBase > 0 ? gastos3MesesPrev / cantMesesBase : null;
    const mesesFondoEmergencia = gastoPromedioMensual && gastoPromedioMensual > 0
      ? saldoTotal / gastoPromedioMensual
      : null;

    // Distribución de gastos del mes por categoría, ordenada desc.
    const distribucionGastos = Object.entries(distribucionMap)
      .map(([catId, monto]) => ({
        categoria_id: catId === '0' ? null : Number(catId),
        categoria_nombre: catId === '0' ? 'Sin categoría' : (catMap[catId] || 'Sin categoría'),
        monto,
        porcentaje: gastosMes > 0 ? (monto / gastosMes) * 100 : 0
      }))
      .sort((a, b) => b.monto - a.monto);

    const movimientos = movs.map(m => ({
      ...m,
      categoria_nombre: m.categoria_id ? catMap[m.categoria_id] : null,
      cuenta_nombre: m.cuenta_id ? cuentaMap[m.cuenta_id] : null
    }));

    return res.status(200).json({
      status: 'ok',
      movimientos,
      cuentas: cuentas.map(c => ({ ...c, saldo_actual: saldos[c.id] || 0 })),
      activos,
      distribucion_gastos: distribucionGastos,
      resumen: {
        ingresos_mes: ingresosMes,
        gastos_mes: gastosMes,
        ahorro_mes: ahorroMes,
        tasa_ahorro: tasaAhorro,
        me_deben: meDeben,
        saldo_total: saldoTotal,
        capital,
        patrimonio: saldoTotal + capital + meDeben,
        gasto_promedio_mensual: gastoPromedioMensual,
        meses_fondo_emergencia: mesesFondoEmergencia,
        meses_base_promedio: cantMesesBase
      }
    });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
