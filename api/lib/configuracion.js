import { supabaseAdmin } from './supabase.js';

// ──────────────────────────────────────────────────────────────────────────
// Helper para leer interruptores globales del sistema (tabla `configuracion`).
//
// La tabla es un simple clave/valor. Por ahora solo se usa para
// `pendiente_habilitado` (controla si los asesores pueden registrar pagos
// en modo "Pendiente"). Está pensada para agregar más interruptores en el
// futuro sin cambiar la estructura.
// ──────────────────────────────────────────────────────────────────────────

export async function obtenerConfig(clave) {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', clave)
    .maybeSingle();
  return data ? data.valor : null;
}

// ¿Está habilitado el modo "Pendiente" para los asesores?
export async function pendienteHabilitado() {
  return (await obtenerConfig('pendiente_habilitado')) === 'true';
}
