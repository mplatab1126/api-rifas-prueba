-- ════════════════════════════════════════════════════════════════════════
-- HISTORIAL DE LA RIFA PRINCIPAL (4 cifras)
-- ════════════════════════════════════════════════════════════════════════
-- Cuando se cierra una rifa principal (ej: "Perla Roja") y se reinicia el
-- panel de ventas para arrancar la siguiente, las boletas vendidas y sus
-- abonos se copian aquí ANTES de resetear la tabla `boletas`.
--
-- Esto permite consultar después: qué clientes compraron en cada rifa,
-- qué números tuvieron, cuánto pagaron y cuándo. Las tablas de soporte
-- contable (transferencias, registro_movimientos, gastos, rifas,
-- premios_rifa, capitalizacion_rifa) NO se tocan en el reinicio.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. Snapshot de boletas vendidas de la rifa que cierra
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historial_boletas_principal (
  id              BIGSERIAL PRIMARY KEY,
  -- Contexto de la rifa archivada
  rifa_id         BIGINT,        -- ref a rifas.id si existe; null si fue legado
  rifa_nombre     TEXT NOT NULL, -- ej: "Perla Roja"
  fecha_archivado TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Espejo de las columnas relevantes de boletas
  numero            TEXT NOT NULL,
  estado            TEXT,
  nombre_cliente    TEXT,
  telefono_cliente  TEXT,           -- referencia al cliente (no FK; clientes se mantiene aparte)
  total_abonado     NUMERIC(18,2),
  saldo_restante    NUMERIC(18,2),
  precio_total      NUMERIC(18,2),
  asesor            TEXT,
  mostrado          BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_hbp_rifa_nombre
  ON historial_boletas_principal (rifa_nombre);
CREATE INDEX IF NOT EXISTS idx_hbp_telefono
  ON historial_boletas_principal (telefono_cliente);
CREATE INDEX IF NOT EXISTS idx_hbp_numero
  ON historial_boletas_principal (numero);

ALTER TABLE historial_boletas_principal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso completo historial_boletas_principal" ON historial_boletas_principal;
CREATE POLICY "Acceso completo historial_boletas_principal"
  ON historial_boletas_principal
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────
-- 2. Snapshot de abonos 4cifras de la rifa que cierra
-- ───────────────────────────────────────────────────────────────────────
-- Espejo de la tabla `abonos` filtrado por tipo='4cifras' al momento del
-- cierre. No se copian los abonos 2cifras/3cifras porque esas rifas tienen
-- su propio ciclo y su propia tabla `historial_rifas`.
CREATE TABLE IF NOT EXISTS historial_abonos_principal (
  id              BIGSERIAL PRIMARY KEY,
  rifa_id         BIGINT,
  rifa_nombre     TEXT NOT NULL,
  fecha_archivado TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Espejo de columnas de abonos. Mantengo el id original como referencia.
  abono_id_origen BIGINT,        -- el id que tenía en la tabla `abonos`
  -- Resto de campos copiados tal cual (jsonb para flexibilidad ante schema futuro)
  data            JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hap_rifa_nombre
  ON historial_abonos_principal (rifa_nombre);
CREATE INDEX IF NOT EXISTS idx_hap_abono_id_origen
  ON historial_abonos_principal (abono_id_origen);

ALTER TABLE historial_abonos_principal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso completo historial_abonos_principal" ON historial_abonos_principal;
CREATE POLICY "Acceso completo historial_abonos_principal"
  ON historial_abonos_principal
  FOR ALL
  USING (true)
  WITH CHECK (true);
