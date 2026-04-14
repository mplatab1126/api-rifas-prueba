/**
 * GET /api/app/historial-sorteos
 *
 * Devuelve el historial de sorteos pasados para mostrar en la app.
 * Endpoint publico (no requiere auth).
 *
 * Query params:
 *   tipo: '2cifras' | '3cifras' | 'todos' (default: 'todos')
 *   limite: numero (default: 30)
 *
 * Responde con lista de sorteos pasados de historial_rifas
 * y ganadores recientes de registro_sorteo.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo no permitido' });

  const limite = Math.min(parseInt(req.query.limite) || 30, 60);

  try {
    // 1. Historial de rifas diarias (de historial_rifas)
    const { data: historial, error: errHistorial } = await supabase
      .from('historial_rifas')
      .select('id, fecha_guardado, loteria, numero_ganador, vendidas, total_boletas, recaudo_total, ganadores, total_pagado_ganadores, ganancia_neta, tipo')
      .order('fecha_guardado', { ascending: false })
      .limit(limite);

    if (errHistorial) console.error('Error historial_rifas:', errHistorial);

    // 2. Ganadores recientes del sorteo principal (registro_sorteo)
    const { data: ganadoresRecientes, error: errGanadores } = await supabase
      .from('registro_sorteo')
      .select('nombre_completo, ciudad, numero_boleta, tipo_registro, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (errGanadores) console.error('Error registro_sorteo:', errGanadores);

    // 3. Formatear ganadores con privacidad (ocultar apellido parcialmente)
    const ganadoresFormateados = (ganadoresRecientes || []).map(g => {
      const partes = (g.nombre_completo || '').split(' ');
      const nombreVisible = partes.length > 1
        ? `${partes[0]} ${partes[1][0]}.`
        : partes[0];

      return {
        nombre: nombreVisible,
        ciudad: g.ciudad || '',
        numero: g.numero_boleta,
        fecha: g.created_at,
      };
    });

    res.status(200).json({
      historial: historial || [],
      ganadores: ganadoresFormateados,
    });

  } catch (error) {
    console.error('Error en historial-sorteos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
