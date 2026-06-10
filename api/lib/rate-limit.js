/**
 * Límite de tasa (H20/H40 de la auditoría): frena la enumeración de datos de
 * clientes y el abuso de los endpoints públicos, SIN tumbar nunca el negocio.
 *
 * - El conteo vive en la base (función `rate_limit_check`, ver
 *   sql/rate-limit.sql): una llamada = un registro; la función cuenta los de la
 *   ventana y responde si se permite.
 * - FAIL-OPEN a propósito: si el contador falla (base caída, RPC ausente), se
 *   PERMITE la petición. Es preferible perder el freno un rato que bloquear
 *   ventas o consultas legítimas por un error del contador.
 */

import { supabaseAdmin } from './supabase.js';

// La IP real del visitante. En Vercel viene en x-forwarded-for (el primer valor).
export function ipDe(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'desconocida';
}

// ¿Se permite esta llamada? clave = quién/qué se cuenta (ej. "abonar-cliente:1.2.3.4"),
// ventanaSeg = tamaño de la ventana en segundos, limite = máximo de llamadas en ella.
export async function permitido(clave, ventanaSeg, limite) {
  try {
    const { data, error } = await supabaseAdmin.rpc('rate_limit_check', {
      p_clave: clave, p_ventana_seg: ventanaSeg, p_limite: limite,
    });
    if (error) return true;   // fail-open
    return data !== false;
  } catch (_) {
    return true;              // fail-open
  }
}
