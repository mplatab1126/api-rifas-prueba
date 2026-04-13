/**
 * GET /api/app/mis-boletas
 *
 * Devuelve todas las boletas del cliente autenticado (los 3 tipos).
 * Requiere token de sesion en el header Authorization.
 *
 * Responde con una lista unificada de boletas con tipo, numero,
 * estado de pago, y datos de la rifa.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  // Validar sesion
  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const last10 = sesion.telefono.slice(-10);

  try {
    // Consultar los 3 tipos de boletas en paralelo
    const [res4, res2, res3, resRifa] = await Promise.all([
      // Boletas de 4 cifras (rifa principal)
      supabase
        .from('boletas')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),

      // Boletas de 2 cifras (diarias)
      supabase
        .from('boletas_diarias')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),

      // Boletas de 3 cifras (diarias)
      supabase
        .from('boletas_diarias_3cifras')
        .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta')
        .like('telefono_cliente', '%' + last10),

      // Info de la rifa actual
      supabase
        .from('rifas')
        .select('nombre, premio_mayor')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (res4.error) throw res4.error;
    if (res2.error) throw res2.error;
    if (res3.error) throw res3.error;

    const nombreRifa = resRifa.data?.nombre || 'Rifa Principal';

    // Unificar boletas con su tipo
    const boletas = [
      ...(res4.data || []).map(b => ({
        ...b,
        tipo: '4cifras',
        tipo_label: 'Principal',
        rifa: nombreRifa,
      })),
      ...(res2.data || []).map(b => ({
        ...b,
        tipo: '2cifras',
        tipo_label: 'Diaria 2 cifras',
        rifa: 'Rifa Diaria',
      })),
      ...(res3.data || []).map(b => ({
        ...b,
        tipo: '3cifras',
        tipo_label: 'Diaria 3 cifras',
        rifa: 'Rifa Diaria',
      })),
    ];

    // Ordenar por fecha de venta (mas recientes primero)
    boletas.sort((a, b) => new Date(b.fecha_venta || 0) - new Date(a.fecha_venta || 0));

    // Calcular totales
    const totalAbonado = boletas.reduce((s, b) => s + Number(b.total_abonado || 0), 0);
    const totalPendiente = boletas.reduce((s, b) => s + Number(b.saldo_restante || 0), 0);

    res.status(200).json({
      cliente: {
        nombre: sesion.nombre,
        telefono: sesion.telefono,
      },
      boletas,
      resumen: {
        total_boletas: boletas.length,
        total_abonado: totalAbonado,
        total_pendiente: totalPendiente,
      },
    });

  } catch (error) {
    console.error('Error en mis-boletas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
