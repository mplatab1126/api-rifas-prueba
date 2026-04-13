/**
 * GET /api/app/mis-abonos
 *
 * Devuelve el historial de TODOS los abonos (pagos) del cliente
 * autenticado, de todas sus boletas.
 *
 * Query params opcionales:
 *   - tipo: "4cifras" | "2cifras" | "3cifras" (filtrar por tipo)
 *   - limite: numero maximo de resultados (default 50)
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

  const { tipo, limite } = req.query;
  const last10 = sesion.telefono.slice(-10);
  const lim = Math.min(Number(limite) || 50, 200);

  try {
    // Primero obtener los numeros de boleta del cliente
    const [res4, res2, res3] = await Promise.all([
      (!tipo || tipo === '4cifras')
        ? supabase.from('boletas').select('numero').like('telefono_cliente', '%' + last10)
        : { data: [] },
      (!tipo || tipo === '2cifras')
        ? supabase.from('boletas_diarias').select('numero').like('telefono_cliente', '%' + last10)
        : { data: [] },
      (!tipo || tipo === '3cifras')
        ? supabase.from('boletas_diarias_3cifras').select('numero').like('telefono_cliente', '%' + last10)
        : { data: [] },
    ]);

    // Mapear boletas a sus tipos
    const boletasMap = {};
    (res4.data || []).forEach(b => { boletasMap[b.numero + '_4cifras'] = '4cifras'; });
    (res2.data || []).forEach(b => { boletasMap[b.numero + '_2cifras'] = '2cifras'; });
    (res3.data || []).forEach(b => { boletasMap[b.numero + '_3cifras'] = '3cifras'; });

    const numeros4 = (res4.data || []).map(b => b.numero);
    const numeros2 = (res2.data || []).map(b => b.numero);
    const numeros3 = (res3.data || []).map(b => b.numero);
    const todosNumeros = [...numeros4, ...numeros2, ...numeros3];

    if (todosNumeros.length === 0) {
      return res.status(200).json({ abonos: [], total: 0 });
    }

    // Traer abonos de todas las boletas del cliente
    let query = supabase
      .from('abonos')
      .select('id, numero_boleta, monto, fecha_pago, metodo_pago, referencia_transferencia, asesor, tipo, created_at')
      .in('numero_boleta', todosNumeros)
      .order('created_at', { ascending: false })
      .limit(lim);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data: abonos, error: errAbonos } = await query;
    if (errAbonos) throw errAbonos;

    const tipoLabels = {
      '4cifras': 'Principal',
      '2cifras': 'Diaria 2 cifras',
      '3cifras': 'Diaria 3 cifras',
    };

    const abonosFormateados = (abonos || []).map(a => ({
      id: a.id,
      numero_boleta: a.numero_boleta,
      tipo: a.tipo,
      tipo_label: tipoLabels[a.tipo] || a.tipo,
      monto: Number(a.monto || 0),
      fecha: a.fecha_pago || a.created_at,
      metodo_pago: a.metodo_pago || 'No especificado',
      referencia: a.referencia_transferencia || null,
      asesor: a.asesor,
    }));

    const totalPagado = abonosFormateados.reduce((s, a) => s + a.monto, 0);

    res.status(200).json({
      abonos: abonosFormateados,
      total: abonosFormateados.length,
      total_pagado: totalPagado,
    });

  } catch (error) {
    console.error('Error en mis-abonos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
