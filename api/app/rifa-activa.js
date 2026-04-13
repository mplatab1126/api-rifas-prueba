/**
 * GET /api/app/rifa-activa
 *
 * Devuelve la informacion de la rifa principal activa y las rifas diarias.
 * Incluye premios, progreso de ventas y fechas.
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

  try {
    // Consultar todo en paralelo
    const [resRifa, resConfig2, resConfig3, resProgreso4, resProgreso2, resProgreso3] = await Promise.all([
      // Rifa principal (la mas reciente)
      supabase
        .from('rifas')
        .select('id, nombre, fecha_inicio, fecha_fin, estado, notas, numero_rifa')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      // Config rifa diaria 2 cifras
      supabase
        .from('config_rifa_diaria')
        .select('fecha_sorteo, hora_cierre, loteria, modo_premio, total_boletas_premio')
        .eq('tipo', '2cifras')
        .limit(1)
        .single(),

      // Config rifa diaria 3 cifras
      supabase
        .from('config_rifa_diaria')
        .select('fecha_sorteo, hora_cierre, loteria, modo_premio, total_boletas_premio')
        .eq('tipo', '3cifras')
        .limit(1)
        .single(),

      // Progreso rifa principal: vendidas vs total
      supabase
        .from('boletas')
        .select('estado', { count: 'exact', head: false }),

      // Progreso diaria 2 cifras
      supabase
        .from('boletas_diarias')
        .select('estado', { count: 'exact', head: false }),

      // Progreso diaria 3 cifras
      supabase
        .from('boletas_diarias_3cifras')
        .select('estado', { count: 'exact', head: false }),
    ]);

    // Premios de la rifa principal
    let premios = [];
    if (resRifa.data?.id) {
      const { data: premiosData } = await supabase
        .from('premios_rifa')
        .select('nombre, valor, descripcion')
        .eq('rifa_id', resRifa.data.id)
        .order('valor', { ascending: false });
      premios = (premiosData || []).map(p => ({
        nombre: p.nombre,
        valor: Number(p.valor || 0),
        descripcion: p.descripcion || '',
      }));
    }

    // Calcular progreso de ventas
    function calcularProgreso(data) {
      const todas = data || [];
      const total = todas.length;
      const vendidas = todas.filter(b => b.estado !== 'Disponible').length;
      const pagadas = todas.filter(b => b.estado === 'Pagada').length;
      return { total, vendidas, pagadas, porcentaje: total > 0 ? Math.round((vendidas / total) * 100) : 0 };
    }

    const rifa = resRifa.data;

    res.status(200).json({
      principal: {
        nombre: rifa?.nombre || 'Rifa Principal',
        numero_rifa: rifa?.numero_rifa || null,
        fecha_inicio: rifa?.fecha_inicio || null,
        fecha_fin: rifa?.fecha_fin || null,
        estado: rifa?.estado || 'activa',
        notas: rifa?.notas || '',
        premios,
        progreso: calcularProgreso(resProgreso4.data),
      },
      diaria_2cifras: {
        fecha_sorteo: resConfig2.data?.fecha_sorteo || null,
        hora_cierre: resConfig2.data?.hora_cierre || null,
        loteria: resConfig2.data?.loteria || '',
        modo_premio: resConfig2.data?.modo_premio || '',
        total_boletas_premio: resConfig2.data?.total_boletas_premio || 0,
        progreso: calcularProgreso(resProgreso2.data),
      },
      diaria_3cifras: {
        fecha_sorteo: resConfig3.data?.fecha_sorteo || null,
        hora_cierre: resConfig3.data?.hora_cierre || null,
        loteria: resConfig3.data?.loteria || '',
        modo_premio: resConfig3.data?.modo_premio || '',
        total_boletas_premio: resConfig3.data?.total_boletas_premio || 0,
        progreso: calcularProgreso(resProgreso3.data),
      },
    });

  } catch (error) {
    console.error('Error en rifa-activa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
