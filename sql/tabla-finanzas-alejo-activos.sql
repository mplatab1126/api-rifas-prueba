-- Tabla de activos (no liquidos) de Alejo: oro, CDT, inmuebles, acciones, etc.
-- Cada fila es un bien que Alejo tiene como inversion.
-- Cuando compra un activo: se crea aqui una fila + se registra un gasto en finanzas_alejo_movimientos.
-- Cuando lo vende: activo=false + fecha_venta + valor_venta + se registra un ingreso.

CREATE TABLE IF NOT EXISTS finanzas_alejo_activos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,                    -- "Cadena de oro 20g", "CDT Bancolombia 2025", etc.
  tipo TEXT NOT NULL DEFAULT 'otro',       -- oro | cdt | inmueble | accion | cripto | otro
  valor_compra NUMERIC(18,2) NOT NULL,     -- lo que pago por el activo
  valor_actual NUMERIC(18,2),              -- valor de mercado hoy (null = usar valor_compra)
  fecha_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_venta DATE,                        -- null mientras sigue siendo de Alejo
  valor_venta NUMERIC(18,2),               -- lo que recibio al vender
  descripcion TEXT,                        -- notas libres
  activo BOOLEAN NOT NULL DEFAULT TRUE,    -- true = lo sigue teniendo; false = ya lo vendio
  movimiento_compra_id BIGINT,             -- ref al gasto que lo compro (opcional)
  movimiento_venta_id BIGINT,              -- ref al ingreso de la venta (opcional)
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_alejo_activos_activo
  ON finanzas_alejo_activos (activo);

CREATE INDEX IF NOT EXISTS idx_finanzas_alejo_activos_tipo
  ON finanzas_alejo_activos (tipo);

ALTER TABLE finanzas_alejo_activos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo finanzas_alejo_activos" ON finanzas_alejo_activos;
CREATE POLICY "Acceso completo finanzas_alejo_activos"
  ON finanzas_alejo_activos
  FOR ALL
  USING (true)
  WITH CHECK (true);
