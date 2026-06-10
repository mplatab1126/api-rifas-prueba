-- H20/H40 (auditoría Liliana, 10-jun-2026): límite de tasa genérico.
-- Una llamada = un registro en rate_limit_hits; la función cuenta cuántos lleva
-- esa clave en la ventana y dice si se permite (true) o ya se pasó (false).
-- Limpieza oportunista (~2% de las llamadas borra lo de hace >2 horas).
-- La usa api/lib/rate-limit.js (fail-open: si el contador falla, se permite).

create table public.rate_limit_hits (
  clave text not null,
  created_at timestamptz not null default now()
);
create index ix_rate_limit_hits on public.rate_limit_hits (clave, created_at desc);
alter table public.rate_limit_hits enable row level security;

create or replace function public.rate_limit_check(p_clave text, p_ventana_seg int, p_limite int)
returns boolean
language plpgsql
set search_path = public
as $$
declare v_n int;
begin
  if random() < 0.02 then
    delete from rate_limit_hits where created_at < now() - interval '2 hours';
  end if;
  insert into rate_limit_hits (clave) values (p_clave);
  select count(*) into v_n from rate_limit_hits
   where clave = p_clave and created_at > now() - make_interval(secs => p_ventana_seg);
  return v_n <= p_limite;   -- true = permitido
end $$;

revoke all on function public.rate_limit_check(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, int, int) to service_role;
