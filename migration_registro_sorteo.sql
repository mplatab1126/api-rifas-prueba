-- Tabla para almacenar los registros del sorteo sorpresa de $3.000.000
-- Los participantes deben haber comprado una boleta de La Plata House

CREATE TABLE IF NOT EXISTS registro_sorteo (
  id BIGSERIAL PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  telefono_whatsapp TEXT NOT NULL,
  numero_boleta TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_sorteo_boleta ON registro_sorteo (numero_boleta);
