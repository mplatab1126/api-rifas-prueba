-- ============================================================================
-- H35 — EMBUDO DE VENTAS DEL AGENTE (contacto → premios → números → datos →
--        apartó → abonó → pagó), por línea y ventana de días.
--
-- Aplicada en producción el 2026-06-10 (migraciones agente_embudo_resumen_h35
-- y _v2). Este archivo es la copia versionada (regla H38: todo cambio de la
-- base nace/queda en sql/).
--
-- CÓMO MIDE (importante para leer los números):
--  - Hitos de CONVERSACIÓN (contactos, premios, números, datos): cuentan
--    teléfonos únicos con la nota que el motor ya deja en agente_actividad.
--    Aproximados: la explicación de premios que redacta la IA SIN atajo no
--    deja nota (premios/datos subcontados; contactos y números sí son firmes).
--  - Hitos con VERDAD EN LA BASE (apartaron, abonaron, boletas, plata):
--    salen de boletas/abonos con asesor = el dueño de la línea (ej. Liliana).
--    OJO: "abonaron" incluye clientes con boleta vendida ANTES de la ventana
--    que abonaron dentro de ella (cobros), por eso puede superar a "apartaron".
--
-- Quién la llama: api/whatsapp/agente-costo.js (accion 'embudo', solo Mateo),
-- con la llave maestra (service_role). anon/authenticated NO pueden ejecutarla.
-- ============================================================================

create or replace function public.agente_embudo_resumen(p_linea text, p_dias int default 7)
returns json
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_dias int := greatest(1, least(90, coalesce(p_dias, 7)));
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(90, coalesce(p_dias, 7))));
  v_asesor text;
  v_embudo json;
  v_ventas json;
begin
  select asesor into v_asesor from lineas_asesores where phone_number_id = p_linea limit 1;
  if v_asesor is null or v_asesor = '' then v_asesor := 'Liliana'; end if;

  select json_build_object(
    'contactos', count(distinct telefono) filter (where resumen like '%Envié el contacto inicial%'),
    'premios',   count(distinct telefono) filter (where resumen like '%Expliqué los premios%'),
    'numeros',   count(distinct telefono) filter (where resumen like '%Mostré los números%'
                   or resumen like '%Consulté los números disponibles%'
                   or resumen like '%Verifiqué el número%'),
    'datos',     count(distinct telefono) filter (where resumen like '%Pedí los datos%')
  ) into v_embudo
  from agente_actividad
  where linea_id = p_linea and tipo = 'nota' and created_at >= v_desde;

  select json_build_object(
    'apartaron',        (select count(distinct telefono_cliente) from boletas b
                          where b.asesor = v_asesor and b.fecha_venta >= v_desde),
    'abonaron',         (select count(distinct b.telefono_cliente)
                          from abonos a join boletas b on b.numero = a.numero_boleta
                          where a.asesor = v_asesor and a.fecha_pago >= v_desde),
    'boletas_vendidas', count(*),
    'boletas_pagadas',  count(*) filter (where saldo_restante <= 0),
    'monto_abonado', coalesce((select sum(a.monto) from abonos a where a.asesor = v_asesor and a.fecha_pago >= v_desde), 0),
    'abonos_n',      coalesce((select count(*)    from abonos a where a.asesor = v_asesor and a.fecha_pago >= v_desde), 0)
  ) into v_ventas
  from boletas where asesor = v_asesor and fecha_venta >= v_desde;

  return json_build_object('dias', v_dias, 'asesor', v_asesor, 'embudo', v_embudo, 'ventas', v_ventas);
end $$;

-- Solo el backend (service_role) puede ejecutarla.
revoke all on function public.agente_embudo_resumen(text, int) from public;
revoke all on function public.agente_embudo_resumen(text, int) from anon;
revoke all on function public.agente_embudo_resumen(text, int) from authenticated;
grant execute on function public.agente_embudo_resumen(text, int) to service_role;
