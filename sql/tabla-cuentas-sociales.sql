-- Tabla para vincular cuentas de Google/Facebook con telefonos de clientes
CREATE TABLE IF NOT EXISTS cuentas_sociales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor TEXT NOT NULL,          -- 'google' o 'facebook'
  id_social TEXT NOT NULL,          -- ID del usuario en Google/Facebook
  email TEXT,
  nombre TEXT,
  foto TEXT,
  telefono TEXT,                    -- Se llena cuando el usuario vincula su telefono
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proveedor, id_social)
);

CREATE INDEX IF NOT EXISTS idx_cuentas_sociales_lookup ON cuentas_sociales (proveedor, id_social);

ALTER TABLE cuentas_sociales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso completo cuentas_sociales" ON cuentas_sociales FOR ALL USING (true) WITH CHECK (true);
