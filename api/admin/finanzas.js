import { createClient } from '@supabase/supabase-js';

const CATEGORIAS = [
  { id: 'operacionales',    nombre: 'Gastos Operacionales',      icono: '⚙️', afecta_er: true  },
  { id: 'rifa_apartamento', nombre: 'Gastos Rifa Apartamento',   icono: '🏠', afecta_er: true  },
  { id: 'construccion',     nombre: 'Construcción Apartamento',  icono: '🏗️', afecta_er: false },
  { id: 'rifa_camioneta',   nombre: 'Rifa Camioneta',            icono: '🚗', afecta_er: false },
  { id: 'rifa_santa_teresita', nombre: 'Rifa Casa Santa Teresita', icono: '🏡', afecta_er: false },
  { id: 'retiro_ganancia',  nombre: 'Retiro de Ganancia',        icono: '💸', afecta_er: false },
  { id: 'retiro_capital',   nombre: 'Retiro de Capital',         icono: '🏦', afecta_er: false },
  { id: 'pagos_diarias',    nombre: 'Pagos Rifas Diarias',       icono: '🎯', afecta_er: false }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, ...payload } = req.body;

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  try {

    if (accion === 'listar_categorias') {
      return res.status(200).json({ status: 'ok', categorias: CATEGORIAS });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // ── Guardar egreso pendiente (cualquier asesor) ──────────────────────
    if (accion === 'guardar_pendiente') {
      const { fecha, hora, monto, plataforma, referencia, descripcion,
              url_comprobante, reportado_por } = payload;

      if (!monto || Number(monto) <= 0) return res.status(400).json({ status: 'error', mensaje: 'El monto es obligatorio.' });

      const fechaGasto = fecha || new Date().toISOString().split('T')[0];
      const montoGasto = Math.round(Number(monto));

      const { data: existentes } = await supabase
        .from('gastos')
        .select('id, fecha, hora, monto, plataforma, referencia, created_at')
        .eq('monto', montoGasto)
        .eq('fecha', fechaGasto);

      if (existentes && existentes.length > 0) {
        const duplicado = existentes.find(g => {
          const mismaRef   = String(referencia || '').toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
          const mismaPlatf = String(plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
          const horaNew    = (hora || '').substring(0, 8);
          const horaExist  = (g.hora || '').substring(0, 8);
          const mismaHora  = horaNew !== '' && horaExist !== '' && horaNew === horaExist;
          return mismaRef && mismaPlatf && mismaHora;
        });
        if (duplicado) {
          const creadoHace = Date.now() - new Date(duplicado.created_at).getTime();
          if (creadoHace < 30000) {
            return res.status(200).json({ status: 'ok', mensaje: `Gasto de $${montoGasto.toLocaleString('es-CO')} registrado correctamente.` });
          }
          return res.status(200).json({ status: 'duplicado', mensaje: `Este movimiento ya fue registrado ($${montoGasto.toLocaleString('es-CO')} del ${fechaGasto}).` });
        }
      }

      const { error } = await supabase.from('gastos').insert({
        fecha: fechaGasto, hora: hora || null,
        monto: montoGasto,
        plataforma:       plataforma || null,
        referencia:       referencia || null,
        descripcion:      (descripcion || 'Pendiente de justificar').trim(),
        categoria:        'Pendiente',
        url_comprobante:  url_comprobante || null,
        reportado_por:    reportado_por || nombreAsesor,
        categorizado_por: nombreAsesor
      });
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: `Egreso de $${montoGasto.toLocaleString('es-CO')} guardado como pendiente.` });
    }

    // ── Listar egresos pendientes (cualquier asesor) ─────────────────────
    if (accion === 'listar_pendientes') {
      const { data, error } = await supabase
        .from('gastos')
        .select('id, fecha, hora, monto, plataforma, referencia, descripcion, url_comprobante, reportado_por, created_at')
        .eq('categoria', 'Pendiente')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.status(200).json({ status: 'ok', pendientes: data || [] });
    }

    // ── Descartar egreso pendiente (no era un egreso real) ───────────────
    if (accion === 'descartar_pendiente') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      const { data: gasto } = await supabase
        .from('gastos')
        .select('id, categoria')
        .eq('id', id)
        .eq('categoria', 'Pendiente')
        .single();

      if (!gasto) return res.status(404).json({ status: 'error', mensaje: 'No se encontró el egreso pendiente o ya fue justificado.' });

      const { error } = await supabase.from('gastos').delete().eq('id', id).eq('categoria', 'Pendiente');
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Egreso descartado. No era un gasto real.' });
    }

    // ── Justificar egreso pendiente (cualquier asesor) ───────────────────
    if (accion === 'justificar_pendiente') {
      const { id, descripcion, categoria, subcategoria, plataforma, notas, distribuciones } = payload;

      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      // Justificación con distribución en múltiples categorías
      if (distribuciones && Array.isArray(distribuciones) && distribuciones.length > 0) {
        const { data: pendiente } = await supabase
          .from('gastos').select('*').eq('id', id).eq('categoria', 'Pendiente').single();

        if (!pendiente) return res.status(404).json({ status: 'error', mensaje: 'Egreso pendiente no encontrado o ya fue justificado.' });

        const montoTotal = Math.round(Number(pendiente.monto));
        const sumaDist = distribuciones.reduce((s, d) => s + Math.round(Number(d.monto || 0)), 0);
        if (sumaDist !== montoTotal) {
          return res.status(400).json({ status: 'error', mensaje: `Total distribuido ($${sumaDist.toLocaleString('es-CO')}) no coincide con el monto ($${montoTotal.toLocaleString('es-CO')}).` });
        }

        for (const dist of distribuciones) {
          if (!dist.descripcion || !dist.descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'Cada distribución necesita una descripción.' });
          if (!dist.categoria) return res.status(400).json({ status: 'error', mensaje: 'Cada distribución necesita una categoría.' });
          const co = CATEGORIAS.find(c => c.id === dist.categoria);
          if (!co) return res.status(400).json({ status: 'error', mensaje: `Categoría "${dist.categoria}" no válida.` });
        }

        const { error: delErr } = await supabase.from('gastos').delete().eq('id', id).eq('categoria', 'Pendiente');
        if (delErr) throw delErr;

        const inserts = distribuciones.map(dist => {
          const co = CATEGORIAS.find(c => c.id === dist.categoria);
          return {
            fecha: pendiente.fecha, hora: pendiente.hora || null,
            monto: Math.round(Number(dist.monto)),
            plataforma: plataforma || pendiente.plataforma || null,
            referencia: pendiente.referencia || null,
            descripcion: dist.descripcion.trim(),
            categoria: co.nombre, subcategoria: dist.subcategoria || null,
            url_comprobante: pendiente.url_comprobante || null,
            reportado_por: pendiente.reportado_por || nombreAsesor,
            categorizado_por: nombreAsesor
          };
        });

        const { error: insErr } = await supabase.from('gastos').insert(inserts);
        if (insErr) throw insErr;

        const cats = [...new Set(inserts.map(i => i.categoria))].join(', ');
        return res.status(200).json({ status: 'ok', mensaje: `${inserts.length} distribuciones justificadas: ${cats}` });
      }

      // Justificación simple (una sola categoría)
      if (!descripcion || !descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'La descripción es obligatoria.' });
      if (!categoria) return res.status(400).json({ status: 'error', mensaje: 'Selecciona una categoría.' });

      const catObj = CATEGORIAS.find(c => c.id === categoria);
      if (!catObj) return res.status(400).json({ status: 'error', mensaje: `Categoría "${categoria}" no válida.` });

      const { error } = await supabase.from('gastos').update({
        descripcion:      descripcion.trim(),
        categoria:        catObj.nombre,
        subcategoria:     subcategoria || null,
        plataforma:       plataforma || null,
        categorizado_por: nombreAsesor
      }).eq('id', id).eq('categoria', 'Pendiente');

      if (error) throw error;
      return res.status(200).json({ status: 'ok', mensaje: `Gasto justificado en "${catObj.nombre}".` });
    }

    // ── Listar gastos para división entre socios ──────────────────────
    if (accion === 'listar_gastos_division') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede ver la división de gastos.' });

      const { fecha_desde, fecha_hasta } = payload;
      if (!fecha_desde || !fecha_hasta) return res.status(400).json({ status: 'error', mensaje: 'Se necesitan ambas fechas.' });

      const { data, error } = await supabase
        .from('gastos')
        .select('id, fecha, monto, descripcion, categoria, subcategoria, plataforma, reportado_por, asignado_a, url_comprobante')
        .neq('categoria', 'Pendiente')
        .gte('fecha', fecha_desde)
        .lte('fecha', fecha_hasta)
        .order('fecha', { ascending: true })
        .order('id', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return res.status(200).json({ status: 'ok', gastos: data || [] });
    }

    // ── Asignar gasto a socio ─────────────────────────────────────────
    if (accion === 'asignar_gasto') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede asignar gastos.' });

      const { id, asignado_a } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      const validos = ['Mateo', 'Alejandro', 'Empresa', null, ''];
      if (!validos.includes(asignado_a)) return res.status(400).json({ status: 'error', mensaje: 'Valor no válido. Usa: Mateo, Alejandro o Empresa.' });

      const { error } = await supabase
        .from('gastos')
        .update({ asignado_a: asignado_a || null })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ status: 'ok' });
    }

    // ── Actualizar descripción de un gasto ─────────────────────────────
    if (accion === 'actualizar_descripcion_gasto') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede modificar gastos.' });

      const { id, descripcion } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });
      if (!descripcion || !descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'La descripción no puede estar vacía.' });

      const { error } = await supabase
        .from('gastos')
        .update({ descripcion: descripcion.trim() })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ status: 'ok' });
    }

    // ── Actualizar plataforma (origen del dinero) de un gasto ─────────
    if (accion === 'actualizar_plataforma_gasto') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede modificar gastos.' });

      const { id, plataforma } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      const { error } = await supabase
        .from('gastos')
        .update({ plataforma: plataforma || null })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ status: 'ok' });
    }

    // ── Actualizar categoría/subcategoría de un gasto ─────────────────
    if (accion === 'actualizar_categoria_gasto') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede reclasificar gastos.' });

      const { id, categoria, subcategoria } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });

      const catObj = CATEGORIAS.find(c => c.id === categoria);
      if (!catObj) return res.status(400).json({ status: 'error', mensaje: 'Categoría no válida.' });

      const { error } = await supabase
        .from('gastos')
        .update({ categoria: catObj.nombre, subcategoria: subcategoria || null })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ status: 'ok', categoria: catObj.nombre, subcategoria: subcategoria || null });
    }

    // ── Asignar gastos en lote ────────────────────────────────────────
    if (accion === 'asignar_gastos_lote') {
      const esGerencia = ['Mateo', 'Alejo P', 'Alejo Plata'].includes(nombreAsesor);
      if (!esGerencia) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede asignar gastos.' });

      const { asignaciones } = payload;
      if (!asignaciones || !Array.isArray(asignaciones) || asignaciones.length === 0) {
        return res.status(400).json({ status: 'error', mensaje: 'No hay asignaciones para guardar.' });
      }

      const validos = ['Mateo', 'Alejandro', 'Empresa', null, ''];
      let actualizados = 0;
      for (const { id, asignado_a } of asignaciones) {
        if (!id || !validos.includes(asignado_a)) continue;
        const { error } = await supabase
          .from('gastos')
          .update({ asignado_a: asignado_a || null })
          .eq('id', id);
        if (!error) actualizados++;
      }
      return res.status(200).json({ status: 'ok', mensaje: `${actualizados} gastos actualizados.` });
    }

    const puedeRegistrarGastos = ['Mateo', 'Juan Pablo', 'Juan Pablo Rojas'];
    if (!puedeRegistrarGastos.includes(nombreAsesor)) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo o Juan Pablo pueden registrar gastos.' });
    }

    // ── Registrar gasto ─────────────────────────────────────────────────
    if (accion === 'registrar_gasto') {
      const { fecha, hora, monto, plataforma, referencia, descripcion,
              categoria, subcategoria, notas, url_comprobante, reportado_por, distribuciones } = payload;

      if (!monto || Number(monto) <= 0) return res.status(400).json({ status: 'error', mensaje: 'El monto es obligatorio.' });

      const fechaGasto = fecha || new Date().toISOString().split('T')[0];
      const montoGasto = Math.round(Number(monto));

      // Detección de duplicados por monto total
      const { data: existentes } = await supabase
        .from('gastos')
        .select('id, fecha, hora, monto, plataforma, referencia, descripcion, categoria, created_at')
        .eq('monto', montoGasto)
        .eq('fecha', fechaGasto);

      if (existentes && existentes.length > 0) {
        const duplicado = existentes.find(g => {
          const mismaRef   = String(referencia || '').toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
          const mismaPlatf = String(plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
          const horaNew    = (hora || '').substring(0, 8);
          const horaExist  = (g.hora || '').substring(0, 8);
          const mismaHora  = horaNew !== '' && horaExist !== '' && horaNew === horaExist;
          return mismaRef && mismaPlatf && mismaHora;
        });
        if (duplicado) {
          const creadoHace = Date.now() - new Date(duplicado.created_at).getTime();
          if (creadoHace < 30000) {
            return res.status(200).json({ status: 'ok', mensaje: `Gasto de $${montoGasto.toLocaleString('es-CO')} registrado correctamente.` });
          }
          return res.status(200).json({
            status: 'duplicado',
            mensaje: `Este gasto ya existe: $${montoGasto.toLocaleString('es-CO')} · ${duplicado.categoria} · ${duplicado.descripcion} (${duplicado.fecha})`
          });
        }
      }

      // Detección de duplicados por referencia (para egresos previamente distribuidos)
      if (referencia && referencia !== '0') {
        const { data: refExistentes } = await supabase
          .from('gastos')
          .select('id, fecha, monto, plataforma, referencia, categoria, created_at')
          .eq('fecha', fechaGasto)
          .eq('referencia', referencia)
          .limit(1);
        if (refExistentes && refExistentes.length > 0) {
          const dupRef = refExistentes.find(g =>
            String(plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim()
          );
          if (dupRef) {
            const creadoHace = Date.now() - new Date(dupRef.created_at).getTime();
            if (creadoHace < 30000) {
              return res.status(200).json({ status: 'ok', mensaje: `Gasto de $${montoGasto.toLocaleString('es-CO')} registrado correctamente.` });
            }
            return res.status(200).json({
              status: 'duplicado',
              mensaje: `Este gasto ya fue registrado (Ref: ${referencia}, ${dupRef.categoria}).`
            });
          }
        }
      }

      // Egreso distribuido en múltiples categorías
      if (distribuciones && Array.isArray(distribuciones) && distribuciones.length > 0) {
        const sumaDist = distribuciones.reduce((s, d) => s + Math.round(Number(d.monto || 0)), 0);
        if (sumaDist !== montoGasto) {
          return res.status(400).json({ status: 'error', mensaje: `Total distribuido ($${sumaDist.toLocaleString('es-CO')}) no coincide con el monto ($${montoGasto.toLocaleString('es-CO')}).` });
        }

        for (const dist of distribuciones) {
          if (!dist.descripcion || !dist.descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'Cada distribución necesita una descripción.' });
          if (!dist.categoria) return res.status(400).json({ status: 'error', mensaje: 'Cada distribución necesita una categoría.' });
          const co = CATEGORIAS.find(c => c.id === dist.categoria);
          if (!co) return res.status(400).json({ status: 'error', mensaje: `Categoría "${dist.categoria}" no válida.` });
        }

        const inserts = distribuciones.map(dist => {
          const co = CATEGORIAS.find(c => c.id === dist.categoria);
          return {
            fecha: fechaGasto, hora: hora || null,
            monto: Math.round(Number(dist.monto)),
            plataforma: plataforma || null, referencia: referencia || null,
            descripcion: dist.descripcion.trim(),
            categoria: co.nombre, subcategoria: dist.subcategoria || null,
            url_comprobante: url_comprobante || null,
            reportado_por: reportado_por || nombreAsesor,
            categorizado_por: nombreAsesor
          };
        });

        const { error } = await supabase.from('gastos').insert(inserts);
        if (error) throw error;

        const cats = [...new Set(inserts.map(i => i.categoria))].join(', ');
        return res.status(200).json({
          status: 'ok',
          mensaje: `${inserts.length} distribuciones registradas ($${montoGasto.toLocaleString('es-CO')}): ${cats}`
        });
      }

      // Registro simple (una sola categoría, flujo legacy)
      if (!descripcion || !descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'La descripción es obligatoria.' });
      if (!categoria) return res.status(400).json({ status: 'error', mensaje: 'Selecciona una categoría.' });

      const catObj = CATEGORIAS.find(c => c.id === categoria);
      if (!catObj) return res.status(400).json({ status: 'error', mensaje: `Categoría "${categoria}" no válida.` });

      const { error } = await supabase.from('gastos').insert({
        fecha: fechaGasto, hora: hora || null,
        monto: montoGasto,
        plataforma: plataforma || null, referencia: referencia || null,
        descripcion: descripcion.trim(),
        categoria: catObj.nombre, subcategoria: subcategoria || null,
        url_comprobante: url_comprobante || null,
        reportado_por: reportado_por || nombreAsesor,
        categorizado_por: nombreAsesor
      });

      if (error) throw error;

      return res.status(200).json({
        status: 'ok',
        mensaje: `Gasto de $${Number(monto).toLocaleString('es-CO')} registrado en "${catObj.nombre}".`
      });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });

  } catch (error) {
    console.error('[finanzas]', error);
    return res.status(500).json({ status: 'error', mensaje: 'Error: ' + error.message });
  }
}
