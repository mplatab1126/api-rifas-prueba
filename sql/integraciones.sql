-- INTEGRACIONES (Fase A, 2026-06-13): conexiones a fuentes de datos externas del
-- rifero (Google Sheets, Supabase) para que los flujos lean/registren datos de la rifa.
-- `config` guarda los SECRETOS (url, llave, tabla). RLS prendido; solo el backend
-- (service_role) lee la config; la pantalla nunca recibe los secretos completos
-- (los enmascara `api/whatsapp/integraciones.js`). Solo Mateo gestiona esto.
CREATE TABLE IF NOT EXISTS public.integraciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea_id        text NOT NULL,
  tipo            text NOT NULL,                       -- 'google_sheets' | 'supabase'
  nombre          text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- secretos: { url, key, tabla, hoja, ... }
  estado          text NOT NULL DEFAULT 'activa',      -- 'activa' | 'pausada' | 'error'
  ultimo_error    text,
  creada_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integraciones_linea_idx ON public.integraciones (linea_id, tipo);
ALTER TABLE public.integraciones ENABLE ROW LEVEL SECURITY;
