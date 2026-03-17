import { createClient } from '@supabase/supabase-js';

const CATEGORIAS = [
  { id: 'operacionales',    nombre: 'Gastos Operacionales',      icono: '⚙️', afecta_er: true  },
  { id: 'rifa_apartamento', nombre: 'Gastos Rifa Apartamento',   icono: '🏠', afecta_er: true  },
  { id: 'construccion',     nombre: 'Construcción Apartamento',  icono: '🏗️', afecta_er: false },
  { id: 'rifa_camioneta',   nombre: 'Rifa Camioneta',            icono: '🚗', afecta_er: false },
  { id: 'retiro_ganancia',  nombre: 'Retiro de Ganancia',        icono: '💸', afecta_er: false },
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
        .select('id, fecha, monto, plataforma, referencia')
        .eq('monto', montoGasto)
        .eq('fecha', fechaGasto);

      if (existentes && existentes.length > 0) {
        const duplicado = existentes.find(g => {
          const mismaRef   = String(referencia || '').toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
          const mismaPlatf = String(plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
          return mismaRef && mismaPlatf;
        });
        if (duplicado) {
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

    // ── Justificar egreso pendiente (cualquier asesor) ───────────────────
    if (accion === 'justificar_pendiente') {
      const { id, descripcion, categoria, subcategoria, plataforma, notas } = payload;

      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del gasto.' });
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

    if (nombreAsesor !== 'Mateo') {
      return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede registrar gastos.' });
    }

    // ── Registrar gasto ─────────────────────────────────────────────────
    if (accion === 'registrar_gasto') {
      const { fecha, hora, monto, plataforma, referencia, descripcion,
              categoria, subcategoria, notas, url_comprobante, reportado_por } = payload;

      if (!monto || Number(monto) <= 0) return res.status(400).json({ status: 'error', mensaje: 'El monto es obligatorio.' });
      if (!descripcion || !descripcion.trim()) return res.status(400).json({ status: 'error', mensaje: 'La descripción es obligatoria.' });
      if (!categoria) return res.status(400).json({ status: 'error', mensaje: 'Selecciona una categoría.' });

      const catObj = CATEGORIAS.find(c => c.id === categoria);
      if (!catObj) return res.status(400).json({ status: 'error', mensaje: `Categoría "${categoria}" no válida.` });

      const fechaGasto = fecha || new Date().toISOString().split('T')[0];
      const montoGasto = Math.round(Number(monto));

      const { data: existentes } = await supabase
        .from('gastos')
        .select('id, fecha, monto, plataforma, referencia, descripcion, categoria')
        .eq('monto', montoGasto)
        .eq('fecha', fechaGasto);

      if (existentes && existentes.length > 0) {
        const duplicado = existentes.find(g => {
          const mismaRef   = String(referencia || '').toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
          const mismaPlatf = String(plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
          return mismaRef && mismaPlatf;
        });

        if (duplicado) {
          return res.status(200).json({
            status: 'duplicado',
            mensaje: `Este gasto ya existe: $${montoGasto.toLocaleString('es-CO')} · ${duplicado.categoria} · ${duplicado.descripcion} (${duplicado.fecha})`
          });
        }
      }

      const { error } = await supabase.from('gastos').insert({
        fecha:            fecha || new Date().toISOString().split('T')[0],
        hora:             hora || null,
        monto:            Math.round(Number(monto)),
        plataforma:       plataforma || null,
        referencia:       referencia || null,
        descripcion:      descripcion.trim(),
        categoria:        catObj.nombre,
        subcategoria:     subcategoria || null,
        url_comprobante:  url_comprobante || null,
        reportado_por:    reportado_por || nombreAsesor,
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
