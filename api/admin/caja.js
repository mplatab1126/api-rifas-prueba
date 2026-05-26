import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { listarIndependientes } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { accion, contrasena, ...payload } = req.body;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const FECHA_CORTE_CAJA = '2026-03-17';

  // Fecha de hoy en zona horaria Colombia
  const fechaCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const hoy = fechaCol.getFullYear() + '-' +
    String(fechaCol.getMonth() + 1).padStart(2, '0') + '-' +
    String(fechaCol.getDate()).padStart(2, '0');

  try {

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: estado_caja — ¿Quién tiene la caja abierta hoy?
    // ─────────────────────────────────────────────────────────
    if (accion === 'estado_caja') {
      const { data: ultimo } = await supabase
        .from('movimientos_caja')
        .select('tipo, creado_por, created_at')
        .eq('fecha', hoy)
        .in('tipo', ['apertura', 'cierre'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultimo && ultimo.tipo === 'apertura') {
        return res.status(200).json({ status: 'ok', abierta: true, operador: ultimo.creado_por });
      }
      return res.status(200).json({ status: 'ok', abierta: false, operador: null });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: abrir_caja — Registrar quién abre la caja
    // ─────────────────────────────────────────────────────────
    if (accion === 'abrir_caja') {
      // Verificar que no esté abierta por alguien más
      const { data: ultimo } = await supabase
        .from('movimientos_caja')
        .select('tipo, creado_por')
        .eq('fecha', hoy)
        .in('tipo', ['apertura', 'cierre'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultimo && ultimo.tipo === 'apertura' && ultimo.creado_por !== nombreAsesor) {
        return res.status(403).json({ status: 'error', mensaje: `La caja ya está abierta por ${ultimo.creado_por}. Debes esperar a que la cierre.` });
      }

      // Si ya está abierta por esta persona, no crear duplicado
      if (ultimo && ultimo.tipo === 'apertura' && ultimo.creado_por === nombreAsesor) {
        return res.status(200).json({ status: 'ok', mensaje: 'Caja ya estaba abierta por ti' });
      }

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'apertura',
        monto: 0,
        descripcion: `Caja abierta por ${nombreAsesor}`,
        creado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Caja abierta correctamente' });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: datos — Cargar resumen completo de la caja de hoy
    // ─────────────────────────────────────────────────────────
    if (accion === 'datos') {

      // 1. Base fija del día (con info del origen: heredada del cierre anterior o ajustada manualmente)
      const { data: baseData } = await supabase
        .from('movimientos_caja')
        .select('monto, descripcion, creado_por, created_at')
        .eq('fecha', hoy)
        .eq('tipo', 'base')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseFija = baseData?.monto || 0;

      // baseInfo: contexto adicional para mostrar en la UI de dónde viene esta base.
      // origen = 'heredada' (vino del cierre del día anterior),
      //          'manual'   (Mateo la ajustó con el botón),
      //          'cero'     (no hay base configurada todavía).
      let baseInfo = { origen: 'cero' };
      if (baseData) {
        const desc = baseData.descripcion || '';
        // Match: "Base inicial arrastrada del cierre de YYYY-MM-DD (por Asesor)"
        const m = desc.match(/cierre de (\d{4}-\d{2}-\d{2})\s*\(por\s*(.+?)\)/i);
        if (m) {
          baseInfo = {
            origen: 'heredada',
            desde: m[1],
            por: m[2],
            descripcion: desc
          };
        } else {
          baseInfo = {
            origen: 'manual',
            por: baseData.creado_por,
            descripcion: desc
          };
        }
      }

      // 2. Abonos cobrados en efectivo (desde la fecha de corte en adelante)
      const { data: abonosEfectivo } = await supabase
        .from('abonos')
        .select('asesor, monto, fecha_pago')
        .eq('referencia_transferencia', 'efectivo')
        .gte('fecha_pago', FECHA_CORTE_CAJA);

      const cobradoPorAsesor = {};
      for (const a of (abonosEfectivo || [])) {
        cobradoPorAsesor[a.asesor] = (cobradoPorAsesor[a.asesor] || 0) + a.monto;
      }

      // 3. Movimientos del día (ingresos, salidas, consignaciones, recepciones de HOY para el efectivo esperado)
      const { data: movimientos } = await supabase
        .from('movimientos_caja')
        .select('*')
        .eq('fecha', hoy)
        .in('tipo', ['ingreso', 'salida', 'consignacion', 'recepcion'])
        .order('created_at', { ascending: true });

      let totalIngresos = 0;
      let totalSalidas = 0;
      let totalConsignaciones = 0;
      let totalRecepciones = 0;

      for (const m of (movimientos || [])) {
        if (m.tipo === 'ingreso') totalIngresos += m.monto;
        else if (m.tipo === 'salida') totalSalidas += m.monto;
        else if (m.tipo === 'consignacion') totalConsignaciones += m.monto;
        else if (m.tipo === 'recepcion') totalRecepciones += m.monto;
      }

      // 3b. Recepciones y condonaciones desde la fecha de corte para calcular el pendiente real por asesor
      const { data: todasRecepciones } = await supabase
        .from('movimientos_caja')
        .select('asesor, monto')
        .in('tipo', ['recepcion', 'condonacion'])
        .gte('fecha', FECHA_CORTE_CAJA);

      const recibidoPorAsesor = {};
      for (const r of (todasRecepciones || [])) {
        if (r.asesor) {
          recibidoPorAsesor[r.asesor] = (recibidoPorAsesor[r.asesor] || 0) + r.monto;
        }
      }

      // 4. Calcular pendiente por asesor (cobrado histórico - recibido histórico), separando equipo e independientes
      const listaIndep = await listarIndependientes();
      const setIndep = new Set(listaIndep); // ya viene en lowercase+trim
      const asesoresEquipo = [];
      const asesoresIndependientes = [];
      for (const [asesor, cobrado] of Object.entries(cobradoPorAsesor)) {
        const recibido = recibidoPorAsesor[asesor] || 0;
        const pendiente = cobrado - recibido;
        if (pendiente > 0) {
          const entry = { asesor, pendiente, cobrado, recibido };
          if (setIndep.has(String(asesor).toLowerCase().trim())) {
            asesoresIndependientes.push(entry);
          } else {
            asesoresEquipo.push(entry);
          }
        }
      }

      // "Efectivo en la calle" = solo lo que debe entregar a caja el equipo.
      // El dinero pendiente de los asesores independientes NO cuenta porque
      // ellos manejan su propio efectivo (son externos a la empresa).
      const totalEnCalle = asesoresEquipo.reduce((s, a) => s + a.pendiente, 0);
      const totalEnCalleIndependientes = asesoresIndependientes.reduce((s, a) => s + a.pendiente, 0);

      // Efectivo esperado en caja = Base + Recepciones entregadas + Ingresos extra - Salidas - Consignaciones
      const efectivoFisicoEsperado = baseFija + totalRecepciones + totalIngresos - totalSalidas - totalConsignaciones;

      return res.status(200).json({
        status: 'ok',
        hoy,
        baseFija,
        baseInfo,
        totalEnCalle,
        totalEnCalleIndependientes,
        efectivoFisicoEsperado,
        totalRecepciones,
        totalIngresos,
        totalSalidas,
        totalConsignaciones,
        asesoresEquipo,
        asesoresIndependientes,
        movimientos: movimientos || []
      });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: guardar_base — Ajustar base fija del día
    // ─────────────────────────────────────────────────────────
    if (accion === 'guardar_base') {
      if (nombreAsesor !== 'Mateo') {
        return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede ajustar la base fija.' });
      }
      const monto = Number(payload.monto);
      if (!monto || monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'Monto inválido' });

      // Reemplaza la base de hoy si ya existía
      await supabase.from('movimientos_caja').delete().eq('fecha', hoy).eq('tipo', 'base');

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'base',
        monto,
        descripcion: 'Base fija inicial',
        creado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Base guardada' });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: registrar_movimiento — Ingreso, salida o consignación manual
    // ─────────────────────────────────────────────────────────
    if (accion === 'registrar_movimiento') {
      const { tipo, descripcion, categoria, subcategoria } = payload;
      const monto = Number(payload.monto);

      if (!['ingreso', 'salida', 'consignacion'].includes(tipo)) {
        return res.status(400).json({ status: 'error', mensaje: 'Tipo de movimiento inválido' });
      }
      if (!monto || monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'Monto inválido' });
      if (!descripcion) return res.status(400).json({ status: 'error', mensaje: 'La descripción es obligatoria' });

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo,
        monto,
        descripcion,
        creado_por: nombreAsesor
      });
      if (error) throw error;

      // Si es salida con categoría, también registrar en tabla de gastos
      if (tipo === 'salida' && categoria) {
        const CATS = {
          operacionales:    'Gastos Operacionales',
          rifa_apartamento: 'Gastos Rifa Apartamento',
          construccion:     'Construcción Apartamento',
          rifa_camioneta:   'Rifa Camioneta',
          rifa_santa_teresita: 'Rifa Casa Santa Teresita',
          retiro_ganancia:  'Retiro de Ganancia'
        };
        const catNombre = CATS[categoria];
        if (catNombre) {
          await supabase.from('gastos').insert({
            fecha: hoy,
            monto: Math.round(monto),
            plataforma: 'Efectivo Caja',
            descripcion: descripcion.trim(),
            categoria: catNombre,
            subcategoria: subcategoria || null,
            reportado_por: nombreAsesor,
            categorizado_por: nombreAsesor
          });
        }
      }

      return res.status(200).json({ status: 'ok', mensaje: 'Movimiento guardado' });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: recibir_dinero — El asesor entregó su efectivo a caja
    // ─────────────────────────────────────────────────────────
    if (accion === 'recibir_dinero') {
      const { asesor } = payload;
      const monto = Number(payload.monto);

      if (!asesor) return res.status(400).json({ status: 'error', mensaje: 'Falta el nombre del asesor' });
      if (!monto || monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'Monto inválido' });

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'recepcion',
        monto,
        asesor,
        descripcion: `Recepción de efectivo de ${asesor}`,
        creado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Recepción registrada' });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: condonar_efectivo — Liberar deuda sin afectar caja
    // ─────────────────────────────────────────────────────────
    if (accion === 'condonar_efectivo') {
      const { asesor } = payload;
      const monto = Number(payload.monto);

      if (!asesor) return res.status(400).json({ status: 'error', mensaje: 'Falta el nombre del asesor' });
      if (!monto || monto <= 0) return res.status(400).json({ status: 'error', mensaje: 'Monto inválido' });

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'condonacion',
        monto,
        asesor,
        descripcion: `Liberación de efectivo pendiente de ${asesor}`,
        creado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Efectivo liberado correctamente' });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: cerrar_caja — Guardar arqueo y cerrar el turno
    // ─────────────────────────────────────────────────────────
    if (accion === 'cerrar_caja') {
      const montoContado   = Math.round(Number(payload.montoContado)   || 0);
      const totalEsperado  = Math.round(Number(payload.totalEsperado)  || 0);
      const baseFija       = Math.round(Number(payload.baseFija)       || 0);
      const totalRecaudo   = Math.round(Number(payload.totalRecaudo)   || 0);
      const totalIngresos  = Math.round(Number(payload.totalIngresos)  || 0);
      const totalSalidas   = Math.round(Number(payload.totalSalidas)   || 0);
      const totalConsig    = Math.round(Number(payload.totalConsig)    || 0);
      const observaciones  = (payload.observaciones || '').toString().trim().slice(0, 1000) || null;
      const diferencia     = montoContado - totalEsperado;

      // 1) Guardar el cierre detallado en la tabla nueva
      const { error: errCierre } = await supabase.from('cierres_caja').insert({
        fecha: hoy,
        cerrado_por: nombreAsesor,
        base_fija: baseFija,
        total_recaudo: totalRecaudo,
        total_ingresos: totalIngresos,
        total_salidas: totalSalidas,
        total_consig: totalConsig,
        total_esperado: totalEsperado,
        monto_contado: montoContado,
        diferencia,
        observaciones
      });
      if (errCierre) throw errCierre;

      // 2) Seguir guardando en movimientos_caja (para que la lógica de
      //    "caja abierta/cerrada" del día siga funcionando igual).
      const descBase = `Arqueo por ${nombreAsesor}. Esperado: $${totalEsperado}. Diferencia: $${diferencia}`;
      const desc = observaciones ? `${descBase}. Obs: ${observaciones}` : descBase;
      const { error: errMov } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'cierre',
        monto: montoContado,
        descripcion: desc,
        creado_por: nombreAsesor
      });
      if (errMov) throw errMov;

      // 3) Trasladar el efectivo contado como base del día siguiente.
      //    Así el dinero físico se "arrastra" entre días en vez de
      //    arrancar en $0 cada mañana.
      const mañanaCol = new Date(fechaCol);
      mañanaCol.setDate(mañanaCol.getDate() + 1);
      const mañana = mañanaCol.getFullYear() + '-' +
        String(mañanaCol.getMonth() + 1).padStart(2, '0') + '-' +
        String(mañanaCol.getDate()).padStart(2, '0');

      // Si ya existe una base para mañana (p.ej. porque se re-arquea
      // hoy), la reemplazamos por el nuevo monto contado.
      await supabase.from('movimientos_caja').delete().eq('fecha', mañana).eq('tipo', 'base');
      const { error: errBaseManana } = await supabase.from('movimientos_caja').insert({
        fecha: mañana,
        tipo: 'base',
        monto: montoContado,
        descripcion: `Base inicial arrastrada del cierre de ${hoy} (por ${nombreAsesor})`,
        creado_por: nombreAsesor
      });
      // Si falla este paso, NO bloqueamos el cierre: lo dejamos como warning.
      // Mateo siempre puede ajustar la base manualmente con el botón existente.
      const warning = errBaseManana ? 'Caja cerrada, pero no se pudo arrastrar la base al día siguiente. Ajústala manualmente mañana.' : null;

      return res.status(200).json({
        status: 'ok',
        mensaje: 'Caja cerrada y arqueo guardado. Base de mañana = $' + montoContado.toLocaleString('es-CO'),
        warning
      });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: historial_cierres — Lista de cierres pasados (solo Mateo)
    // ─────────────────────────────────────────────────────────
    if (accion === 'historial_cierres') {
      if (nombreAsesor !== 'Mateo') {
        return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede ver el historial de cierres.' });
      }

      const desde  = payload.desde  || null;          // 'YYYY-MM-DD' opcional
      const hasta  = payload.hasta  || null;          // 'YYYY-MM-DD' opcional
      const limit  = Math.min(Number(payload.limit)  || 50, 200);
      const offset = Math.max(Number(payload.offset) || 0, 0);

      let query = supabase
        .from('cierres_caja')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (desde) query = query.gte('fecha', desde);
      if (hasta) query = query.lte('fecha', hasta);

      const { data, error, count } = await query;
      if (error) throw error;

      return res.status(200).json({
        status: 'ok',
        cierres: data || [],
        total: count || 0,
        limit,
        offset
      });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: detalle_cierre — Detalle de un cierre + movimientos de su día
    // ─────────────────────────────────────────────────────────
    if (accion === 'detalle_cierre') {
      if (nombreAsesor !== 'Mateo') {
        return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede ver el detalle de cierres.' });
      }

      const id = Number(payload.id);
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el id del cierre' });

      const { data: cierre, error: errCierre } = await supabase
        .from('cierres_caja')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (errCierre) throw errCierre;
      if (!cierre) return res.status(404).json({ status: 'error', mensaje: 'Cierre no encontrado' });

      const { data: movimientos, error: errMov } = await supabase
        .from('movimientos_caja')
        .select('*')
        .eq('fecha', cierre.fecha)
        .order('created_at', { ascending: true });
      if (errMov) throw errMov;

      return res.status(200).json({
        status: 'ok',
        cierre,
        movimientos: movimientos || []
      });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: cierres_pendientes — Días anteriores con apertura sin cierre
    // ─────────────────────────────────────────────────────────
    if (accion === 'cierres_pendientes') {
      // Traemos aperturas y cierres de fechas anteriores a hoy
      const { data: registros, error } = await supabase
        .from('movimientos_caja')
        .select('fecha, tipo, creado_por, created_at')
        .lt('fecha', hoy)
        .in('tipo', ['apertura', 'cierre'])
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Para cada fecha, miramos cuál fue el último evento del día.
      // Si fue 'apertura', está pendiente. Si fue 'cierre', ya está cerrado.
      const ultimoPorFecha = {};
      for (const r of (registros || [])) {
        ultimoPorFecha[r.fecha] = r;
      }

      const pendientes = [];
      for (const fecha of Object.keys(ultimoPorFecha)) {
        const ult = ultimoPorFecha[fecha];
        if (ult.tipo === 'apertura') {
          pendientes.push({
            fecha,
            abierto_por: ult.creado_por,
            apertura_at: ult.created_at,
            puede_cerrar: ult.creado_por === nombreAsesor
          });
        }
      }

      // Ordenar del más viejo al más nuevo
      pendientes.sort((a, b) => a.fecha.localeCompare(b.fecha));

      return res.status(200).json({ status: 'ok', pendientes });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: info_cierre_atrasado — Datos para cerrar un día pendiente
    // Devuelve el desglose del día atrasado + el neto de movimientos de hoy
    // ─────────────────────────────────────────────────────────
    if (accion === 'info_cierre_atrasado') {
      const fechaAtrasada = (payload.fecha || '').toString();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAtrasada)) {
        return res.status(400).json({ status: 'error', mensaje: 'Fecha inválida' });
      }
      if (fechaAtrasada >= hoy) {
        return res.status(400).json({ status: 'error', mensaje: 'La fecha debe ser anterior a hoy' });
      }

      // 1) Verificar que ese día tenga apertura sin cierre y que el asesor logueado sea quien abrió
      const { data: regs, error: errRegs } = await supabase
        .from('movimientos_caja')
        .select('tipo, creado_por, created_at')
        .eq('fecha', fechaAtrasada)
        .in('tipo', ['apertura', 'cierre'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (errRegs) throw errRegs;
      if (!regs || regs.tipo !== 'apertura') {
        return res.status(400).json({ status: 'error', mensaje: 'Ese día no tiene un cierre pendiente.' });
      }
      if (regs.creado_por !== nombreAsesor) {
        return res.status(403).json({ status: 'error', mensaje: `Solo ${regs.creado_por} puede cerrar ese día.` });
      }

      // 2) Base fija del día atrasado
      const { data: baseData } = await supabase
        .from('movimientos_caja')
        .select('monto')
        .eq('fecha', fechaAtrasada)
        .eq('tipo', 'base')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseFija = baseData?.monto || 0;

      // 3) Movimientos del día atrasado (ingresos, salidas, consignaciones, recepciones)
      const { data: movsDia } = await supabase
        .from('movimientos_caja')
        .select('tipo, monto')
        .eq('fecha', fechaAtrasada)
        .in('tipo', ['ingreso', 'salida', 'consignacion', 'recepcion']);

      let totalIngresos = 0, totalSalidas = 0, totalConsig = 0, totalRecaudo = 0;
      for (const m of (movsDia || [])) {
        if (m.tipo === 'ingreso')      totalIngresos += m.monto;
        else if (m.tipo === 'salida')  totalSalidas  += m.monto;
        else if (m.tipo === 'consignacion') totalConsig += m.monto;
        else if (m.tipo === 'recepcion')    totalRecaudo += m.monto;
      }
      const totalEsperado = baseFija + totalRecaudo + totalIngresos - totalSalidas - totalConsig;

      // 4) Movimientos de HOY que ya afectaron el efectivo
      //    (para que el asesor pueda contar todo lo que tiene ahora y el sistema descuente lo de hoy)
      const { data: movsHoy } = await supabase
        .from('movimientos_caja')
        .select('tipo, monto, descripcion, created_at')
        .eq('fecha', hoy)
        .in('tipo', ['ingreso', 'salida', 'consignacion', 'recepcion'])
        .order('created_at', { ascending: true });

      let netoHoy = 0;
      for (const m of (movsHoy || [])) {
        if (m.tipo === 'ingreso' || m.tipo === 'recepcion') netoHoy += m.monto;
        else if (m.tipo === 'salida' || m.tipo === 'consignacion') netoHoy -= m.monto;
      }

      return res.status(200).json({
        status: 'ok',
        fecha: fechaAtrasada,
        abierto_por: regs.creado_por,
        baseFija,
        totalRecaudo,
        totalIngresos,
        totalSalidas,
        totalConsig,
        totalEsperado,
        netoHoy,
        movimientosHoy: movsHoy || []
      });
    }

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: cerrar_dia_atrasado — Cerrar retroactivamente un día anterior
    // ─────────────────────────────────────────────────────────
    if (accion === 'cerrar_dia_atrasado') {
      const fechaAtrasada = (payload.fecha || '').toString();
      const efectivoActual = Math.round(Number(payload.efectivoActual) || 0);
      const netoHoyClient  = Math.round(Number(payload.netoHoy) || 0);
      const observaciones  = (payload.observaciones || '').toString().trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAtrasada)) {
        return res.status(400).json({ status: 'error', mensaje: 'Fecha inválida' });
      }
      if (fechaAtrasada >= hoy) {
        return res.status(400).json({ status: 'error', mensaje: 'La fecha debe ser anterior a hoy' });
      }
      if (!observaciones || observaciones.length < 5) {
        return res.status(400).json({ status: 'error', mensaje: 'Las observaciones son obligatorias (mínimo 5 caracteres) para cierres atrasados.' });
      }

      // 1) Validar que el asesor logueado fue quien abrió ese día
      const { data: regs, error: errRegs } = await supabase
        .from('movimientos_caja')
        .select('tipo, creado_por')
        .eq('fecha', fechaAtrasada)
        .in('tipo', ['apertura', 'cierre'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (errRegs) throw errRegs;
      if (!regs || regs.tipo !== 'apertura') {
        return res.status(400).json({ status: 'error', mensaje: 'Ese día no tiene un cierre pendiente.' });
      }
      if (regs.creado_por !== nombreAsesor) {
        return res.status(403).json({ status: 'error', mensaje: `Solo ${regs.creado_por} puede cerrar ese día.` });
      }

      // 2) Recalcular el desglose del día atrasado en el servidor (no confiamos en el cliente)
      const { data: baseData } = await supabase
        .from('movimientos_caja')
        .select('monto')
        .eq('fecha', fechaAtrasada)
        .eq('tipo', 'base')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseFija = baseData?.monto || 0;

      const { data: movsDia } = await supabase
        .from('movimientos_caja')
        .select('tipo, monto')
        .eq('fecha', fechaAtrasada)
        .in('tipo', ['ingreso', 'salida', 'consignacion', 'recepcion']);

      let totalIngresos = 0, totalSalidas = 0, totalConsig = 0, totalRecaudo = 0;
      for (const m of (movsDia || [])) {
        if (m.tipo === 'ingreso')      totalIngresos += m.monto;
        else if (m.tipo === 'salida')  totalSalidas  += m.monto;
        else if (m.tipo === 'consignacion') totalConsig += m.monto;
        else if (m.tipo === 'recepcion')    totalRecaudo += m.monto;
      }
      const totalEsperado = baseFija + totalRecaudo + totalIngresos - totalSalidas - totalConsig;

      // 3) Recalcular el neto de hoy en el servidor (para no confiar ciegamente en el cliente)
      const { data: movsHoy } = await supabase
        .from('movimientos_caja')
        .select('tipo, monto')
        .eq('fecha', hoy)
        .in('tipo', ['ingreso', 'salida', 'consignacion', 'recepcion']);

      let netoHoyServer = 0;
      for (const m of (movsHoy || [])) {
        if (m.tipo === 'ingreso' || m.tipo === 'recepcion') netoHoyServer += m.monto;
        else if (m.tipo === 'salida' || m.tipo === 'consignacion') netoHoyServer -= m.monto;
      }

      // 4) Calcular monto del día atrasado descontando lo de hoy
      const montoContadoDia = efectivoActual - netoHoyServer;
      const diferencia = montoContadoDia - totalEsperado;

      const obsCompleta = `[CIERRE TARDÍO realizado ${hoy}] ${observaciones}`;

      // 5) Insertar en cierres_caja con la fecha del día atrasado
      const { error: errCierre } = await supabase.from('cierres_caja').insert({
        fecha: fechaAtrasada,
        cerrado_por: nombreAsesor,
        base_fija: baseFija,
        total_recaudo: totalRecaudo,
        total_ingresos: totalIngresos,
        total_salidas: totalSalidas,
        total_consig: totalConsig,
        total_esperado: totalEsperado,
        monto_contado: montoContadoDia,
        diferencia,
        observaciones: obsCompleta
      });
      if (errCierre) throw errCierre;

      // 6) Insertar registro 'cierre' en movimientos_caja con la fecha atrasada
      //    para que la detección de "caja abierta/cerrada" deje de marcarlo como pendiente.
      const descMov = `Arqueo TARDÍO por ${nombreAsesor}. Esperado: $${totalEsperado}. Diferencia: $${diferencia}. Obs: ${observaciones}`;
      const { error: errMov } = await supabase.from('movimientos_caja').insert({
        fecha: fechaAtrasada,
        tipo: 'cierre',
        monto: montoContadoDia,
        descripcion: descMov,
        creado_por: nombreAsesor
      });
      if (errMov) throw errMov;

      // 7) Arrastrar el efectivo contado como base del día siguiente al día atrasado,
      //    igual que hace el cierre normal. Antes el cierre atrasado se saltaba este paso,
      //    por eso el día siguiente amanecía con base $0.
      //    Solo lo hacemos si ese día siguiente todavía NO tiene cierre propio, para no
      //    pisar la base de un día que ya fue arqueado. No borramos nada: insertamos la
      //    base nueva y la lógica de lectura siempre usa la más reciente.
      const sigCol = new Date(fechaAtrasada + 'T12:00:00');
      sigCol.setDate(sigCol.getDate() + 1);
      const diaSiguiente = sigCol.getFullYear() + '-' +
        String(sigCol.getMonth() + 1).padStart(2, '0') + '-' +
        String(sigCol.getDate()).padStart(2, '0');

      const { data: cierreSiguiente } = await supabase
        .from('movimientos_caja')
        .select('id')
        .eq('fecha', diaSiguiente)
        .eq('tipo', 'cierre')
        .limit(1)
        .maybeSingle();

      let warningBase = null;
      if (!cierreSiguiente) {
        const { error: errBaseSig } = await supabase.from('movimientos_caja').insert({
          fecha: diaSiguiente,
          tipo: 'base',
          monto: montoContadoDia,
          descripcion: `Base inicial arrastrada del cierre de ${fechaAtrasada} (por ${nombreAsesor})`,
          creado_por: nombreAsesor
        });
        // Si falla, no bloqueamos el cierre: la base se puede ajustar a mano.
        if (errBaseSig) warningBase = 'Cierre guardado, pero no se pudo arrastrar la base al día siguiente. Ajústala manualmente.';
      }

      return res.status(200).json({
        status: 'ok',
        mensaje: 'Cierre atrasado guardado',
        montoContadoDia,
        totalEsperado,
        diferencia,
        warning: warningBase
      });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
