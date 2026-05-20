import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

// Devuelve la lista de rifas disponibles para el selector de rendimiento de 4 cifras:
// - La rifa actual (rifa_id = 'actual')
// - Cada rifa archivada en boletas_historico (con su nombre, recaudo y rango de fechas)
export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { contrasena } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  if (!['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor)) {
    return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia.' });
  }

  try {
    // Rifa actual: nombre desde la tabla rifas (la última que esté activa o planificada)
    const { data: rifaActual } = await supabase
      .from('rifas')
      .select('id, nombre, fecha_inicio, fecha_fin, estado, numero_rifa')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Rifas archivadas: agrupadas desde boletas_historico
    const { data: archivadas, error } = await supabase
      .from('boletas_historico')
      .select('rifa_id, rifa_nombre, total_abonado, fecha_archivado')
      .limit(200000);
    if (error) throw error;

    const mapa = new Map();
    for (const b of (archivadas || [])) {
      if (!mapa.has(b.rifa_id)) {
        mapa.set(b.rifa_id, { rifa_id: b.rifa_id, nombre: b.rifa_nombre, fecha_archivado: b.fecha_archivado, recaudo: 0 });
      }
      mapa.get(b.rifa_id).recaudo += Number(b.total_abonado || 0);
    }

    // Para cada rifa archivada, traer el rango real de fecha_pago desde abonos_historico
    const idsHistoricos = [...mapa.keys()];
    if (idsHistoricos.length > 0) {
      for (const rifaId of idsHistoricos) {
        const { data: rango } = await supabase
          .from('abonos_historico')
          .select('fecha_pago')
          .eq('rifa_id', rifaId)
          .order('fecha_pago', { ascending: true })
          .limit(1);
        const { data: rangoMax } = await supabase
          .from('abonos_historico')
          .select('fecha_pago')
          .eq('rifa_id', rifaId)
          .order('fecha_pago', { ascending: false })
          .limit(1);
        const reg = mapa.get(rifaId);
        reg.fecha_inicio = rango?.[0]?.fecha_pago || null;
        reg.fecha_fin = rangoMax?.[0]?.fecha_pago || null;
      }
    }

    // Orden cronológico ascendente: la primera rifa archivada va primero,
    // la más reciente al final. La rifa "actual" se mostrará después de estas.
    const historicas = [...mapa.values()]
      .sort((a, b) => new Date(a.fecha_archivado) - new Date(b.fecha_archivado));

    return res.status(200).json({
      status: 'ok',
      actual: rifaActual ? {
        rifa_id: 'actual',
        nombre: rifaActual.nombre,
        fecha_inicio: rifaActual.fecha_inicio,
        fecha_fin: rifaActual.fecha_fin,
        estado: rifaActual.estado,
        numero_rifa: rifaActual.numero_rifa
      } : { rifa_id: 'actual', nombre: 'Rifa Actual' },
      historicas
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
