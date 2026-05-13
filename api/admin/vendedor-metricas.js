import { supabaseAdmin as supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * Devuelve 3 métricas personales del asesor para la rifa principal (4 cifras):
 *   - boletas_vendidas: cuántas filas de `boletas` tiene asignadas con cliente.
 *   - recaudado: suma de total_abonado en sus boletas.
 *   - por_cobrar: suma de saldo_restante en sus boletas.
 *
 * Acceso: cualquier asesor con permiso `vendedores-panel` (o gerencia).
 * Cada asesor solo ve sus propios números (filtro por nombre del asesor
 * que se identifica con la contraseña).
 */
export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  // ── Verificar permiso de acceso ─────────────────────────────────────
  const nameLower = nombreAsesor.toLowerCase().trim();
  const esGerencia = ['mateo', 'alejo p', 'alejo plata'].includes(nameLower);

  const { data: permRow } = await supabase
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', nombreAsesor)
    .eq('pagina_id', 'vendedores-panel')
    .maybeSingle();
  const tienePermiso = permRow ? permRow.permitido : esGerencia;
  if (!tienePermiso) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso al panel de vendedores.' });
  }

  try {
    // ── Traer las boletas vendidas por este asesor en la rifa principal ─
    const { data: boletas, error } = await supabase
      .from('boletas')
      .select('numero, total_abonado, saldo_restante, estado')
      .eq('asesor', nombreAsesor)
      .not('telefono_cliente', 'is', null);
    if (error) throw error;

    let boletasVendidas = 0;
    let recaudado = 0;
    let porCobrar = 0;
    for (const b of boletas || []) {
      boletasVendidas += 1;
      recaudado += Number(b.total_abonado || 0);
      porCobrar  += Number(b.saldo_restante || 0);
    }

    return res.status(200).json({
      status: 'ok',
      asesor: nombreAsesor,
      metricas: {
        boletas_vendidas: boletasVendidas,
        recaudado,
        por_cobrar: porCobrar
      }
    });
  } catch (e) {
    console.error('[vendedor-metricas]', e);
    return res.status(500).json({ status: 'error', mensaje: e.message || 'Error interno' });
  }
}
