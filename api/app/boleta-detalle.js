/**
 * GET /api/app/boleta-detalle?numero=XXXX&tipo=4cifras
 *
 * Devuelve el detalle completo de UNA boleta del cliente autenticado,
 * incluyendo todos sus abonos (pagos).
 *
 * Query params:
 *   - numero: numero de la boleta (ej: "0523", "07", "045")
 *   - tipo: "4cifras" | "2cifras" | "3cifras"
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

  const { numero, tipo } = req.query;
  if (!numero || !tipo) {
    return res.status(400).json({ error: 'Faltan parametros numero y tipo' });
  }

  const tiposValidos = ['4cifras', '2cifras', '3cifras'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido. Usa: 4cifras, 2cifras o 3cifras' });
  }

  const last10 = sesion.telefono.slice(-10);

  // Tabla segun el tipo
  const tablas = {
    '4cifras': 'boletas',
    '2cifras': 'boletas_diarias',
    '3cifras': 'boletas_diarias_3cifras',
  };

  try {
    // 1. Traer la boleta
    const { data: boleta, error: errBoleta } = await supabase
      .from(tablas[tipo])
      .select('numero, estado, precio_total, total_abonado, saldo_restante, fecha_venta, nombre_cliente, telefono_cliente, asesor')
      .eq('numero', numero)
      .single();

    if (errBoleta || !boleta) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    // Verificar que la boleta pertenece al cliente autenticado
    const telBoleta = String(boleta.telefono_cliente || '').replace(/\D/g, '').slice(-10);
    if (telBoleta !== last10) {
      return res.status(403).json({ error: 'Esta boleta no te pertenece' });
    }

    // 2. Traer los abonos de esta boleta
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('id, monto, fecha_pago, metodo_pago, referencia_transferencia, asesor, created_at')
      .eq('numero_boleta', numero)
      .eq('tipo', tipo)
      .order('created_at', { ascending: false });

    if (errAbonos) throw errAbonos;

    // 3. Calcular progreso de pago
    const precioTotal = Number(boleta.precio_total || 0);
    const totalAbonado = Number(boleta.total_abonado || 0);
    const porcentajePagado = precioTotal > 0 ? Math.round((totalAbonado / precioTotal) * 100) : 0;

    res.status(200).json({
      boleta: {
        numero: boleta.numero,
        tipo,
        estado: boleta.estado,
        precio_total: precioTotal,
        total_abonado: totalAbonado,
        saldo_restante: Number(boleta.saldo_restante || 0),
        porcentaje_pagado: porcentajePagado,
        fecha_venta: boleta.fecha_venta,
        asesor: boleta.asesor,
      },
      abonos: (abonos || []).map(a => ({
        id: a.id,
        monto: Number(a.monto || 0),
        fecha: a.fecha_pago || a.created_at,
        metodo_pago: a.metodo_pago || 'No especificado',
        referencia: a.referencia_transferencia || null,
        asesor: a.asesor,
      })),
      total_abonos: (abonos || []).length,
    });

  } catch (error) {
    console.error('Error en boleta-detalle:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
