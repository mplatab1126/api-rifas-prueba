-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Herencia de premios entre rifas
-- Permite que un premio de una rifa sea "heredado" a otra rifa.
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE premios_rifa
  ADD COLUMN IF NOT EXISTS origen_premio_id UUID REFERENCES premios_rifa(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_premios_origen ON premios_rifa(origen_premio_id);
