import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { accion, contrasena, ...payload } = req.body;

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const EXCLUIDOS_CAJA = ['alejandra plata', 'joaquin', 'lili', 'liliana', 'luisa', 'luisa rivera', 'nena'];

  // Fecha de hoy en zona horaria Colombia
  const fechaCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const hoy = fechaCol.getFullYear() + '-' +
    String(fechaCol.getMonth() + 1).padStart(2, '0') + '-' +
    String(fechaCol.getDate()).padStart(2, '0');

  try {

    // ─────────────────────────────────────────────────────────
    // ACCIÓN: datos — Cargar resumen completo de la caja de hoy
    // ─────────────────────────────────────────────────────────
    if (accion === 'datos') {

      // 1. Base fija del día
      const { data: baseData } = await supabase
        .from('movimientos_caja')
        .select('monto')
        .eq('fecha', hoy)
        .eq('tipo', 'base')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseFija = baseData?.monto || 0;

      // 2. Abonos cobrados en efectivo (SIN filtro de fecha — acumula todo lo histórico pendiente)
      const { data: abonosEfectivo } = await supabase
        .from('abonos')
        .select('asesor, monto')
        .eq('referencia_transferencia', 'efectivo');

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

      // 3b. Todas las recepciones históricas para calcular el pendiente real por asesor
      const { data: todasRecepciones } = await supabase
        .from('movimientos_caja')
        .select('asesor, monto')
        .eq('tipo', 'recepcion');

      const recibidoPorAsesor = {};
      for (const r of (todasRecepciones || [])) {
        if (r.asesor) {
          recibidoPorAsesor[r.asesor] = (recibidoPorAsesor[r.asesor] || 0) + r.monto;
        }
      }

      // 4. Calcular pendiente por asesor (cobrado histórico - recibido histórico)
      const asesoresEnCalle = [];
      for (const [asesor, cobrado] of Object.entries(cobradoPorAsesor)) {
        if (EXCLUIDOS_CAJA.includes(asesor.toLowerCase().trim())) continue;
        const recibido = recibidoPorAsesor[asesor] || 0;
        const pendiente = cobrado - recibido;
        if (pendiente > 0) {
          asesoresEnCalle.push({ asesor, pendiente, cobrado, recibido });
        }
      }

      const totalEnCalle = asesoresEnCalle.reduce((s, a) => s + a.pendiente, 0);

      // Efectivo esperado en caja = Base + Recepciones entregadas + Ingresos extra - Salidas - Consignaciones
      const efectivoFisicoEsperado = baseFija + totalRecepciones + totalIngresos - totalSalidas - totalConsignaciones;

      return res.status(200).json({
        status: 'ok',
        hoy,
        baseFija,
        totalEnCalle,
        efectivoFisicoEsperado,
        totalRecepciones,
        totalIngresos,
        totalSalidas,
        totalConsignaciones,
        asesoresEnCalle,
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
          retiro_ganancia:  'Retiro de Ganancia',
          pagos_diarias:    'Pagos Rifas Diarias'
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
    // ACCIÓN: cerrar_caja — Guardar arqueo y cerrar el turno
    // ─────────────────────────────────────────────────────────
    if (accion === 'cerrar_caja') {
      const montoContado = Number(payload.montoContado) || 0;
      const totalEsperado = Number(payload.totalEsperado) || 0;
      const diferencia = montoContado - totalEsperado;

      const { error } = await supabase.from('movimientos_caja').insert({
        fecha: hoy,
        tipo: 'cierre',
        monto: montoContado,
        descripcion: `Arqueo por ${nombreAsesor}. Esperado: $${totalEsperado}. Diferencia: $${diferencia}`,
        creado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Caja cerrada y arqueo guardado' });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
