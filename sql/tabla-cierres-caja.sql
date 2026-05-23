-- ─────────────────────────────────────────────────────────────────────
-- Tabla cierres_caja
-- Historial estructurado de cada arqueo/cierre de caja.
-- Antes los cierres se guardaban dentro de movimientos_caja con tipo='cierre'
-- y el desglose embebido en la descripcion como texto plano. Esta tabla los
-- separa en columnas dedicadas para poder mostrar el historial al usuario.
-- Se sigue guardando paralelamente en movimientos_caja para no romper la
-- logica de "caja abierta/cerrada" del dia que mira esa tabla.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cierres_caja (
  id              BIGSERIAL PRIMARY KEY,
  fecha           DATE NOT NULL,
  cerrado_por     TEXT NOT NULL,
  base_fija       INTEGER NOT NULL DEFAULT 0,
  total_recaudo   INTEGER NOT NULL DEFAULT 0,
  total_ingresos  INTEGER NOT NULL DEFAULT 0,
  total_salidas   INTEGER NOT NULL DEFAULT 0,
  total_consig    INTEGER NOT NULL DEFAULT 0,
  total_esperado  INTEGER NOT NULL,
  monto_contado   INTEGER NOT NULL,
  diferencia      INTEGER NOT NULL,
  observaciones   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cierres_caja_fecha   ON public.cierres_caja(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_caja_creado  ON public.cierres_caja(created_at DESC);

COMMENT ON TABLE  public.cierres_caja             IS 'Historial de cierres de caja con desglose estructurado.';
COMMENT ON COLUMN public.cierres_caja.diferencia  IS 'monto_contado - total_esperado. Positivo = sobro, negativo = falto.';

-- Migracion del cierre historico (si existe) desde movimientos_caja a cierres_caja.
INSERT INTO public.cierres_caja (
  fecha, cerrado_por, base_fija, total_recaudo, total_ingresos,
  total_salidas, total_consig, total_esperado, monto_contado,
  diferencia, observaciones, created_at
)
SELECT
  mc.fecha,
  mc.creado_por,
  0, 0, 0, 0, 0,
  COALESCE(
    NULLIF(regexp_replace(mc.descripcion, '.*Esperado:\s*\$(-?\d+).*', '\1'), mc.descripcion)::INTEGER,
    0
  ) AS total_esperado,
  mc.monto AS monto_contado,
  COALESCE(
    NULLIF(regexp_replace(mc.descripcion, '.*Diferencia:\s*\$(-?\d+).*', '\1'), mc.descripcion)::INTEGER,
    0
  ) AS diferencia,
  '[Cierre histórico migrado desde movimientos_caja]' AS observaciones,
  mc.created_at
FROM public.movimientos_caja mc
WHERE mc.tipo = 'cierre'
  AND NOT EXISTS (
    SELECT 1 FROM public.cierres_caja cc
    WHERE cc.fecha = mc.fecha AND cc.created_at = mc.created_at
  );
