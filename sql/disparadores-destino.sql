-- Disparadores centralizados (2026-06-13): un disparador ahora puede mandar a un FLUJO
-- o al AGENTE (Liliana), y se separan en dos categorías (palabra clave / evento).
-- El disparador SALIÓ del flujo: ahora todo se administra en el panel "Disparadores".
-- Solo AGREGA columnas; los disparadores existentes quedan con destino='agente'.
ALTER TABLE public.disparadores
  ADD COLUMN IF NOT EXISTS destino      text NOT NULL DEFAULT 'agente',  -- 'agente' | 'flujo'
  ADD COLUMN IF NOT EXISTS flujo_id     uuid REFERENCES public.flujos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evento_valor text;   -- para 'etiqueta_aplicada': nombre de la etiqueta (null = cualquiera)

-- tipo admite ahora: 'palabra' | 'nuevo_contacto' | 'etiqueta_aplicada' (texto libre, sin constraint).
