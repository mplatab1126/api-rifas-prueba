/**
 * GET /api/app/estado-cuenta
 *
 * Resumen financiero completo del cliente: todas sus boletas,
 * cuanto ha pagado, cuanto debe, y un historial de movimientos.
 *
 * Requiere token de sesion en Authorization header.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const last10 = sesion.telefono.slice(-10);

  try {
    // Consultar todo en paralelo
    const [res4, res2, res3] = await Promise.all([
      supabase
        .from('boletas')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),
      supabase
        .from('boletas_diarias')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),
      supabase
        .from('boletas_diarias_3cifras')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),
    ]);

    if (res4.error) throw res4.error;
    if (res2.error) throw res2.error;
    if (res3.error) throw res3.error;

    // Unificar boletas
    const todasBoletas = [
      ...(res4.data || []).map(b => ({ ...b, tipo: '4cifras' })),
      ...(res2.data || []).map(b => ({ ...b, tipo: '2cifras' })),
      ...(res3.data || []).map(b => ({ ...b, tipo: '3cifras' })),
    ];

    // Calcular resumen financiero
    let totalComprado = 0;
    let totalAbonado = 0;
    let totalPendiente = 0;
    let boletasPagadas = 0;
    let boletasPendientes = 0;

    const detallePorTipo = {
      '4cifras': { cantidad: 0, abonado: 0, pendiente: 0 },
      '2cifras': { cantidad: 0, abonado: 0, pendiente: 0 },
      '3cifras': { cantidad: 0, abonado: 0, pendiente: 0 },
    };

    for (const b of todasBoletas) {
      const precio = Number(b.precio_total || 0);
      const abonado = Number(b.total_abonado || 0);
      const pendiente = Number(b.saldo_restante || 0);

      totalComprado += precio;
      totalAbonado += abonado;
      totalPendiente += pendiente;

      if (b.estado === 'Pagada') {
        boletasPagadas++;
      } else {
        boletasPendientes++;
      }

      detallePorTipo[b.tipo].cantidad++;
      detallePorTipo[b.tipo].abonado += abonado;
      detallePorTipo[b.tipo].pendiente += pendiente;
    }

    // Traer ultimos abonos para el timeline
    const todosNumeros = todasBoletas.map(b => b.numero);
    let ultimosAbonos = [];

    if (todosNumeros.length > 0) {
      const { data: abonos } = await supabase
        .from('abonos')
        .select('numero_boleta, monto, fecha_pago, metodo_pago, tipo, created_at')
        .in('numero_boleta', todosNumeros)
        .order('created_at', { ascending: false })
        .limit(20);

      ultimosAbonos = (abonos || []).map(a => ({
        numero_boleta: a.numero_boleta,
        tipo: a.tipo,
        monto: Number(a.monto || 0),
        fecha: a.fecha_pago || a.created_at,
        metodo_pago: a.metodo_pago || 'No especificado',
      }));
    }

    const porcentajeGeneral = totalComprado > 0
      ? Math.round((totalAbonado / totalComprado) * 100)
      : 0;

    res.status(200).json({
      resumen: {
        total_boletas: todasBoletas.length,
        boletas_pagadas: boletasPagadas,
        boletas_pendientes: boletasPendientes,
        total_comprado: totalComprado,
        total_abonado: totalAbonado,
        total_pendiente: totalPendiente,
        porcentaje_pagado: porcentajeGeneral,
      },
      por_tipo: {
        principal: {
          cantidad: detallePorTipo['4cifras'].cantidad,
          abonado: detallePorTipo['4cifras'].abonado,
          pendiente: detallePorTipo['4cifras'].pendiente,
        },
        diaria_2cifras: {
          cantidad: detallePorTipo['2cifras'].cantidad,
          abonado: detallePorTipo['2cifras'].abonado,
          pendiente: detallePorTipo['2cifras'].pendiente,
        },
        diaria_3cifras: {
          cantidad: detallePorTipo['3cifras'].cantidad,
          abonado: detallePorTipo['3cifras'].abonado,
          pendiente: detallePorTipo['3cifras'].pendiente,
        },
      },
      ultimos_pagos: ultimosAbonos,
    });

  } catch (error) {
    console.error('Error en estado-cuenta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
