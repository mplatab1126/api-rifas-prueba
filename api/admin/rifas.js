import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, ...payload } = req.body;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  // Solo Mateo tiene acceso al módulo financiero
  if (nombreAsesor !== 'Mateo') {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso para acceder a este módulo.' });
  }

  try {

    // ══════════════════════════════════════════════════════════════════════
    // RIFAS — CRUD
    // ══════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    // LISTAR RIFAS
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'listar_rifas') {
      // Ordenar por numero_rifa ascendente (nulls al final), luego por created_at
      const { data: rifas, error } = await supabase
        .from('rifas')
        .select('*')
        .order('numero_rifa', { ascending: true, nullsFirst: false })
        .order('created_at',  { ascending: true });
      if (error) throw error;

      const ids = (rifas || []).map(r => r.id);

      const { data: premios } = await supabase
        .from('premios_rifa')
        .select('*')
        .in('rifa_id', ids.length ? ids : ['none']);

      // ── Paso 1: construir datos base por rifa ──────────────────────────
      const rifasCompletas = (rifas || []).map(rifa => {
        const premiosRifa        = (premios || []).filter(p => p.rifa_id === rifa.id);
        const capitalTotal       = premiosRifa
          .filter(p => !p.es_para_recapitalizar)
          .reduce((s, p) => s + Number(p.valor), 0);
        const totalRecapitalizar = premiosRifa
          .filter(p => p.requiere_recapitalizacion)
          .reduce((s, p) => s + Number(p.valor), 0);

        const esEmpresa = rifa.numero_rifa != null && rifa.numero_rifa >= 4;

        return {
          ...rifa,
          premios:             premiosRifa,
          capital_total:       capitalTotal,
          total_recapitalizar: totalRecapitalizar,
          es_empresa:          esEmpresa,
          recapitalizacion_por_hermano: esEmpresa ? 0 : Math.round(totalRecapitalizar / 2)
        };
      });

      // ── Paso 2: calcular saldo acumulado de recapitalización por hermano ──
      // Regla clave: las contribuciones de los hermanos a una rifa pagan la
      // obligación acumulada de rifas ANTERIORES, no de esa misma rifa.
      // Las contribuciones a la primera rifa son inversiones de la empresa
      // y NO generan crédito personal en el saldo de recapitalización.
      const HERMANOS = ['Mateo', 'Alejandro'];
      const saldoAcum = { Mateo: 0, Alejandro: 0 };

      // ID de la primera rifa (menor numero_rifa o primera por created_at)
      const primeraRifaId = rifasCompletas.length ? rifasCompletas[0].id : null;

      rifasCompletas.forEach(rifa => {
        const esPrimeraRifa = rifa.id === primeraRifaId;

        HERMANOS.forEach(h => {
          // En rifas de empresa la obligación personal es 0 (ya unieron la empresa),
          // pero los pagos que hagan como es_para_recapitalizar SÍ cuentan para
          // saldar la deuda acumulada de las rifas anteriores.
          const aportado = esPrimeraRifa ? 0 :
            rifa.premios
              .filter(p => p.aportante === h && p.es_para_recapitalizar === true)
              .reduce((s, p) => s + Number(p.valor), 0);

          const obligacion        = rifa.es_empresa ? 0 : rifa.recapitalizacion_por_hermano;
          const diferencia        = aportado - obligacion;
          const saldoAntes        = saldoAcum[h];
          const saldoTrasAportado = saldoAntes + aportado;
          saldoAcum[h] += diferencia;

          // Capital ganado = cuánto pasó a territorio positivo con este pago
          // Ej: saldoAntes=-119M, aportado=206M, obligacion=0 → saldoAcum=+87M → capitalGain=87M
          const capitalGain = Math.max(0, saldoAcum[h]) - Math.max(0, saldoAntes);
          if (capitalGain > 0) rifa.capital_total += capitalGain;

          const key = h.toLowerCase();
          rifa[`recap_aportado_${key}`]        = aportado;
          rifa[`recap_obligacion_${key}`]      = obligacion;
          rifa[`recap_diferencia_${key}`]      = diferencia;
          rifa[`recap_saldo_tras_pago_${key}`] = saldoTrasAportado;
          rifa[`recap_saldo_acum_${key}`]      = saldoAcum[h];
          rifa[`recap_capital_gain_${key}`]    = capitalGain;
        });
      });

      // Saldo final actual (última rifa de cada hermano)
      const saldoFinal = {};
      HERMANOS.forEach(h => { saldoFinal[h.toLowerCase()] = saldoAcum[h]; });

      // ── Paso 3: obtener retiros de capital desde gastos ──────────────────
      const { data: retirosRaw } = await supabase
        .from('gastos')
        .select('id, monto, subcategoria, descripcion, fecha')
        .eq('categoria', 'Retiro de Capital')
        .order('fecha', { ascending: true });

      const retiros_capital = (retirosRaw || []).map(g => ({
        id: g.id,
        monto: Number(g.monto),
        inversor: g.subcategoria || null,
        descripcion: g.descripcion || '',
        fecha: g.fecha
      }));

      // Para el frontend: lista en orden DESCENDENTE (más reciente primero)
      const rifasDesc = [...rifasCompletas].reverse();

      return res.status(200).json({
        status: 'ok',
        rifas: rifasDesc,
        retiros_capital,
        saldo_recapitalizacion: saldoFinal   // { mateo: N, alejandro: N }
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // CREAR RIFA
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'crear_rifa') {
      const { nombre, fecha_inicio, fecha_fin, estado, notas, numero_rifa } = payload;
      if (!nombre || !nombre.trim()) return res.status(400).json({ status: 'error', mensaje: 'El nombre de la rifa es obligatorio.' });

      const { data, error } = await supabase
        .from('rifas')
        .insert({
          nombre:       nombre.trim(),
          fecha_inicio: fecha_inicio  || null,
          fecha_fin:    fecha_fin     || null,
          estado:       estado        || 'planificada',
          notas:        notas         || null,
          numero_rifa:  numero_rifa   ? Number(numero_rifa) : null
        })
        .select()
        .single();
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Rifa creada.', rifa: data });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTUALIZAR RIFA
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'actualizar_rifa') {
      const { id, nombre, fecha_inicio, fecha_fin, estado, notas, numero_rifa } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID de la rifa.' });
      if (!nombre || !nombre.trim()) return res.status(400).json({ status: 'error', mensaje: 'El nombre es obligatorio.' });

      const { error } = await supabase
        .from('rifas')
        .update({
          nombre:       nombre.trim(),
          fecha_inicio: fecha_inicio  || null,
          fecha_fin:    fecha_fin     || null,
          estado:       estado        || 'planificada',
          notas:        notas         || null,
          numero_rifa:  numero_rifa   ? Number(numero_rifa) : null
        })
        .eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Rifa actualizada.' });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ELIMINAR RIFA (también elimina premios y capitalización por CASCADE)
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'eliminar_rifa') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID.' });

      const { error } = await supabase.from('rifas').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Rifa eliminada.' });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PREMIOS — CRUD
    // ══════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    // GUARDAR PREMIO (crear o actualizar)
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'guardar_premio') {
      const { id, rifa_id, nombre, valor, aportante, descripcion, requiere_recapitalizacion, es_para_recapitalizar, origen_premio_id } = payload;
      if (!rifa_id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID de la rifa.' });
      if (!nombre || !nombre.trim()) return res.status(400).json({ status: 'error', mensaje: 'El nombre del aporte es obligatorio.' });
      if (!aportante || !aportante.trim()) return res.status(400).json({ status: 'error', mensaje: 'Debes seleccionar quién aportó este valor.' });
      if (!valor || Number(valor) <= 0) return res.status(400).json({ status: 'error', mensaje: 'El valor debe ser mayor a 0.' });

      const campos = {
        rifa_id,
        nombre:                    nombre.trim(),
        valor:                     Math.round(Number(valor)),
        aportante:                 aportante || null,
        descripcion:               descripcion || null,
        requiere_recapitalizacion: requiere_recapitalizacion === true || requiere_recapitalizacion === 'true',
        es_para_recapitalizar:     es_para_recapitalizar     === true || es_para_recapitalizar     === 'true',
        origen_premio_id:          origen_premio_id || null
      };

      if (id) {
        const { error } = await supabase.from('premios_rifa').update(campos).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('premios_rifa').insert(campos);
        if (error) throw error;
      }

      return res.status(200).json({ status: 'ok', mensaje: 'Premio guardado.' });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ELIMINAR PREMIO
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'eliminar_premio') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del premio.' });

      const { error } = await supabase.from('premios_rifa').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Premio eliminado.' });
    }

    // ══════════════════════════════════════════════════════════════════════
    // CAPITALIZACIÓN — CRUD
    // ══════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    // GUARDAR CAPITALIZACIÓN (crear o actualizar)
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'guardar_capitalizacion') {
      const { id, rifa_id, socio, monto_obligacion, porcentaje_utilidad, notas } = payload;
      if (!rifa_id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID de la rifa.' });
      if (!socio || !socio.trim()) return res.status(400).json({ status: 'error', mensaje: 'El nombre del socio es obligatorio.' });

      const pct = Number(porcentaje_utilidad) || 0;
      if (pct < 0 || pct > 100) return res.status(400).json({ status: 'error', mensaje: 'El porcentaje debe estar entre 0 y 100.' });

      const campos = {
        rifa_id,
        socio:               socio.trim(),
        monto_obligacion:    Math.round(Number(monto_obligacion) || 0),
        porcentaje_utilidad: pct,
        notas:               notas || null
      };

      if (id) {
        const { error } = await supabase.from('capitalizacion_rifa').update(campos).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('capitalizacion_rifa').insert(campos);
        if (error) {
          if (error.code === '23505') return res.status(400).json({ status: 'error', mensaje: `Ya existe una entrada de capitalización para "${socio}" en esta rifa.` });
          throw error;
        }
      }

      return res.status(200).json({ status: 'ok', mensaje: 'Capitalización guardada.' });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ELIMINAR CAPITALIZACIÓN
    // ─────────────────────────────────────────────────────────────────────
    if (accion === 'eliminar_capitalizacion') {
      const { id } = payload;
      if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el ID.' });

      const { error } = await supabase.from('capitalizacion_rifa').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ status: 'ok', mensaje: 'Capitalización eliminada.' });
    }

    return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });

  } catch (error) {
    console.error('[rifas]', error);
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
