import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

// IDs de las etiquetas de pago en ChateaPro
// Línea 1: [LPR] Boleta pagada=141197, [LPR] Abono=141213, [LPR] Boleta separada sin dinero=141219
// Línea 2: [LPR] Boleta pagada=215707, [LPR] Abono=215709, [LPR] Boleta separada sin dinero=215711
const ETIQUETAS_L1 = [141197, 141213, 141219];
const ETIQUETAS_L2 = [215707, 215709, 215711];

async function fetchSubscribersByLabel(token, labelId) {
  const subs = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 100) {
    const resp = await fetch(`https://chateapro.app/api/subscribers?label_id=${labelId}&limit=100&page=${page}`, {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (resp.data && resp.data.length > 0) {
      subs.push(...resp.data);
      hasMore = resp.meta && page < resp.meta.last_page;
      page++;
    } else {
      hasMore = false;
    }
  }
  return subs;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { contrasena } = req.body;
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const TOKEN_L1 = process.env.CHATEA_TOKEN_LINEA_1;
  const TOKEN_L2 = process.env.CHATEA_TOKEN_LINEA_2;

  try {
    // 1. Obtener todos los suscriptores con alguna de las 3 etiquetas de pago (ambas líneas)
    const phonesPagados = new Set();

    const consultasEtiquetas = [
      ...ETIQUETAS_L1.map(id => ({ token: TOKEN_L1, labelId: id })),
      ...ETIQUETAS_L2.map(id => ({ token: TOKEN_L2, labelId: id }))
    ];

    for (const { token, labelId } of consultasEtiquetas) {
      const subs = await fetchSubscribersByLabel(token, labelId);
      for (const s of subs) {
        if (s.phone) {
          const last10 = String(s.phone).replace(/\D/g, '').slice(-10);
          phonesPagados.add(last10);
        }
      }
    }

    // 2. Obtener boletas activas de Supabase
    const { data: boletas, error } = await supabase
      .from('boletas')
      .select('numero, asesor, fecha_venta, telefono_cliente, estado, total_abonado, saldo_restante, clientes(nombre, apellido)')
      .not('telefono_cliente', 'is', null)
      .neq('estado', 'LIBRE');

    if (error) throw error;

    // 3. Quedarnos solo con los que NO tienen etiqueta de pago en ChateaPro
    const sinEtiqueta = (boletas || []).filter(b => {
      const last10 = String(b.telefono_cliente).replace(/\D/g, '').slice(-10);
      return !phonesPagados.has(last10);
    });

    // 4. Formatear y ordenar de más antigua a más reciente
    const lista = sinEtiqueta.map(b => ({
      numero: b.numero,
      nombre: b.clientes ? `${b.clientes.nombre || ''} ${b.clientes.apellido || ''}`.trim() : 'Sin nombre',
      telefono: b.telefono_cliente || '',
      asesor: b.asesor || '—',
      fecha_venta: b.fecha_venta || null,
      total_abonado: Number(b.total_abonado) || 0,
      saldo_restante: Number(b.saldo_restante) || 0,
      estado: b.estado || '—'
    })).sort((a, b) => {
      if (!a.fecha_venta) return 1;
      if (!b.fecha_venta) return -1;
      return new Date(a.fecha_venta) - new Date(b.fecha_venta);
    });

    return res.status(200).json({
      status: 'ok',
      lista,
      total: lista.length,
      total_boletas_activas: boletas?.length || 0,
      total_con_etiqueta: (boletas?.length || 0) - lista.length
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
