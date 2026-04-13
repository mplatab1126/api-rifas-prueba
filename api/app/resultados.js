/**
 * GET /api/app/resultados
 *
 * Devuelve resultados de sorteos pasados (ganadores) y el historial
 * de rifas diarias completadas.
 *
 * Query params opcionales:
 *   - limite: numero maximo de resultados (default 20)
 *
 * No requiere autenticacion (info publica).
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const limite = Math.min(Number(req.query.limite) || 20, 100);

  try {
    // Consultar en paralelo
    const [resSorteo, resHistorial] = await Promise.all([
      // Ganadores de la rifa principal
      supabase
        .from('registro_sorteo')
        .select('nombre_completo, ciudad, numero_boleta, tipo_registro, created_at')
        .order('created_at', { ascending: false })
        .limit(limite),

      // Historial de rifas diarias completadas
      supabase
        .from('historial_rifas')
        .select('tipo, fecha_guardado, loteria, vendidas, total_boletas, pagadas, recaudo_total, ganancia_neta, modo_premio')
        .order('fecha_guardado', { ascending: false })
        .limit(limite),
    ]);

    if (resSorteo.error) throw resSorteo.error;
    if (resHistorial.error) throw resHistorial.error;

    // Formatear ganadores (ocultar datos sensibles)
    const ganadores = (resSorteo.data || []).map(g => ({
      nombre: g.nombre_completo || 'Ganador',
      ciudad: g.ciudad || '',
      numero_boleta: g.numero_boleta,
      fecha: g.created_at,
    }));

    // Formatear historial de diarias
    const historialDiarias = (resHistorial.data || []).map(h => ({
      tipo: h.tipo,
      tipo_label: h.tipo === '2cifras' ? 'Diaria 2 cifras' : 'Diaria 3 cifras',
      fecha: h.fecha_guardado,
      loteria: h.loteria || '',
      vendidas: h.vendidas || 0,
      total_boletas: h.total_boletas || 0,
      recaudo_total: Number(h.recaudo_total || 0),
      ganancia_neta: Number(h.ganancia_neta || 0),
      modo_premio: h.modo_premio || '',
    }));

    res.status(200).json({
      ganadores_principal: ganadores,
      historial_diarias: historialDiarias,
    });

  } catch (error) {
    console.error('Error en resultados:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
