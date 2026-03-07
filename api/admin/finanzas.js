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

  if (!nombreAsesor || nombreAsesor !== 'Mateo') {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido. Solo el administrador puede acceder al Centro Financiero.' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {

    // ─────────────────────────────────────────────────────────────────────────
    // DASHBOARD — Estado de resultados (P&L) para un período
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'dashboard') {
      const { fecha_desde, fecha_hasta } = payload;

      if (!fecha_desde || !fecha_hasta) {
        return res.status(400).json({ status: 'error', mensaje: 'Faltan las fechas del período.' });
      }

      // 1. Ingresos: suma de todos los abonos en el período
      const { data: abonosData, error: errAbonos } = await supabase
        .from('abonos')
        .select('monto')
        .gte('fecha_pago', fecha_desde)
        .lte('fecha_pago', fecha_hasta);

      if (errAbonos) throw errAbonos;
      const totalIngresos = (abonosData || []).reduce((s, a) => s + Number(a.monto), 0);

      // 2. Gastos bancarios: tabla gastos
      const { data: gastosData, error: errGastos } = await supabase
        .from('gastos')
        .select('monto, categoria, subcategoria, descripcion')
        .gte('fecha', fecha_desde)
        .lte('fecha', fecha_hasta);

      if (errGastos) throw errGastos;

      // 3. Gastos de caja física: movimientos_caja tipo 'salida'
      const { data: cajaData, error: errCaja } = await supabase
        .from('movimientos_caja')
        .select('monto, descripcion')
        .eq('tipo', 'salida')
        .gte('fecha', fecha_desde)
        .lte('fecha', fecha_hasta);

      if (errCaja) throw errCaja;

      // Agrupar gastos bancarios por categoría → subcategoría
      const porCategoria = {};

      for (const g of (gastosData || [])) {
        if (!porCategoria[g.categoria]) {
          porCategoria[g.categoria] = { total: 0, subcategorias: {}, fuente: 'banco' };
        }
        porCategoria[g.categoria].total += Number(g.monto);
        const sub = g.subcategoria || 'Sin subcategoría';
        porCategoria[g.categoria].subcategorias[sub] =
          (porCategoria[g.categoria].subcategorias[sub] || 0) + Number(g.monto);
      }

      // Agregar gastos de caja como categoría especial
      const totalCaja = (cajaData || []).reduce((s, m) => s + Number(m.monto), 0);
      if (totalCaja > 0) {
        if (!porCategoria['Caja Física']) {
          porCategoria['Caja Física'] = { total: 0, subcategorias: {}, fuente: 'caja' };
        }
        porCategoria['Caja Física'].total += totalCaja;
        for (const m of (cajaData || [])) {
          const desc = m.descripcion || 'Sin descripción';
          porCategoria['Caja Física'].subcategorias[desc] =
            (porCategoria['Caja Física'].subcategorias[desc] || 0) + Number(m.monto);
        }
      }

      const totalGastos = Object.values(porCategoria).reduce((s, c) => s + c.total, 0);
      const utilidadNeta = totalIngresos - totalGastos;
      const margen = totalIngresos > 0 ? Math.round((utilidadNeta / totalIngresos) * 100) : 0;

      return res.status(200).json({
        status: 'ok',
        totalIngresos,
        totalGastos,
        utilidadNeta,
        margen,
        porCategoria
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LISTAR GASTOS — con filtros opcionales
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'listar_gastos') {
      const { fecha_desde, fecha_hasta, categoria } = payload;

      let query = supabase
        .from('gastos')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (fecha_desde) query = query.gte('fecha', fecha_desde);
      if (fecha_hasta) query = query.lte('fecha', fecha_hasta);
      if (categoria) query = query.eq('categoria', categoria);

      const { data, error } = await query.limit(300);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', gastos: data || [] });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRAR GASTO
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'registrar_gasto') {
      const {
        fecha, hora, monto, plataforma, referencia,
        categoria, subcategoria, descripcion, proyecto,
        url_comprobante, reportado_por, notas
      } = payload;

      if (!fecha || !monto || !categoria) {
        return res.status(400).json({ status: 'error', mensaje: 'Faltan campos obligatorios: fecha, monto y categoría.' });
      }

      const { data, error } = await supabase.from('gastos').insert({
        fecha,
        hora: hora || null,
        monto: Number(monto),
        plataforma: plataforma || null,
        referencia: referencia || null,
        categoria,
        subcategoria: subcategoria || null,
        descripcion: descripcion || null,
        proyecto: proyecto || null,
        url_comprobante: url_comprobante || null,
        reportado_por: reportado_por || null,
        categorizado_por: nombreAsesor,
        notas: notas || null,
        fuente: 'banco'
      }).select().single();

      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: '✅ Gasto registrado correctamente.', gasto: data });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTUALIZAR GASTO
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'actualizar_gasto') {
      const { id, ...updates } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      const allowed = ['fecha', 'hora', 'monto', 'plataforma', 'referencia', 'categoria',
        'subcategoria', 'descripcion', 'proyecto', 'url_comprobante', 'reportado_por', 'notas'];

      const filtered = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) filtered[key] = updates[key];
      }
      if (updates.monto !== undefined) filtered.monto = Number(updates.monto);

      const { error } = await supabase.from('gastos').update(filtered).eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Gasto actualizado.' });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ELIMINAR GASTO
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'eliminar_gasto') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID.' });

      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Gasto eliminado.' });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LISTAR CATEGORÍAS
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'listar_categorias') {
      const { data, error } = await supabase
        .from('categorias_gastos')
        .select('*')
        .order('nombre');

      if (error) throw error;
      return res.status(200).json({ status: 'ok', categorias: data || [] });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREAR CATEGORÍA
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'crear_categoria') {
      const { nombre, color, icono, subcategorias } = payload;
      if (!nombre) return res.status(400).json({ status: 'error', mensaje: 'El nombre es obligatorio.' });

      const { data, error } = await supabase.from('categorias_gastos').insert({
        nombre: nombre.trim(),
        color: color || '#4eb082',
        icono: icono || '💰',
        subcategorias: subcategorias || [],
        creado_por: nombreAsesor
      }).select().single();

      if (error) {
        if (error.code === '23505') {
          return res.status(400).json({ status: 'error', mensaje: 'Ya existe una categoría con ese nombre.' });
        }
        throw error;
      }

      return res.status(200).json({ status: 'ok', mensaje: '✅ Categoría creada.', categoria: data });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTUALIZAR CATEGORÍA
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'actualizar_categoria') {
      const { id, nombre, color, icono, subcategorias } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID.' });

      const updates = {};
      if (nombre !== undefined) updates.nombre = nombre.trim();
      if (color !== undefined) updates.color = color;
      if (icono !== undefined) updates.icono = icono;
      if (subcategorias !== undefined) updates.subcategorias = subcategorias;

      const { error } = await supabase.from('categorias_gastos').update(updates).eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Categoría actualizada.' });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ELIMINAR CATEGORÍA
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'eliminar_categoria') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID.' });

      const { error } = await supabase.from('categorias_gastos').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Categoría eliminada.' });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUGERIR SUBCATEGORÍA CON IA
    // ─────────────────────────────────────────────────────────────────────────
    if (accion === 'sugerir_subcategoria') {
      const { descripcion, monto, categoria, subcategorias_existentes } = payload;
      const openAiKey = process.env.OPENAI_API_KEY;

      const subsStr = (subcategorias_existentes || []).length > 0
        ? subcategorias_existentes.join(', ')
        : 'ninguna definida aún';

      const prompt = `Eres un asistente contable de una empresa de rifas en Colombia.
Registrando un gasto con estos datos:
- Descripción del gasto: "${descripcion || 'Sin descripción'}"
- Monto: $${Number(monto || 0).toLocaleString('es-CO')} COP
- Categoría principal: "${categoria}"
- Subcategorías ya existentes en esta categoría: ${subsStr}

Si alguna subcategoría existente encaja perfectamente con este gasto, responde exactamente con ese nombre.
Si ninguna encaja bien, propón una nueva subcategoría descriptiva (máximo 3 palabras, en español).
Responde ÚNICAMENTE con el nombre de la subcategoría, sin explicación ni puntuación extra.`;

      const responseAI = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 30,
          temperature: 0.2
        })
      });

      const dataAI = await responseAI.json();
      const sugerencia = dataAI.choices?.[0]?.message?.content?.trim() || '';

      return res.status(200).json({ status: 'ok', sugerencia });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
