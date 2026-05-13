import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function formatearFechaEs(fechaStr) {
  if (!fechaStr) return '';
  const f = new Date(fechaStr);
  if (Number.isNaN(f.getTime())) return '';
  const d = f.getDate();
  const m = MESES[f.getMonth()];
  const y = f.getFullYear();
  return `${d} de ${m}, ${y}`;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  const { telefono } = req.query;
  if (!telefono) {
    return res.status(400).json({ error: 'Falta el número de teléfono' });
  }

  const last10 = String(telefono).replace(/\D/g, '').slice(-10);
  if (last10.length < 7) {
    return res.status(400).json({ error: 'Número demasiado corto' });
  }

  try {
    const { data: boletas, error: errBoletas } = await supabase
      .from('boletas')
      .select(`
        numero,
        precio_total,
        saldo_restante,
        total_abonado,
        telefono_cliente,
        clientes (telefono, nombre, apellido, ciudad)
      `)
      .like('telefono_cliente', '%' + last10);

    if (errBoletas) throw errBoletas;

    if (!boletas || boletas.length === 0) {
      return res.status(200).json({ encontrado: false });
    }

    const cliente = boletas[0].clientes || {};

    const numerosBoletas = boletas.map(b => b.numero);
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('numero_boleta, monto, fecha_pago')
      .in('numero_boleta', numerosBoletas)
      .order('fecha_pago', { ascending: true });

    if (errAbonos) throw errAbonos;

    const historialPorBoleta = {};
    for (const a of (abonos || [])) {
      const key = String(a.numero_boleta);
      if (!historialPorBoleta[key]) historialPorBoleta[key] = [];
      historialPorBoleta[key].push({
        fecha: formatearFechaEs(a.fecha_pago),
        monto: Number(a.monto)
      });
    }

    const boletasFmt = boletas.map(b => {
      const valorTotal = Number(b.precio_total || 0);
      const totalAbonado = Number(b.total_abonado || 0);
      const saldoPendiente = b.saldo_restante !== null && b.saldo_restante !== undefined
        ? Number(b.saldo_restante)
        : Math.max(0, valorTotal - totalAbonado);
      const estado = saldoPendiente <= 0 ? 'paga' : 'pendiente';
      return {
        numero: b.numero,
        rifa: 'La Plata House',
        valorTotal,
        totalAbonado,
        saldoPendiente,
        estado,
        historial: historialPorBoleta[String(b.numero)] || []
      };
    });

    return res.status(200).json({
      encontrado: true,
      nombre: cliente.nombre || '',
      apellido: cliente.apellido || '',
      ciudad: cliente.ciudad || '',
      telefono: cliente.telefono || telefono,
      boletas: boletasFmt
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
