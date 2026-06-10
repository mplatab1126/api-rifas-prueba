-- ============================================================================
-- H87 — UNA SOLA IDA A LA BASE POR CICLO DEL DEBOUNCE DEL AGENTE.
--
-- Aplicada en producción el 2026-06-10 (migración agente_lock_y_ultimo_h87).
-- Este archivo es la copia versionada (regla H38).
--
-- Qué hace: refresca el candado del agente (agente_procesando_at = now(), igual
-- que agente_refrescar_lock) Y devuelve el último mensaje del chat, en un solo
-- viaje. El motor (agente-responder.js, bucle del debounce) la llama cada ~3s
-- mientras espera a que el cliente termine de escribir; antes hacía DOS viajes
-- por ciclo (~40 por turno). La lógica de cortes (¿es entrante?, ¿cuánto
-- silencio?) se queda en el motor.
--
-- Permisos: los mismos de agente_refrescar_lock (anon, authenticated,
-- service_role) — el motor debe poder llamarla siempre.
-- ============================================================================

create or replace function public.agente_lock_y_ultimo(p_conv uuid)
returns table (direccion text, timestamp_wa timestamptz, created_at timestamptz)
language sql
set search_path to 'public'
as $$
  update conversaciones_whatsapp set agente_procesando_at = now() where id = p_conv;
  select m.direccion, m.timestamp_wa, m.created_at
  from mensajes_whatsapp m
  where m.conversacion_id = p_conv
  order by m.timestamp_wa desc
  limit 1;
$$;

grant execute on function public.agente_lock_y_ultimo(uuid) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
