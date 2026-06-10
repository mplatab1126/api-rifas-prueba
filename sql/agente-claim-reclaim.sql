-- H12 (auditoría Liliana, 10-jun-2026): re-claim de turnos MUERTOS.
--
-- El claim anti-duplicado (agente_respondido_ms) se escribe ANTES de responder.
-- Si la corrida muere después de reclamar (crash, timeout de Vercel), ese mensaje
-- quedaba SIN RESPUESTA PARA SIEMPRE: cualquier re-disparo del mismo mensaje perdía
-- el claim. Ahora: se guarda CUÁNDO se reclamó (agente_claim_at) y se permite
-- re-reclamar el MISMO mensaje si pasaron >5 min y NUNCA salió una respuesta
-- posterior a él (la corrida anterior murió sin responder). Atómico, en la base.
--
-- Lo usa el barredor de chats trabados (recordatorios-cron.js) y cualquier
-- re-disparo manual (botón de la cabina).

alter table public.conversaciones_whatsapp
  add column if not exists agente_claim_at timestamptz;

create or replace function public.agente_claim_respuesta(p_conv uuid, p_hasta_ms bigint)
returns boolean
language sql
set search_path to 'public'
as $function$
  with upd as (
    update conversaciones_whatsapp c
       set agente_respondido_ms = p_hasta_ms,
           agente_claim_at = now()
     where c.id = p_conv
       and (
         c.agente_respondido_ms is null
         or c.agente_respondido_ms < p_hasta_ms
         -- RE-CLAIM de un turno muerto: mismo mensaje, reclamado hace >5 min,
         -- y NUNCA salió una respuesta posterior a él.
         or (
           c.agente_respondido_ms = p_hasta_ms
           and coalesce(c.agente_claim_at, now() - interval '1 hour') < now() - interval '5 minutes'
           and not exists (
             select 1 from mensajes_whatsapp m
              where m.conversacion_id = p_conv
                and m.direccion = 'saliente'
                and m.timestamp_wa > to_timestamp(p_hasta_ms / 1000.0)
           )
         )
       )
    returning c.id
  )
  select exists (select 1 from upd);
$function$;
