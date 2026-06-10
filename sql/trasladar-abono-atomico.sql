-- Traslado de abono ATÓMICO (H37 de la auditoría de Liliana, 10-jun-2026).
-- Mueve abono entre dos boletas del MISMO cliente dentro de UNA transacción:
-- o se hace todo (mover/partir abonos + recalcular ambos saldos + reapuntar
-- transferencias) o no se hace nada. Reemplaza los 7 pasos sueltos que hacía
-- api/admin/trasladar-abono.js (un crash a mitad dejaba saldos falsos).
--
-- La llama SOLO el backend (service_role). Las validaciones de negocio viven
-- AQUÍ (dentro de la transacción) y devuelven {ok:false, codigo} sin escribir;
-- el endpoint arma el mensaje bonito para el asesor/IA.

create or replace function public.trasladar_abono_atomico(
  p_origen text,
  p_destino text,
  p_last10 text,
  p_monto numeric default null,      -- null = mover TODO el abono
  p_precio_default numeric default 150000
) returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_borigen  public.boletas%rowtype;
  v_bdestino public.boletas%rowtype;
  v_total    numeric := 0;
  v_mover    numeric;
  v_restante numeric;
  v_precio   numeric;
  v_saldo    numeric;
  v_abonado  numeric;
  v_ab       record;
  v_m        numeric;
  v_ids      uuid[];
  v_idt      uuid;
  v_bs       text[];
  v_estado   text;
begin
  -- Bloquear AMBAS boletas en orden fijo (por número): dos traslados simultáneos
  -- se hacen en fila, sin riesgo de abrazo mortal (deadlock).
  perform 1 from public.boletas where numero in (p_origen, p_destino) order by numero for update;

  select * into v_borigen  from public.boletas where numero = p_origen;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'NO_EXISTE'); end if;
  select * into v_bdestino from public.boletas where numero = p_destino;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'NO_EXISTE'); end if;

  -- 🔒 Candado central: ambas boletas deben ser del MISMO cliente.
  if v_borigen.telefono_cliente is null
     or right(regexp_replace(v_borigen.telefono_cliente, '\D', '', 'g'), 10) <> p_last10
     or v_bdestino.telefono_cliente is null
     or right(regexp_replace(v_bdestino.telefono_cliente, '\D', '', 'g'), 10) <> p_last10 then
    return jsonb_build_object('ok', false, 'codigo', 'OTRO_CLIENTE');
  end if;

  -- Total abonado REAL del origen, leído DENTRO de la transacción (sin TOCTOU).
  select coalesce(sum(monto), 0) into v_total from public.abonos where numero_boleta = p_origen;
  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'codigo', 'SIN_ABONOS');
  end if;

  v_mover := coalesce(p_monto, v_total);
  if v_mover <= 0 then
    return jsonb_build_object('ok', false, 'codigo', 'MONTO_INVALIDO');
  end if;
  if v_mover > v_total then
    return jsonb_build_object('ok', false, 'codigo', 'EXCEDE_TOTAL', 'total', v_total, 'monto', v_mover);
  end if;

  -- Tope: no exceder lo que falta en la boleta destino.
  v_precio := coalesce(v_bdestino.precio_total, p_precio_default);
  v_saldo  := v_precio - coalesce(v_bdestino.total_abonado, 0);
  if v_mover > v_saldo then
    return jsonb_build_object('ok', false, 'codigo', 'EXCEDE_DESTINO', 'saldo', v_saldo, 'monto', v_mover);
  end if;

  -- Transferencias tocadas (capturadas ANTES de mover, para reapuntarlas al final).
  select array_agg(distinct id_transferencia) into v_ids
  from public.abonos where numero_boleta = p_origen and id_transferencia is not null;

  -- Mover: abonos enteros hasta completar el monto; el último se PARTE si hace falta.
  v_restante := v_mover;
  for v_ab in
    select id, monto, fecha_pago, referencia_transferencia, metodo_pago, asesor, tipo, origen, id_transferencia
    from public.abonos where numero_boleta = p_origen
    order by monto asc
    for update
  loop
    exit when v_restante <= 0;
    v_m := coalesce(v_ab.monto, 0);
    continue when v_m <= 0;
    if v_m <= v_restante + 0.001 then
      update public.abonos set numero_boleta = p_destino where id = v_ab.id;
      v_restante := v_restante - v_m;
    else
      update public.abonos set monto = v_m - v_restante where id = v_ab.id;
      insert into public.abonos (numero_boleta, monto, fecha_pago, referencia_transferencia, metodo_pago, asesor, tipo, origen, id_transferencia)
      values (p_destino, v_restante, v_ab.fecha_pago, v_ab.referencia_transferencia, v_ab.metodo_pago, v_ab.asesor, v_ab.tipo, v_ab.origen, v_ab.id_transferencia);
      v_restante := 0;
    end if;
  end loop;

  -- Recalcular AMBAS boletas desde sus abonos (la verdad), en la misma transacción.
  select coalesce(sum(monto), 0) into v_abonado from public.abonos where numero_boleta = p_origen;
  v_precio := coalesce(v_borigen.precio_total, p_precio_default);
  v_saldo  := greatest(0, v_precio - v_abonado);
  update public.boletas
     set total_abonado = v_abonado, saldo_restante = v_saldo,
         estado = case when v_saldo <= 0 then 'Pagada' else 'Ocupada' end
   where numero = p_origen;

  select coalesce(sum(monto), 0) into v_abonado from public.abonos where numero_boleta = p_destino;
  v_precio := coalesce(v_bdestino.precio_total, p_precio_default);
  v_saldo  := greatest(0, v_precio - v_abonado);
  update public.boletas
     set total_abonado = v_abonado, saldo_restante = v_saldo,
         estado = case when v_saldo <= 0 then 'Pagada' else 'Ocupada' end
   where numero = p_destino;

  -- Reapuntar cada transferencia según en qué boleta(s) quedaron sus abonos.
  if v_ids is not null then
    foreach v_idt in array v_ids loop
      select array_agg(distinct numero_boleta) into v_bs from public.abonos where id_transferencia = v_idt;
      if v_bs is null then
        v_estado := 'LIBRE';
      elsif array_length(v_bs, 1) > 1 then
        v_estado := 'ASIGNADA REPARTIDA: ' || array_to_string(v_bs, ', ');
      else
        v_estado := 'ASIGNADA a boleta ' || v_bs[1];
      end if;
      update public.transferencias set estado = v_estado where id = v_idt;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'monto', v_mover, 'total', v_total);
end;
$fn$;

-- Solo el backend (llave maestra) puede ejecutarla. Nunca la llave anónima.
revoke all on function public.trasladar_abono_atomico(text, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.trasladar_abono_atomico(text, text, text, numeric, numeric) to service_role;
