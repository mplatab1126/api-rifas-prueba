-- =========================================================
-- MIGRACIÓN: Sistema de Horarios de Asesores
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================

-- Tabla principal de horarios
CREATE TABLE IF NOT EXISTS horarios_asesores (
  id           BIGSERIAL PRIMARY KEY,
  asesor_nombre TEXT NOT NULL,
  dia_semana   INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  -- 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles,
  -- 4 = Jueves, 5 = Viernes, 6 = Sábado
  hora_inicio  TEXT,              -- "08:00" o NULL si no trabaja ese día
  hora_fin     TEXT,              -- "17:00" o NULL si no trabaja ese día
  trabaja      BOOLEAN DEFAULT TRUE,
  notas        TEXT DEFAULT '',
  color        TEXT DEFAULT '#4eb082',  -- Color del bloque en el calendario
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (asesor_nombre, dia_semana)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_horarios_asesor  ON horarios_asesores (asesor_nombre);
CREATE INDEX IF NOT EXISTS idx_horarios_dia     ON horarios_asesores (dia_semana);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_horarios_updated_at ON horarios_asesores;
CREATE TRIGGER trg_horarios_updated_at
  BEFORE UPDATE ON horarios_asesores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Política RLS: solo lectura pública (los asesores ven el calendario sin auth)
ALTER TABLE horarios_asesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura_publica"      ON horarios_asesores;
DROP POLICY IF EXISTS "escritura_publica"    ON horarios_asesores;
DROP POLICY IF EXISTS "actualizacion_publica" ON horarios_asesores;
DROP POLICY IF EXISTS "borrado_publico"      ON horarios_asesores;

CREATE POLICY "lectura_publica" ON horarios_asesores
  FOR SELECT USING (true);

-- Políticas de escritura (la autenticación se valida en el API, no en Supabase)
CREATE POLICY "escritura_publica" ON horarios_asesores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "actualizacion_publica" ON horarios_asesores
  FOR UPDATE USING (true);

CREATE POLICY "borrado_publico" ON horarios_asesores
  FOR DELETE USING (true);
