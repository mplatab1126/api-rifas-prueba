/**
 * GET /api/app/ganadores-principales
 *
 * Devuelve los ganadores de las rifas principales (4 cifras)
 * con toda la info del premio para mostrar tarjetas en la app.
 *
 * No requiere autenticacion — es publico.
 *
 * Responde:
 * {
 *   ganadores: [
 *     {
 *       id, nombre_ganador, ciudad, numero_boleta,
 *       premio_nombre, premio_descripcion, premio_imagen_url, premio_valor,
 *       loteria, fecha_sorteo, orden,
 *       rifa_nombre
 *     }
 *   ]
 * }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo no permitido' });

  try {
    const { data: ganadores, error } = await supabase
      .from('ganadores_principales')
      .select(`
        id, nombre_ganador, ciudad, numero_boleta,
        premio_nombre, premio_descripcion, premio_imagen_url, premio_valor,
        loteria, fecha_sorteo, orden, video_url,
        rifas ( nombre )
      `)
      .order('fecha_sorteo', { ascending: false })
      .order('orden', { ascending: true });

    if (error) throw error;

    // Aplanar el nombre de la rifa
    const resultado = (ganadores || []).map(g => ({
      ...g,
      rifa_nombre: g.rifas?.nombre || '',
      rifas: undefined,
    }));

    res.status(200).json({ ganadores: resultado });

  } catch (error) {
    console.error('Error en ganadores-principales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
