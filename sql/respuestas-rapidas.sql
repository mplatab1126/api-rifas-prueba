-- ============================================================================
--  RESPUESTAS RÁPIDAS (bandeja de WhatsApp)
-- ----------------------------------------------------------------------------
--  Mensajes prearmados que el asesor reutiliza en el chat (ej: "Métodos de
--  pago", "Tu boleta quedó registrada"). Son COMPARTIDAS por línea: todos los
--  asesores que ven una línea ven y administran las mismas respuestas, igual
--  que las etiquetas.
--
--  Tabla NUEVA y aislada: no toca nada de lo que ya existe.
--  Se puede correr varias veces sin peligro (usa "if not exists").
-- ============================================================================

create table if not exists public.respuestas_rapidas (
  id          uuid primary key default gen_random_uuid(),
  linea_id    text not null,                    -- phone_number_id de la línea
  titulo      text not null,                    -- nombre corto, ej: "Métodos de pago"
  texto       text not null,                    -- el mensaje completo que se inserta
  created_at  timestamptz not null default now()
);

-- Para listar rápido las respuestas de una línea, en orden alfabético.
create index if not exists respuestas_rapidas_linea_idx
  on public.respuestas_rapidas (linea_id, titulo);
