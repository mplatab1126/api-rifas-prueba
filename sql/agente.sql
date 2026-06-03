-- ============================================================================
--  AGENTE DE IA — Cabina de control (configuración editable desde la bandeja)
-- ----------------------------------------------------------------------------
--  3 tablas NUEVAS y aisladas. No tocan nada existente. Guardan la CONFIGURACIÓN
--  del agente por línea para que Mateo la maneje desde la pestaña "Agente" de la
--  bandeja, sin tocar código. El "motor" (cómo el agente ejecuta de verdad) vive
--  en el código; esto es solo el QUÉ dice, QUÉ puede hacer y su registro.
--
--  Idempotente: se puede correr varias veces sin peligro.
-- ============================================================================

-- 1) Configuración general del agente, UNA fila por línea de WhatsApp.
create table if not exists public.agente_config (
  linea_id        text primary key,                 -- phone_number_id de la línea
  estado          text not null default 'apagado',  -- 'apagado' | 'sombra' | 'encendido'
  nombre_agente   text,                              -- con qué nombre se presenta (ej: "Camila")
  prompt          text not null default '',          -- las instrucciones (el "manual" del agente)
  modelo          text not null default 'claude-sonnet-4-6',
  actualizado_por text,                              -- quién guardó por última vez
  actualizado_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- 2) Herramientas (acciones) que el agente puede ejecutar, encendibles por línea.
--    Se siembran solas la 1ª vez desde el endpoint (apagadas por defecto).
create table if not exists public.agente_herramientas (
  id          uuid primary key default gen_random_uuid(),
  linea_id    text not null,
  clave       text not null,                         -- identificador interno, ej: 'consultar_disponibles'
  nombre      text not null,                         -- nombre legible para Mateo
  descripcion text,                                  -- qué hace, en simple
  riesgo      text not null default 'bajo',          -- 'bajo' | 'medio' | 'alto' (verde/amarillo/rojo)
  activa      boolean not null default false,        -- Mateo la prende cuando quiera
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists agente_herramientas_linea_clave_idx
  on public.agente_herramientas (linea_id, clave);

-- 3) Registro de actividad: qué hizo el agente y cuándo. Se llena cuando se
--    conecte el motor; por ahora queda vacío y la pantalla muestra "sin actividad".
create table if not exists public.agente_actividad (
  id         bigint generated always as identity primary key,
  linea_id   text not null,
  telefono   text,
  tipo       text not null default 'nota',           -- 'herramienta' | 'respuesta' | 'sombra' | 'nota'
  resumen    text,                                   -- texto legible: "Consulté disponibles -> 4567 ocupado -> ofrecí 4568"
  detalle    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agente_actividad_linea_fecha_idx
  on public.agente_actividad (linea_id, created_at desc);
