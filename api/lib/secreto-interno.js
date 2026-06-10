/**
 * Secreto INTERNO servidor-a-servidor (H39).
 *
 * Autoriza las llamadas internas entre piezas del sistema: el webhook dispara el motor
 * del agente, los pg_cron de Supabase llaman los crons de Vercel, y el agente le fija
 * el vendedor a reservar.js. Antes se reutilizaba WHATSAPP_VERIFY_TOKEN (la palabra del
 * "apretón de manos" con Meta): de baja entropía, conocida también en el panel de Meta y
 * comparada sin tiempo constante. Ahora el secreto vive en la variable de entorno
 * AGENTE_INTERNO_SECRET (32 bytes aleatorios) y se compara a tiempo constante.
 *
 * WHATSAPP_VERIFY_TOKEN queda SOLO para el handshake GET de Meta (recibir.js).
 *
 * TRANSICIÓN: mientras AGENTE_INTERNO_SECRET no exista en el entorno, todo sigue
 * funcionando con el verify token (los emisores lo mandan y los validadores lo aceptan).
 * Cuando exista, los emisores mandan el nuevo; los validadores aceptan AMBOS hasta que
 * los pg_cron de Supabase queden actualizados — después se puede quitar la aceptación
 * del viejo (ver ACEPTAR_VIEJO abajo).
 */

import crypto from 'crypto';

// Apagar cuando los pg_cron ya manden el secreto nuevo y esté verificado al aire.
const ACEPTAR_VIEJO = true;

// El secreto que deben MANDAR los emisores internos (recibir.js, agente.js, crons, motor).
export function secretoInterno() {
  return process.env.AGENTE_INTERNO_SECRET || process.env.WHATSAPP_VERIFY_TOKEN || '';
}

// Comparación a tiempo constante (timingSafeEqual LANZA si los largos difieren → guardia).
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (!ba.length || !bb.length || ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}

// ¿El valor recibido autoriza una llamada interna? (validadores)
export function esSecretoInternoValido(valor) {
  if (igualSeguro(valor, process.env.AGENTE_INTERNO_SECRET)) return true;
  if (ACEPTAR_VIEJO && igualSeguro(valor, process.env.WHATSAPP_VERIFY_TOKEN)) return true;
  return false;
}
