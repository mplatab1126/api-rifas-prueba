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
    const [movsRes, catsRes, cuentasRes] = await Promise.all([
      supabase.from('finanzas_alejo_movimientos').select('*').order('fecha', { ascending: false }).limit(50),
      supabase.from('finanzas_alejo_categorias').select('*'),
      supabase.from('finanzas_alejo_cuentas').select('*').eq('activa', true)
    ]);

    const movs = movsRes.data || [];
    const cats = catsRes.data || [];
    const cuentas = cuentasRes.data || [];

    const catMap = {};
    for (const c of cats) catMap[c.id] = c.nombre;
    const cuentaMap = {};
    for (const c of cuentas) cuentaMap[c.id] = c.nombre;

    // Saldos por cuenta
    const saldos = {};
    for (const c of cuentas) saldos[c.id] = Number(c.saldo_inicial || 0);
    const { data: todosMovs } = await supabase.from('finanzas_alejo_movimientos').select('tipo, monto, cuenta_id');
    for (const m of todosMovs || []) {
      if (!m.cuenta_id) continue;
      const delta = m.tipo === 'ingreso' || m.tipo === 'deuda_cobrar' ? Number(m.monto) : -Number(m.monto);
      saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) + delta;
    }

    // Resumen del mes actual
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    let ingresosMes = 0, gastosMes = 0, meDeben = 0;
    for (const m of todosMovs || []) {
      const monto = Number(m.monto);
      if (m.tipo === 'deuda_cobrar') meDeben += monto;
    }
    for (const m of movs) {
      if (m.fecha >= mesInicio) {
        if (m.tipo === 'ingreso') ingresosMes += Number(m.monto);
        if (m.tipo === 'gasto') gastosMes += Number(m.monto);
      }
    }
    const saldoTotal = Object.values(saldos).reduce((a, b) => a + b, 0);

    const movimientos = movs.map(m => ({
      ...m,
      categoria_nombre: m.categoria_id ? catMap[m.categoria_id] : null,
      cuenta_nombre: m.cuenta_id ? cuentaMap[m.cuenta_id] : null
    }));

    return res.status(200).json({
      status: 'ok',
      movimientos,
      cuentas: cuentas.map(c => ({ ...c, saldo_actual: saldos[c.id] || 0 })),
      resumen: {
        ingresos_mes: ingresosMes,
        gastos_mes: gastosMes,
        me_deben: meDeben,
        saldo_total: saldoTotal
      }
    });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
