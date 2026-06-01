-- ============================================================================
--  BUZÓN DE WHATSAPP PROPIO (Meta Cloud API)
-- ----------------------------------------------------------------------------
--  Estas dos tablas son NUEVAS y NO tocan nada de lo que ya existe.
--  Aquí se guardan las conversaciones y los mensajes que entran y salen por
--  WhatsApp, ahora directo desde Meta (sin ChateaPro de por medio).
--
--    conversaciones_whatsapp -> una fila por cliente (un chat)
--    mensajes_whatsapp       -> una fila por cada mensaje (entrante o saliente)
--
--  Se puede correr varias veces sin peligro (usa "if not exists").
-- ============================================================================

-- ── Un chat por cliente ─────────────────────────────────────────────────────
create table if not exists public.conversaciones_whatsapp (
  id                uuid primary key default gen_random_uuid(),
  telefono          text not null unique,            -- número internacional, ej: 573001234567
  nombre_perfil     text,                            -- nombre que muestra WhatsApp del cliente
  ultimo_mensaje    text,                            -- vista previa del último mensaje (para la bandeja)
  ultimo_at         timestamptz,                     -- cuándo fue el último mensaje (entrante o saliente)
  ventana_vence_at  timestamptz,                     -- hasta cuándo puedo escribir libre (24h desde el último mensaje del cliente)
  no_leidos         integer not null default 0,      -- cuántos mensajes entrantes sin abrir hay en la bandeja
  estado            text not null default 'bot',     -- 'bot' (atiende la IA) | 'humano' (atiende un asesor) | 'cerrada'
  asesor_asignado   text,                            -- nombre del asesor que atiende, si aplica
  created_at        timestamptz not null default now()
);

-- ── Un registro por mensaje ─────────────────────────────────────────────────
create table if not exists public.mensajes_whatsapp (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid references public.conversaciones_whatsapp(id) on delete cascade,
  telefono        text not null,
  direccion       text not null,                     -- 'entrante' (lo manda el cliente) | 'saliente' (lo mandamos nosotros)
  tipo            text not null default 'text',      -- text|image|audio|document|video|sticker|location|interactive|button|template|unknown
  texto           text,                              -- el texto, o el pie de foto (caption)
  media_id        text,                              -- id del archivo en Meta (foto/audio/etc), si aplica
  media_url       text,                              -- url del archivo ya descargado, si lo guardamos
  wa_message_id   text,                              -- id del mensaje en Meta (para no duplicar y para los acuses)
  estado_envio    text,                              -- entrante: 'recibido' | saliente: 'enviado'|'entregado'|'leido'|'fallido'
  error           text,                              -- detalle si el envío falló
  timestamp_wa    timestamptz,                       -- hora que reporta Meta
  raw             jsonb,                             -- el mensaje completo tal cual lo manda Meta (por seguridad / depuración)
  created_at      timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────
-- Evita guardar dos veces el mismo mensaje (Meta a veces reenvía el aviso).
create unique index if not exists mensajes_whatsapp_wamid_idx
  on public.mensajes_whatsapp (wa_message_id) where wa_message_id is not null;

-- Para abrir un chat rápido (todos los mensajes de una conversación, recientes primero).
create index if not exists mensajes_whatsapp_conv_idx
  on public.mensajes_whatsapp (conversacion_id, created_at desc);

-- Para buscar por número.
create index if not exists mensajes_whatsapp_tel_idx
  on public.mensajes_whatsapp (telefono, created_at desc);

-- Para ordenar la bandeja por el chat más reciente.
create index if not exists conversaciones_whatsapp_ultimo_idx
  on public.conversaciones_whatsapp (ultimo_at desc);
