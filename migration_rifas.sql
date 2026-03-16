-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Rifas
-- Tablas: rifas, premios_rifa, capitalizacion_rifa
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RIFAS
--    Cada rifa tiene un nombre, fechas, estado y notas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rifas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  fecha_inicio DATE,
  fecha_fin    DATE,
  -- Estado posible: 'planificada', 'activa', 'finalizada'
  estado       TEXT NOT NULL DEFAULT 'planificada'
               CHECK (estado IN ('planificada', 'activa', 'finalizada')),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PREMIOS DE LA RIFA
--    Cada rifa puede tener uno o varios premios.
--    "aportante" indica quién puso el dinero del premio (ej: "Empresa Papá").
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premios_rifa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rifa_id     UUID NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  valor       BIGINT NOT NULL DEFAULT 0,
  aportante   TEXT,
  descripcion TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. CAPITALIZACIÓN POR RIFA
--    Define cuánto debe devolver cada hermano a la empresa al cerrar la rifa
--    y qué porcentaje de la utilidad neta le corresponde.
--
--    Ejemplo rifa $100M:
--      Mateo:     monto_obligacion = 50.000.000, porcentaje_utilidad = 45
--      Alejandro: monto_obligacion = 50.000.000, porcentaje_utilidad = 45
--      Papá:      monto_obligacion = 0,           porcentaje_utilidad = 10
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capitalizacion_rifa (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rifa_id             UUID NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
  -- Nombre del socio (ej: 'Mateo', 'Alejandro', 'Papá')
  socio               TEXT NOT NULL,
  -- Monto que este socio debe devolver a la empresa al cierre
  monto_obligacion    BIGINT NOT NULL DEFAULT 0,
  -- Su porcentaje de la utilidad neta (0-100)
  porcentaje_utilidad NUMERIC(5,2) NOT NULL DEFAULT 0
                      CHECK (porcentaje_utilidad >= 0 AND porcentaje_utilidad <= 100),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rifa_id, socio)
);

-- ─────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_premios_rifa_id       ON premios_rifa(rifa_id);
CREATE INDEX IF NOT EXISTS idx_capitalizacion_rifa_id ON capitalizacion_rifa(rifa_id);
