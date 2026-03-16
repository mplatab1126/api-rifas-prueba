-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar numero_rifa a la tabla rifas
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE rifas
  ADD COLUMN IF NOT EXISTS numero_rifa INTEGER;

-- Índice para ordenar eficientemente por número de rifa
CREATE INDEX IF NOT EXISTS idx_rifas_numero ON rifas(numero_rifa ASC NULLS LAST);
