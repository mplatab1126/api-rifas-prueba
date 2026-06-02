import { supabaseAdmin } from './supabase.js';

// ──────────────────────────────────────────────────────────────────────────
// Helper centralizado para saber qué asesores son "independientes".
//
// Antes esta información estaba pegada a mano en 7 archivos distintos
// (todos desincronizados). Ahora se lee de la tabla `asesores_config`
// y queda cacheada un minuto en memoria del serverless para no
// machacar la BD en cada request.
//
// IMPORTANTE: el cache es por instancia de la función serverless. Si
// Mateo cambia el flag en la pestaña Asesores, en el peor caso le
// toma hasta 60s reflejarse en todos los endpoints.
// ──────────────────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
let cacheLista = null;
let cacheTime = 0;

export async function listarIndependientes() {
  const now = Date.now();
  if (cacheLista && (now - cacheTime) < TTL_MS) return cacheLista;

  const { data, error } = await supabaseAdmin
    .from('asesores_config')
    .select('asesor_nombre')
    .eq('es_independiente', true);

  if (error) {
    console.error('[asesores.js] Error al leer asesores_config:', error.message);
    // Si la consulta falla, devolvemos lo último cacheado o vacío.
    // Nunca devolvemos la lista vieja hardcoded para no enmascarar el fallo.
    return cacheLista || [];
  }

  cacheLista = (data || []).map(r => String(r.asesor_nombre || '').toLowerCase().trim());
  cacheTime = now;
  return cacheLista;
}

export async function esIndependiente(nombre) {
  if (!nombre) return false;
  const n = String(nombre).toLowerCase().trim();
  const lista = await listarIndependientes();
  return lista.includes(n);
}

// Devuelve 'independiente' o 'regular'. Útil para los mensajes de error
// y la separación visual en caja.
export async function grupoDeAsesor(nombre) {
  return (await esIndependiente(nombre)) ? 'independiente' : 'regular';
}

// Invalida el cache. Llamar después de actualizar un flag para que el
// cambio se vea inmediatamente (en la misma instancia serverless).
export function invalidarCacheAsesores() {
  cacheLista = null;
  cacheTime = 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Permisos de líneas de WhatsApp (multi-línea).
//
// GERENCIA ve TODAS las líneas. Un asesor ve solo las líneas que tenga
// asignadas en la tabla lineas_asesores. Para cambiar quién es gerencia,
// edita esta lista (es el único lugar).
// ──────────────────────────────────────────────────────────────────────────
const GERENCIA = ['mateo', 'alejo plata'];

export function esGerencia(nombre) {
  return GERENCIA.includes(String(nombre || '').toLowerCase().trim());
}

// IDs (phone_number_id) de las líneas que puede ver un asesor.
// Gerencia → null (significa "todas"). Asesor → array de sus líneas.
export async function lineasDeAsesor(nombre) {
  if (esGerencia(nombre)) return null;
  const { data } = await supabaseAdmin
    .from('lineas_asesores')
    .select('phone_number_id')
    .eq('asesor', nombre);
  return (data || []).map(r => r.phone_number_id);
}

// ¿Este asesor puede ver/usar esta línea?
export async function puedeVerLinea(nombre, lineaId) {
  if (esGerencia(nombre)) return true;
  if (!lineaId) return false;
  const { data } = await supabaseAdmin
    .from('lineas_asesores')
    .select('phone_number_id')
    .eq('asesor', nombre)
    .eq('phone_number_id', lineaId)
    .maybeSingle();
  return !!data;
}
