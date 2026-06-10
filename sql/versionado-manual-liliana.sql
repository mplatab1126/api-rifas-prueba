-- H15 (auditoría Liliana, 10-jun-2026): versionado del manual con respaldo automático.
--
-- Cada vez que cambia el prompt (o las variables) de agente_config, la versión
-- ANTERIOR queda guardada en agente_config_historial ANTES de pisarse (trigger).
-- Antes, un replace() SQL mal hecho o un guardado accidental destruía el manual
-- sin copia.
--
-- RESTAURAR una versión: copiar el prompt de la fila deseada de vuelta:
--   update agente_config set prompt = (select prompt from agente_config_historial
--     where id = <ID_DESEADO>) where linea_id = '<LINEA>';
-- (esa restauración también queda versionada, así que nunca se pierde nada).

create table public.agente_config_historial (
  id bigint generated always as identity primary key,
  linea_id text not null,
  prompt text,
  variables jsonb,
  actualizado_por text,
  cambiado_at timestamptz not null default now()
);
create index ix_agente_config_hist_linea on public.agente_config_historial (linea_id, cambiado_at desc);
alter table public.agente_config_historial enable row level security;

create or replace function public.agente_config_guardar_historial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.prompt is distinct from new.prompt) or (old.variables is distinct from new.variables) then
    insert into agente_config_historial (linea_id, prompt, variables, actualizado_por)
    values (old.linea_id, old.prompt, old.variables, old.actualizado_por);
  end if;
  return new;
end $$;

create trigger trg_agente_config_historial
before update on public.agente_config
for each row execute function public.agente_config_guardar_historial();
