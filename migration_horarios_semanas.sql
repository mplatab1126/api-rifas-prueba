-- =========================================================
-- MIGRACIÓN: Soporte de horarios por semana específica
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================

-- 1. Agregar columna semana_inicio (NULL temporalmente para migrar datos)
ALTER TABLE horarios_asesores
  ADD COLUMN IF NOT EXISTS semana_inicio DATE;

-- 2. Asignar el lunes de la semana actual a los registros existentes
UPDATE horarios_asesores
SET semana_inicio = DATE_TRUNC('week', CURRENT_DATE)::DATE
WHERE semana_inicio IS NULL;

-- 3. Hacer la columna NOT NULL
ALTER TABLE horarios_asesores
  ALTER COLUMN semana_inicio SET NOT NULL;

-- 4. Eliminar la restricción única anterior
ALTER TABLE horarios_asesores
  DROP CONSTRAINT IF EXISTS horarios_asesores_asesor_nombre_dia_semana_key;

-- 5. Nueva restricción única que incluye la semana
ALTER TABLE horarios_asesores
  ADD CONSTRAINT horarios_asesores_asesor_semana_dia_key
  UNIQUE (asesor_nombre, semana_inicio, dia_semana);

-- 6. Índice para búsquedas por semana
CREATE INDEX IF NOT EXISTS idx_horarios_semana
  ON horarios_asesores (semana_inicio);
