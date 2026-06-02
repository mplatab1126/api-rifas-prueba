-- ============================================================================
--  RESPUESTAS RÁPIDAS (bandeja de WhatsApp)
-- ----------------------------------------------------------------------------
--  Mensajes prearmados que el asesor reutiliza en el chat. Son COMPARTIDAS por
--  línea: todos los asesores que ven una línea ven y administran las mismas,
--  igual que las etiquetas.
--
--  Cada respuesta es un MINI-FLUJO: una lista ordenada de "pasos", donde cada
--  paso es un mensaje de texto o una imagen (por URL). Al usar la respuesta en
--  un chat se envían todos los pasos en orden.
--
--    pasos (jsonb) = [
--      { "tipo": "texto",  "texto": "Hola, soy Mateo" },
--      { "tipo": "imagen", "url": "https://...jpg", "texto": "pie de foto opcional" },
--      { "tipo": "texto",  "texto": "¿Te interesa la casa?" }
--    ]
--
--  Tabla NUEVA y aislada: no toca nada de lo que ya existe.
--  Se puede correr varias veces sin peligro (usa "if not exists" / "if exists").
-- ============================================================================

create table if not exists public.respuestas_rapidas (
  id          uuid primary key default gen_random_uuid(),
  linea_id    text not null,                    -- phone_number_id de la línea
  titulo      text not null,                    -- nombre corto, ej: "Contacto inicial"
  texto       text,                             -- (heredado) texto simple de la versión vieja
  pasos       jsonb not null default '[]'::jsonb, -- el flujo de mensajes (ver arriba)
  created_at  timestamptz not null default now()
);

-- Por si la tabla ya existía con el formato viejo (solo "texto"):
alter table public.respuestas_rapidas add column if not exists pasos jsonb not null default '[]'::jsonb;
alter table public.respuestas_rapidas alter column texto drop not null;

-- Migrar filas viejas (solo texto) al nuevo formato de pasos.
update public.respuestas_rapidas
   set pasos = jsonb_build_array(jsonb_build_object('tipo','texto','texto',texto))
 where (pasos is null or pasos = '[]'::jsonb)
   and texto is not null and length(btrim(texto)) > 0;

-- Para listar rápido las respuestas de una línea, en orden alfabético.
create index if not exists respuestas_rapidas_linea_idx
  on public.respuestas_rapidas (linea_id, titulo);
