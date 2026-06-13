-- FLUJOS — constructor visual de conversaciones (estilo ManyChat/ChateaPro).
-- FASE 1 (2026-06-13): solo dibujar/guardar/probar. El motor que los ejecuta con
-- clientes reales es la Fase 2 (api/lib/flujo-motor.js + enganche en recibir.js).
-- Single-tenant: usa linea_id (text, = phone_number_id), como difusiones/conversaciones.
-- RLS PRENDIDO; el backend entra con service_role (la pantalla nunca toca la base directo).

CREATE TABLE IF NOT EXISTS public.flujos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea_id        text NOT NULL,
  nombre          text NOT NULL,
  disparador      text NOT NULL DEFAULT 'palabra',   -- 'palabra' | 'nuevo_contacto'
  palabras        text,                              -- "hola, info, precio" (si disparador='palabra')
  estado          text NOT NULL DEFAULT 'borrador',  -- 'borrador' | 'activo' | 'pausado'
  grafo           jsonb NOT NULL DEFAULT '{}'::jsonb,-- el dibujo (nodos + conexiones, formato Drawflow)
  carpeta         text,
  creada_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flujos_linea_idx ON public.flujos (linea_id, estado);

-- En qué paso (nodo) va cada cliente dentro de un flujo. Se usa en la Fase 2.
CREATE TABLE IF NOT EXISTS public.flujo_sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea_id        text NOT NULL,
  flujo_id        uuid NOT NULL REFERENCES public.flujos(id) ON DELETE CASCADE,
  conversacion_id uuid NOT NULL REFERENCES public.conversaciones_whatsapp(id) ON DELETE CASCADE,
  nodo_actual     text,
  variables       jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado          text NOT NULL DEFAULT 'corriendo',  -- 'corriendo' | 'esperando' | 'terminado' | 'cancelado'
  created_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flujo_id, conversacion_id)
);
CREATE INDEX IF NOT EXISTS flujo_sesiones_conv_idx ON public.flujo_sesiones (conversacion_id, estado);

ALTER TABLE public.flujos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flujo_sesiones ENABLE ROW LEVEL SECURITY;
