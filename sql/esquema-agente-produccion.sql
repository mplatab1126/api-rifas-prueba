-- ═══════════════════════════════════════════════════════════════════════════
-- INSTANTÁNEA DE REFERENCIA del esquema de producción (H38) — 10-jun-2026
--
-- ⚠️ NO ejecutar este archivo a ciegas contra producción: es un VOLCADO para
--    poder auditar y revisar la lógica que vive en la base (candados del
--    agente, filtros de la bandeja, difusiones). La fuente de la verdad es la
--    base de Supabase (proyecto ikvzmojzgpxuhnbymtxm).
-- ⚠️ El secreto interno de los crons está REDACTADO (<SECRETO_INTERNO> =
--    AGENTE_INTERNO_SECRET desde el 10-jun (H39), vive en Vercel y en cron.job
--    de la base; WHATSAPP_VERIFY_TOKEN quedó SOLO para el handshake GET de Meta).
-- 📌 Regla desde el 10-jun: todo cambio nuevo en la base debe quedar también
--    en su propio archivo de sql/ (como trasladar-abono-atomico.sql,
--    agente-claim-reclaim.sql, rate-limit.sql, versionado-manual-liliana.sql).
-- 📌 OJO: sql/whatsapp-buzon.sql es VIEJO (declara telefono UNIQUE global;
--    la realidad es unicidad por línea+teléfono). Vale este volcado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── TABLAS (solo nombres; columnas en el panel de Supabase) ─────────────────
-- abonos, abonos_historico, agente_actividad, agente_alertas_estado,
-- agente_casos_dorados, agente_config, agente_config_historial,
-- agente_herramientas, agente_uso, asesores, asesores_config,
-- backup_llave_liberadas_2026_06_01, bitacora, boletas, boletas_historico,
-- capitalizacion_rifa, categorias_gastos, cierres_caja, clientes,
-- configuracion, conversacion_etiquetas, conversaciones_whatsapp,
-- costos_whatsapp, cuentas_sociales, difusion_destinatarios, difusiones,
-- disparadores, etiquetas, finanzas_alejo_* (6), ganadores_principales,
-- gastos, historial_rifas, horarios_asesores, lineas_asesores,
-- lineas_whatsapp, llamadas_twilio, mensajes_whatsapp, metricas_facebook,
-- movimientos_caja, otp_codes, permisos_asesores, plantillas_difusion,
-- plantillas_whatsapp, premios_rifa, rate_limit_hits, recordatorios,
-- registro_movimientos, registro_sorteo, registro_sorteo_apto,
-- rendimiento_asesores, respuestas_rapidas, rifas, sesiones_app,
-- transferencias, verificaciones_pago
-- (TODAS con RLS prendido; solo el backend con la llave maestra entra.)

-- ── CRONS (pg_cron → net.http_post a Vercel con el secreto interno) ─────────
-- 1 | recordatorios-agente-cada-minuto   | * * * * *    → /api/whatsapp/recordatorios-cron (incluye el BARREDOR de chats trabados, H12)
-- 3 | etiquetas-estado-cada-5min         | */5 * * * *  → select public.sincronizar_etiquetas_estado();
-- 5 | verificar-pagos-cada-5min          | */5 * * * *  → /api/whatsapp/verificar-pagos-cron
-- 6 | difusiones-programadas-cada-minuto | * * * * *    → /api/whatsapp/difusiones-cron
-- 7 | alertas-agente-cada-15min          | */15 * * * * → /api/whatsapp/alertas-cron (H16)

-- ═════════════ CANDADOS DEL AGENTE (anti doble respuesta / anti duplicado) ══

CREATE OR REPLACE FUNCTION public.agente_tomar_lock(p_conv uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with upd as (
    update conversaciones_whatsapp
       set agente_procesando_at = now()
     where id = p_conv
       and (agente_procesando_at is null or agente_procesando_at < now() - interval '60 seconds')
    returning id
  )
  select exists (select 1 from upd);
$function$;

CREATE OR REPLACE FUNCTION public.agente_refrescar_lock(p_conv uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update conversaciones_whatsapp set agente_procesando_at = now() where id = p_conv;
$function$;

CREATE OR REPLACE FUNCTION public.agente_soltar_lock(p_conv uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update conversaciones_whatsapp set agente_procesando_at = null where id = p_conv;
$function$;

-- (la versión vigente, con RE-CLAIM de turnos muertos, también está en
--  sql/agente-claim-reclaim.sql con su explicación)
CREATE OR REPLACE FUNCTION public.agente_claim_respuesta(p_conv uuid, p_hasta_ms bigint)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with upd as (
    update conversaciones_whatsapp c
       set agente_respondido_ms = p_hasta_ms,
           agente_claim_at = now()
     where c.id = p_conv
       and (
         c.agente_respondido_ms is null
         or c.agente_respondido_ms < p_hasta_ms
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

-- ═════════════ VERSIONADO DEL MANUAL (H15; también en versionado-manual-liliana.sql) ══

CREATE OR REPLACE FUNCTION public.agente_config_guardar_historial()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (old.prompt is distinct from new.prompt) or (old.variables is distinct from new.variables) then
    insert into agente_config_historial (linea_id, prompt, variables, actualizado_por)
    values (old.linea_id, old.prompt, old.variables, old.actualizado_por);
  end if;
  return new;
end $function$;

-- ═════════════ COSTOS DEL AGENTE (tarjeta "Gasto de IA") ════════════════════

CREATE OR REPLACE FUNCTION public.agente_costo_chat(p_conv uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'costo_usd',     coalesce(sum(costo_usd), 0),
    'llamadas',      coalesce(count(*), 0),
    'input_tokens',  coalesce(sum(input_tokens), 0),
    'output_tokens', coalesce(sum(output_tokens), 0)
  )
  from public.agente_uso
  where conversacion_id = p_conv;
$function$;

CREATE OR REPLACE FUNCTION public.agente_costo_resumen(p_linea text)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'hoy_usd',      coalesce(sum(costo_usd) filter (where created_at >= (date_trunc('day',   timezone('America/Bogota', now())) at time zone 'America/Bogota')), 0),
    'mes_usd',      coalesce(sum(costo_usd) filter (where created_at >= (date_trunc('month', timezone('America/Bogota', now())) at time zone 'America/Bogota')), 0),
    'total_usd',    coalesce(sum(costo_usd), 0),
    'hoy_llamadas', coalesce(count(*)       filter (where created_at >= (date_trunc('day',   timezone('America/Bogota', now())) at time zone 'America/Bogota')), 0),
    'mes_llamadas', coalesce(count(*)       filter (where created_at >= (date_trunc('month', timezone('America/Bogota', now())) at time zone 'America/Bogota')), 0)
  )
  from public.agente_uso
  where linea_id = p_linea;
$function$;

-- ═════════════ BANDEJA: filtro avanzado en el servidor ══════════════════════

CREATE OR REPLACE FUNCTION public.bandeja_filtrar(p_linea_id text, p_modo text DEFAULT 'y'::text, p_condiciones jsonb DEFAULT '[]'::jsonb, p_q text DEFAULT NULL::text, p_ocultar_agente boolean DEFAULT false, p_limite integer DEFAULT 300)
 RETURNS SETOF conversaciones_whatsapp
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cond jsonb;
  v_tipo text;
  v_op   text;
  v_pred text;
  v_tags text;
  v_n    int;
  v_preds text[] := '{}';
  v_search text := null;
  v_connector text;
  v_sql text;
  v_dias int;
  v_fecha text;
begin
  for v_cond in select value from jsonb_array_elements(coalesce(p_condiciones, '[]'::jsonb)) loop
    v_tipo := v_cond->>'tipo';
    v_op   := coalesce(v_cond->>'op', 'tiene');
    v_pred := null;

    if v_tipo = 'etiqueta' then
      select string_agg(format('%L::uuid', e), ','), count(*)
        into v_tags, v_n
      from jsonb_array_elements_text(coalesce(v_cond->'etiquetas', '[]'::jsonb)) as e
      where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      if v_tags is not null then
        if v_op = 'todas' then
          v_pred := format('(select count(distinct ce.etiqueta_id) from conversacion_etiquetas ce where ce.conversacion_id = c.id and ce.etiqueta_id in (%s)) = %s', v_tags, v_n::text);
        elsif v_op = 'no_tiene' then
          v_pred := format('not exists (select 1 from conversacion_etiquetas ce where ce.conversacion_id = c.id and ce.etiqueta_id in (%s))', v_tags);
        else
          v_pred := format('exists (select 1 from conversacion_etiquetas ce where ce.conversacion_id = c.id and ce.etiqueta_id in (%s))', v_tags);
        end if;
      end if;

    elsif v_tipo = 'sin_respuesta' then
      v_pred := case when v_op = 'no_tiene' then '(c.ultimo_entrante is not true)' else '(c.ultimo_entrante = true)' end;

    elsif v_tipo = 'recordatorio' then
      v_pred := format('exists (select 1 from recordatorios r where r.conversacion_id = c.id and r.estado = %L)',
                       case when (v_cond->>'estado') = 'enviado' then 'enviado' else 'pendiente' end);
      if v_op = 'no_tiene' then v_pred := 'not ' || v_pred; end if;

    elsif v_tipo = 'creado' then
      if (v_cond->>'op') = 'ultimos_dias' then
        v_dias := greatest(1, least(coalesce(nullif(v_cond->>'dias','')::int, 7), 3650));
        v_pred := format('c.created_at >= now() - (%s || '' days'')::interval', v_dias::text);
      elsif (v_cond->>'op') in ('antes','despues') and (v_cond->>'fecha') ~ '^\d{4}-\d{2}-\d{2}$' then
        v_fecha := v_cond->>'fecha';
        if (v_cond->>'op') = 'antes' then
          v_pred := format('c.created_at < %L::timestamptz', v_fecha || ' 23:59:59-05');
        else
          v_pred := format('c.created_at >= %L::timestamptz', v_fecha || ' 00:00:00-05');
        end if;
      end if;
    end if;

    if v_pred is not null and v_pred <> '' then
      v_preds := array_append(v_preds, '(' || v_pred || ')');
    end if;
  end loop;

  if p_q is not null and btrim(p_q) <> '' then
    if btrim(p_q) ~ '^[0-9 +()-]+$' then
      v_search := format('c.telefono ilike %L', '%' || regexp_replace(p_q, '\D', '', 'g') || '%');
    else
      v_search := format('c.nombre_perfil ilike %L', '%' || btrim(p_q) || '%');
    end if;
  end if;

  v_connector := case when lower(coalesce(p_modo, 'y')) = 'o' then ' or ' else ' and ' end;

  v_sql := 'select c.* from conversaciones_whatsapp c where c.linea_id = $1 and c.ultimo_at is not null';
  if p_ocultar_agente then
    v_sql := v_sql || ' and (c.agente_activo is null or c.agente_activo = false)';
  end if;
  if v_search is not null then
    v_sql := v_sql || ' and (' || v_search || ')';
  end if;
  if array_length(v_preds, 1) is not null then
    v_sql := v_sql || ' and (' || array_to_string(v_preds, v_connector) || ')';
  end if;
  v_sql := v_sql || ' order by c.ultimo_at desc nulls last limit ' || greatest(1, least(coalesce(p_limite, 300), 500))::text;

  return query execute v_sql using p_linea_id;
end;
$function$;

-- ═════════════ DIFUSIONES (audiencia + reclamo atómico de lotes) ════════════

CREATE OR REPLACE FUNCTION public.difusion_audiencia(p_linea text, p_filtros jsonb)
 RETURNS TABLE(telefono text, nombre text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with f as (
    select
      coalesce(p_filtros->>'tipo','todos')        as tipo,
      coalesce(p_filtros->>'estado_pago','todos')  as estado_pago,
      nullif(btrim(coalesce(p_filtros->>'ciudad','')),'') as ciudad,
      nullif(p_filtros->>'etiqueta_id','')         as etiqueta_id
  ),
  conv as (
    select c.id, c.telefono, c.nombre_perfil,
           right(regexp_replace(c.telefono,'\D','','g'),10) as tel10
    from conversaciones_whatsapp c
    where c.linea_id = p_linea and c.telefono is not null
  ),
  bol as (
    select right(regexp_replace(b.telefono_cliente,'\D','','g'),10) as tel10,
           sum(coalesce(b.saldo_restante,0)) as saldo
    from boletas b
    where b.telefono_cliente is not null
    group by 1
  ),
  cli as (
    select distinct on (tel10) tel10, nombre, ciudad
    from (
      select right(regexp_replace(cl.telefono,'\D','','g'),10) as tel10, cl.nombre, cl.ciudad
      from clientes cl where cl.telefono is not null
    ) z
    order by tel10
  )
  select distinct conv.telefono,
    case when f.tipo = 'clientes'
         then coalesce(split_part(btrim(cli.nombre),' ',1),'')
         else coalesce(conv.nombre_perfil,'') end as nombre
  from conv
  cross join f
  left join bol on bol.tel10 = conv.tel10
  left join cli on cli.tel10 = conv.tel10
  where
    (f.etiqueta_id is null
       or conv.id in (select conversacion_id from conversacion_etiquetas where etiqueta_id = f.etiqueta_id::uuid))
    and (
      f.tipo in ('todos','etiqueta')
      or (f.tipo = 'potenciales' and bol.tel10 is null)
      or (f.tipo = 'clientes' and bol.tel10 is not null and (
            f.estado_pago = 'todos'
            or (f.estado_pago = 'saldo'   and coalesce(bol.saldo,0) > 0)
            or (f.estado_pago = 'pagados' and coalesce(bol.saldo,0) = 0)
          ))
    )
    and (f.ciudad is null or lower(coalesce(cli.ciudad,'')) = lower(f.ciudad))
  order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.difusion_reclamar_lote(p_difusion uuid, p_limite integer)
 RETURNS TABLE(id bigint, telefono text, nombre text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with c as (
    select d.id
    from difusion_destinatarios d
    where d.difusion_id = p_difusion and d.estado = 'pendiente'
    order by d.id
    limit p_limite
    for update skip locked
  )
  update difusion_destinatarios d
     set estado = 'enviando'
    from c
   where d.id = c.id
  returning d.id, d.telefono, d.nombre;
end;
$function$;

-- ═════════════ ETIQUETAS DE ESTADO (Separada/Abonada/Pagada, cron job 3) ════

CREATE OR REPLACE FUNCTION public.sincronizar_etiquetas_estado()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- 1) Poner la etiqueta de estado correcta donde falte.
  with agg as (
    select right(regexp_replace(telefono_cliente, '\D', '', 'g'), 10) as p10,
           sum(coalesce(total_abonado, 0))  as abonado,
           sum(coalesce(saldo_restante, 0)) as saldo
    from public.boletas
    where telefono_cliente is not null and telefono_cliente <> ''
    group by 1
  ),
  conv_estado as (
    select c.id as conv_id, c.linea_id,
           case when a.saldo <= 0 then 'Pagada'
                when a.abonado > 0 then 'Abonada'
                else 'Separada' end as estado
    from public.conversaciones_whatsapp c
    join agg a
      on a.p10 = right(regexp_replace(c.telefono, '\D', '', 'g'), 10)
     and length(a.p10) = 10
  ),
  deseado as (
    select cs.conv_id, e.id as etiqueta_id
    from conv_estado cs
    join public.etiquetas e on e.linea_id = cs.linea_id and e.nombre = cs.estado
  )
  insert into public.conversacion_etiquetas (conversacion_id, etiqueta_id)
  select d.conv_id, d.etiqueta_id from deseado d
  where not exists (
    select 1 from public.conversacion_etiquetas x
    where x.conversacion_id = d.conv_id and x.etiqueta_id = d.etiqueta_id);

  -- 2) Quitar las OTRAS etiquetas de estado de esos mismos chats con boleta.
  with agg as (
    select right(regexp_replace(telefono_cliente, '\D', '', 'g'), 10) as p10,
           sum(coalesce(total_abonado, 0))  as abonado,
           sum(coalesce(saldo_restante, 0)) as saldo
    from public.boletas
    where telefono_cliente is not null and telefono_cliente <> ''
    group by 1
  ),
  conv_estado as (
    select c.id as conv_id, c.linea_id,
           case when a.saldo <= 0 then 'Pagada'
                when a.abonado > 0 then 'Abonada'
                else 'Separada' end as estado
    from public.conversaciones_whatsapp c
    join agg a
      on a.p10 = right(regexp_replace(c.telefono, '\D', '', 'g'), 10)
     and length(a.p10) = 10
  )
  delete from public.conversacion_etiquetas ce
  using conv_estado cs, public.etiquetas e
  where ce.conversacion_id = cs.conv_id
    and e.id = ce.etiqueta_id
    and e.linea_id = cs.linea_id
    and e.nombre in ('Separada', 'Abonada', 'Pagada')
    and e.nombre <> cs.estado;
end;
$function$;

-- ═════════════ UTILITARIA ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- (rate_limit_check y trasladar_abono_atomico viven en sus propios archivos:
--  sql/rate-limit.sql y sql/trasladar-abono-atomico.sql)
