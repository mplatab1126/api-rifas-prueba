import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * Reinicia el panel de ventas de la RIFA PRINCIPAL (4 cifras / tabla `boletas`).
 *
 * Flujo:
 *   1. Snapshot de las boletas VENDIDAS (con telefono_cliente != null) a
 *      `historial_boletas_principal`, marcadas con el nombre de la rifa que cierra.
 *   2. Snapshot de los abonos con tipo='4cifras' a `historial_abonos_principal`.
 *   3. Borra los abonos 4cifras de la tabla activa (para que las estadísticas y
 *      el panel solo vean los abonos de la rifa nueva).
 *   4. Resetea todas las 10.000 filas de `boletas` a estado Disponible y
 *      actualiza `precio_total` al precio que pase el frontend.
 *   5. NO toca: `transferencias`, `registro_movimientos`, `gastos`, `clientes`,
 *      `rifas`, `premios_rifa`, `capitalizacion_rifa`. Toda la información
 *      contable de la rifa anterior queda disponible para el cierre financiero.
 *
 * Acceso: misma regla que `nueva-rifa.js` (permiso `rifas-menu` o gerencia).
 */
export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, rifaNombre, rifaId, nuevoPrecio } = req.body || {};

  // ── 1. Validación de asesor + permisos ────────────────────────────────
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const { data: permRow } = await supabase
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', nombreAsesor)
    .eq('pagina_id', 'rifas-menu')
    .maybeSingle();
  const tienePermiso = permRow
    ? permRow.permitido
    : ['mateo', 'alejo p', 'alejo plata'].includes(nombreAsesor.toLowerCase().trim());
  if (!tienePermiso) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso para reiniciar la rifa principal.' });
  }

  // ── 2. Validación de entrada ──────────────────────────────────────────
  if (!rifaNombre || !rifaNombre.trim()) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el nombre de la rifa que se está cerrando (ej: "Perla Roja").' });
  }
  const precio = Number(nuevoPrecio);
  if (!precio || precio <= 0) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el nuevo precio de la boleta (ej: 150000).' });
  }
  const nombreRifa = rifaNombre.trim();

  try {
    // ── 3. Snapshot de boletas vendidas ─────────────────────────────────
    const { data: boletasVendidas, error: errBoletas } = await supabase
      .from('boletas')
      .select('*')
      .not('telefono_cliente', 'is', null);
    if (errBoletas) throw new Error('Leer boletas vendidas: ' + errBoletas.message);

    const snapshotBoletas = (boletasVendidas || []).map(b => ({
      rifa_id:          rifaId || null,
      rifa_nombre:      nombreRifa,
      numero:           b.numero,
      estado:           b.estado,
      nombre_cliente:   b.nombre_cliente,
      telefono_cliente: b.telefono_cliente,
      total_abonado:   Number(b.total_abonado || 0),
      saldo_restante:  Number(b.saldo_restante || 0),
      precio_total:    Number(b.precio_total || 0),
      asesor:           b.asesor,
      mostrado:         b.mostrado || false
    }));

    let boletasArchivadas = 0;
    if (snapshotBoletas.length > 0) {
      // Insertar en lotes de 500 para no pasar el límite del cliente de Supabase.
      const LOTE = 500;
      for (let i = 0; i < snapshotBoletas.length; i += LOTE) {
        const lote = snapshotBoletas.slice(i, i + LOTE);
        const { error: errIns } = await supabase
          .from('historial_boletas_principal')
          .insert(lote);
        if (errIns) throw new Error(`Archivar boletas (lote ${i}-${i + lote.length}): ${errIns.message}`);
        boletasArchivadas += lote.length;
      }
    }

    // ── 4. Snapshot de abonos 4cifras ───────────────────────────────────
    const { data: abonos4, error: errAbonos } = await supabase
      .from('abonos')
      .select('*')
      .eq('tipo', '4cifras');
    if (errAbonos) throw new Error('Leer abonos 4cifras: ' + errAbonos.message);

    const snapshotAbonos = (abonos4 || []).map(a => ({
      rifa_id:         rifaId || null,
      rifa_nombre:     nombreRifa,
      abono_id_origen: a.id,
      data:            a
    }));

    let abonosArchivados = 0;
    if (snapshotAbonos.length > 0) {
      const LOTE = 500;
      for (let i = 0; i < snapshotAbonos.length; i += LOTE) {
        const lote = snapshotAbonos.slice(i, i + LOTE);
        const { error: errIns } = await supabase
          .from('historial_abonos_principal')
          .insert(lote);
        if (errIns) throw new Error(`Archivar abonos (lote ${i}-${i + lote.length}): ${errIns.message}`);
        abonosArchivados += lote.length;
      }
    }

    // ── 5. Borrar los abonos 4cifras de la tabla activa ────────────────
    // (ya quedaron en historial_abonos_principal)
    const { error: errDelAbonos } = await supabase
      .from('abonos')
      .delete()
      .eq('tipo', '4cifras');
    if (errDelAbonos) throw new Error('Borrar abonos 4cifras activos: ' + errDelAbonos.message);

    // ── 6. Reset de las 10.000 filas de `boletas` ──────────────────────
    // El UPDATE toca TODAS las filas (.neq('numero','') es siempre verdadero
    // pero satisface el requisito de Supabase de tener un filtro).
    const resetPayload = {
      estado:           'Disponible',
      nombre_cliente:   '',
      telefono_cliente: null,
      total_abonado:    0,
      saldo_restante:   precio,
      precio_total:     precio,
      asesor:           null,
      mostrado:         false
    };
    const { error: errReset } = await supabase
      .from('boletas')
      .update(resetPayload)
      .neq('numero', '');
    if (errReset) throw new Error('Reset de boletas: ' + errReset.message);

    return res.status(200).json({
      status: 'ok',
      mensaje: `Rifa "${nombreRifa}" archivada. Panel listo para la nueva rifa.`,
      resumen: {
        boletas_archivadas: boletasArchivadas,
        abonos_archivados:  abonosArchivados,
        nuevo_precio:       precio
      }
    });

  } catch (e) {
    console.error('[reiniciar-rifa-principal]', e);
    return res.status(500).json({ status: 'error', mensaje: e.message || 'Error interno' });
  }
}
