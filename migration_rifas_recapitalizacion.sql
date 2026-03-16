-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar campo requiere_recapitalizacion a premios_rifa
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE premios_rifa
  ADD COLUMN IF NOT EXISTS requiere_recapitalizacion BOOLEAN NOT NULL DEFAULT false;
