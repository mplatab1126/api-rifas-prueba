import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // ─────────────────────────────────────────────────────────────────────
  // GET público: obtener la configuración actual de la rifa
  // Uso: /api/admin/nueva-rifa?tipo=3cifras
  // ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const tipo = req.query?.tipo || '3cifras';
    const { data } = await supabase
      .from('config_rifa_diaria')
      .select('*')
      .eq('tipo', tipo)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.status(200).json({ status: 'ok', config: data || null });
  }

  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { accion, tipo, contrasena, fechaSorteo, horaCierre, loteria, ganadores, totalPagadoGanadores, modoPremio, totalBoletasPremio } = req.body;

  // ─────────────────────────────────────────────────────────────────────
  // POST obtener_historial — historial de rifas por tipo
  // ─────────────────────────────────────────────────────────────────────
  if (accion === 'obtener_historial') {
    const tipoConsulta = tipo || '3cifras';
    const { data, error } = await supabase
      .from('historial_rifas')
      .select('id, fecha_guardado, loteria, vendidas, total_boletas, recaudo_total, ganadores, total_pagado_ganadores, ganancia_neta')
      .eq('tipo', tipoConsulta)
      .order('id', { ascending: true })
      .limit(60);

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    const { data: config } = await supabase
      .from('config_rifa_diaria')
      .select('*')
      .eq('tipo', tipoConsulta)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.status(200).json({ status: 'ok', historial: data || [], config: config || null });
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST obtener_config (también puede llamarse desde el frontend)
  // ─────────────────────────────────────────────────────────────────────
  if (accion === 'obtener_config') {
    const tipoConsulta = tipo || '3cifras';
    const { data } = await supabase
      .from('config_rifa_diaria')
      .select('*')
      .eq('tipo', tipoConsulta)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.status(200).json({ status: 'ok', config: data || null });
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST guardar_y_reiniciar — solo gerencia
  // ─────────────────────────────────────────────────────────────────────
  if (accion === 'guardar_y_reiniciar') {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const nombreAsesor = asesores[contrasena];

    if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
    if (nombreAsesor !== 'Mateo' && nombreAsesor !== 'Alejo P' && nombreAsesor !== 'Alejo Plata') {
      return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede realizar esta acción.' });
    }

    const tablaMap  = { '2cifras': 'boletas_diarias',        '3cifras': 'boletas_diarias_3cifras' };
    const patronMap = { '2cifras': '__',                     '3cifras': '___' };
    const tabla     = tablaMap[tipo];
    const patron    = patronMap[tipo];

    if (!tabla) return res.status(400).json({ status: 'error', mensaje: 'Tipo de rifa inválido. Usa 2cifras o 3cifras.' });
    if (!fechaSorteo || !horaCierre || !loteria) {
      return res.status(400).json({ status: 'error', mensaje: 'Faltan datos: fechaSorteo, horaCierre y loteria son obligatorios.' });
    }

    try {
      // 1. ─── Guardar snapshot histórico ───────────────────────────────
      const { data: boletasActuales } = await supabase
        .from(tabla)
        .select('estado, total_abonado, telefono_cliente');

      const totalBoletas = boletasActuales?.length || 0;
      const vendidas     = boletasActuales?.filter(b => b.estado === 'Pagada').length || 0;
      const pagadas      = vendidas;
      // Se usa total_abonado de cada boleta (se resetea a 0 al iniciar cada rifa),
      // en lugar de sumar la tabla abonos que acumula histórico de todas las rifas.
      const recaudo      = boletasActuales?.reduce((s, b) => s + Number(b.total_abonado || 0), 0) || 0;

      const nGanadores   = Number(ganadores)            || 0;
      const nPagado      = Number(totalPagadoGanadores) || 0;
      const ganancia     = recaudo - nPagado;

      const { error: historialError } = await supabase.from('historial_rifas').insert({
        tipo,
        fecha_guardado:       new Date().toISOString(),
        total_boletas:        totalBoletas,
        vendidas,
        pagadas,
        recaudo_total:        recaudo,
        ganadores:            nGanadores,
        total_pagado_ganadores: nPagado,
        ganancia_neta:        ganancia,
        loteria:              loteria || '',
        creado_por:           nombreAsesor
      });

      // Si no se puede guardar el historial, abortamos ANTES de reiniciar las boletas
      if (historialError) throw new Error('No se pudo guardar el historial: ' + historialError.message);

      // 2. ─── Eliminar abonos de la rifa que termina ────────────────
      const { error: deleteAbonosError } = await supabase
        .from('abonos')
        .delete()
        .eq('tipo', tipo);

      if (deleteAbonosError) throw new Error('No se pudieron limpiar los abonos: ' + deleteAbonosError.message);

      // 3. ─── Reiniciar todas las boletas ──────────────────────────────
      const precioInicial = tipo === '3cifras' ? 5000 : 20000;
      const resetPayload = {
        estado:           'Disponible',
        nombre_cliente:   '',
        telefono_cliente: null,
        total_abonado:    0,
        saldo_restante:   precioInicial,
        asesor:           null,
      };

      const { error: resetError } = await supabase
        .from(tabla)
        .update(resetPayload)
        .neq('numero', '');

      if (resetError) throw resetError;

      // 4. ─── Guardar nueva configuración del sorteo ───────────────────
      await supabase.from('config_rifa_diaria').delete().eq('tipo', tipo);
      const configPayload = {
        tipo,
        fecha_sorteo: fechaSorteo,
        hora_cierre:  horaCierre,
        loteria,
        updated_at:   new Date().toISOString()
      };
      if (tipo === '3cifras' && modoPremio) {
        configPayload.modo_premio = modoPremio;
        if (modoPremio === 'boletas' && totalBoletasPremio > 0) {
          configPayload.total_boletas_premio = Number(totalBoletasPremio);
        }
      }
      const { error: configError } = await supabase.from('config_rifa_diaria').insert(configPayload);
      if (configError) throw configError;

      return res.status(200).json({
        status: 'ok',
        mensaje: `¡Rifa de ${tipo} reiniciada! Se guardó el historial y todas las boletas están disponibles.`,
        snapshot: { totalBoletas, vendidas, pagadas, recaudo }
      });

    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
    }
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida' });
}
