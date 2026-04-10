import { supabaseAdmin as supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

// Devuelve el lunes de la semana que contiene la fecha dada (YYYY-MM-DD)
function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Dom, 1=Lun...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function currentMonday() {
  return getMondayOf(new Date().toISOString().split('T')[0]);
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,GET,POST', 'Content-Type')) return;

  // ── GET: devuelve horarios ──
  if (req.method === 'GET') {
    const { semana, todos } = req.query;

    let query = supabase
      .from('horarios_asesores')
      .select('*')
      .order('asesor_nombre')
      .order('dia_semana');

    // Si no se pide "todos", filtrar por semana específica (o la semana actual)
    if (todos !== '1') {
      const semanaFiltro = semana ? getMondayOf(semana) : currentMonday();
      query = query.eq('semana_inicio', semanaFiltro);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', horarios: data });
  }

  // ── POST ──
  if (req.method === 'POST') {
    const { contrasena, accion, horarios, asesor_nombre, semana_inicio,
            semana_origen, semana_destino } = req.body;

    const nombreAsesor = validarAsesor(contrasena);
    if (!nombreAsesor) {
      return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
    }

    const ADMINS = ['mateo', 'alejo p', 'alejo plata'];
    if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'Solo administradores pueden modificar horarios.'
      });
    }

    // Acción: guardar_semana — guarda todos los bloques de una semana
    if (accion === 'guardar_semana') {
      if (!Array.isArray(horarios) || !horarios.length) {
        return res.status(400).json({ status: 'error', mensaje: 'Array de horarios vacío.' });
      }

      const rows = horarios.map(h => ({
        asesor_nombre: h.asesor_nombre,
        semana_inicio: getMondayOf(h.semana_inicio || currentMonday()),
        dia_semana:    parseInt(h.dia_semana),
        hora_inicio:   h.trabaja ? h.hora_inicio : null,
        hora_fin:      h.trabaja ? h.hora_fin    : null,
        trabaja:       !!h.trabaja,
        notas:         h.notas || '',
        color:         h.color || '#4eb082'
      }));

      const { error } = await supabase
        .from('horarios_asesores')
        .upsert(rows, { onConflict: 'asesor_nombre,semana_inicio,dia_semana' });

      if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', guardados: rows.length });
    }

    // Acción: eliminar_asesor — elimina los horarios de un asesor (de la semana o de todas)
    if (accion === 'eliminar_asesor') {
      let query = supabase
        .from('horarios_asesores')
        .delete()
        .eq('asesor_nombre', asesor_nombre);

      if (semana_inicio) {
        query = query.eq('semana_inicio', getMondayOf(semana_inicio));
      }

      const { error } = await query;
      if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok' });
    }

    // Acción: copiar_semana — copia los horarios de una semana origen a una destino
    if (accion === 'copiar_semana') {
      if (!semana_origen || !semana_destino) {
        return res.status(400).json({ status: 'error', mensaje: 'Faltan semana_origen o semana_destino.' });
      }

      const origen  = getMondayOf(semana_origen);
      const destino = getMondayOf(semana_destino);

      const { data: filas, error: errLeer } = await supabase
        .from('horarios_asesores')
        .select('*')
        .eq('semana_inicio', origen);

      if (errLeer) return res.status(500).json({ status: 'error', mensaje: errLeer.message });
      if (!filas || !filas.length) {
        return res.status(404).json({ status: 'error', mensaje: 'La semana origen no tiene horarios registrados.' });
      }

      const nuevasFilas = filas.map(({ id, created_at, updated_at, semana_inicio: _s, ...rest }) => ({
        ...rest,
        semana_inicio: destino
      }));

      const { error: errGuardar } = await supabase
        .from('horarios_asesores')
        .upsert(nuevasFilas, { onConflict: 'asesor_nombre,semana_inicio,dia_semana' });

      if (errGuardar) return res.status(500).json({ status: 'error', mensaje: errGuardar.message });
      return res.status(200).json({ status: 'ok', copiados: nuevasFilas.length });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });
  }

  return res.status(405).json({ status: 'error', mensaje: 'Método no permitido.' });
}
