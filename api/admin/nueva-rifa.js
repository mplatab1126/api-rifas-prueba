import { supabase } from '../lib/supabase.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
    let { data, error } = await supabase
      .from('historial_rifas')
      .select('id, fecha_guardado, loteria, vendidas, total_boletas, recaudo_total, ganadores, total_pagado_ganadores, ganancia_neta, modo_premio')
      .eq('tipo', tipoConsulta)
      .order('id', { ascending: true })
      .limit(60);

    if (error && error.message && error.message.includes('modo_premio')) {
      const fallback = await supabase
        .from('historial_rifas')
        .select('id, fecha_guardado, loteria, vendidas, total_boletas, recaudo_total, ganadores, total_pagado_ganadores, ganancia_neta')
        .eq('tipo', tipoConsulta)
        .order('id', { ascending: true })
        .limit(60);
      data = fallback.data;
      error = fallback.error;
    }

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
  // POST actualizar_config — actualizar fecha/lotería sin reiniciar
  // ─────────────────────────────────────────────────────────────────────
  if (accion === 'actualizar_config') {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const nombreAsesor = asesores[contrasena];
    if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
    const { data: permRow } = await supabase.from('permisos_asesores').select('permitido').eq('asesor_nombre', nombreAsesor).eq('pagina_id', 'rifas-menu').maybeSingle();
    const tienePermiso = permRow ? permRow.permitido : ['mateo', 'alejo p', 'alejo plata'].includes(nombreAsesor.toLowerCase().trim());
    if (!tienePermiso) {
      return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso para realizar esta acción. Necesitas acceso a Rifas Diarias.' });
    }

    const tipoRifa = tipo || '3cifras';
    const updates = { updated_at: new Date().toISOString() };
    if (fechaSorteo) updates.fecha_sorteo = fechaSorteo;
    if (loteria) updates.loteria = loteria;

    const { error } = await supabase
      .from('config_rifa_diaria')
      .update(updates)
      .eq('tipo', tipoRifa);

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', mensaje: `Configuración de ${tipoRifa} actualizada.` });
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST guardar_y_reiniciar — asesores con permiso de Rifas Diarias
  // ─────────────────────────────────────────────────────────────────────
  if (accion === 'guardar_y_reiniciar') {
    const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
    const nombreAsesor = asesores[contrasena];

    if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
    const { data: permRow } = await supabase.from('permisos_asesores').select('permitido').eq('asesor_nombre', nombreAsesor).eq('pagina_id', 'rifas-menu').maybeSingle();
    const tienePermiso = permRow ? permRow.permitido : ['mateo', 'alejo p', 'alejo plata'].includes(nombreAsesor.toLowerCase().trim());
    if (!tienePermiso) {
      return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso para reiniciar rifas. Necesitas acceso a Rifas Diarias.' });
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
      const { data: configActual } = await supabase
        .from('config_rifa_diaria')
        .select('modo_premio, total_boletas_premio')
        .eq('tipo', tipo)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: boletasActuales } = await supabase
        .from(tabla)
        .select('estado, total_abonado, telefono_cliente');

      const totalBoletas = boletasActuales?.length || 0;
      const vendidas     = boletasActuales?.filter(b => b.estado === 'Pagada').length || 0;
      const pagadas      = vendidas;
      const recaudo      = boletasActuales?.reduce((s, b) => s + Number(b.total_abonado || 0), 0) || 0;

      const nGanadores   = Number(ganadores)            || 0;
      const nPagado      = Number(totalPagadoGanadores) || 0;
      const ganancia     = recaudo - nPagado;

      const historialPayload = {
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
      };
      if (configActual?.modo_premio) {
        historialPayload.modo_premio = configActual.modo_premio;
      }

      let { error: historialError } = await supabase.from('historial_rifas').insert(historialPayload);

      if (historialError && historialError.message && historialError.message.includes('modo_premio')) {
        delete historialPayload.modo_premio;
        const retry = await supabase.from('historial_rifas').insert(historialPayload);
        historialError = retry.error;
      }

      if (historialError) throw new Error('No se pudo guardar el historial: ' + historialError.message);

      // 2. ─── Eliminar abonos de la rifa que termina ────────────────
      const { error: deleteAbonosError } = await supabase
        .from('abonos')
        .delete()
        .eq('tipo', tipo);

      if (deleteAbonosError) throw new Error('No se pudieron limpiar los abonos: ' + deleteAbonosError.message);

      // 3. ─── Reiniciar todas las boletas ──────────────────────────────
      const precioInicial = tipo === '3cifras' ? PRECIOS.RIFA_3_CIFRAS : PRECIOS.RIFA_2_CIFRAS;
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
