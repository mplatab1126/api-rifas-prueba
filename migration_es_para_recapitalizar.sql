-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar es_para_recapitalizar a premios_rifa
--
-- Diferencia con requiere_recapitalizacion:
--   requiere_recapitalizacion = este ítem GENERA obligación (los hermanos deben devolverlo)
--   es_para_recapitalizar     = este ítem ES el pago de la deuda de la rifa anterior
--
-- Ejemplo: un CDT puede tener ambos en false (no genera obligación y no paga deuda).
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE premios_rifa
  ADD COLUMN IF NOT EXISTS es_para_recapitalizar BOOLEAN NOT NULL DEFAULT false;
