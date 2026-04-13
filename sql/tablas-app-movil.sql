-- ============================================================
-- TABLAS PARA LA APP MOVIL DE LOS PLATAS
-- Ejecutar este SQL en Supabase (SQL Editor)
-- ============================================================

-- 1. Tabla para codigos OTP (One-Time Password)
-- Almacena los codigos de verificacion enviados por WhatsApp
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono TEXT NOT NULL,
  codigo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  used BOOLEAN DEFAULT FALSE
);

-- Indice para buscar codigos por telefono rapidamente
CREATE INDEX IF NOT EXISTS idx_otp_codes_telefono ON otp_codes (telefono);

-- Indice para limpiar codigos expirados
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes (expires_at);

-- 2. Tabla para sesiones de la app movil
-- Cada vez que un cliente verifica su OTP, se crea una sesion
CREATE TABLE IF NOT EXISTS sesiones_app (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  telefono TEXT NOT NULL,
  push_token TEXT,
  dispositivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  activa BOOLEAN DEFAULT TRUE
);

-- Indice para validar tokens rapidamente
CREATE INDEX IF NOT EXISTS idx_sesiones_app_token ON sesiones_app (token);

-- Indice para buscar sesiones por telefono
CREATE INDEX IF NOT EXISTS idx_sesiones_app_telefono ON sesiones_app (telefono);

-- Indice para buscar sesiones con push_token (para enviar notificaciones)
CREATE INDEX IF NOT EXISTS idx_sesiones_app_push ON sesiones_app (push_token) WHERE push_token IS NOT NULL AND activa = TRUE;

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_app ENABLE ROW LEVEL SECURITY;

-- Politica: solo el backend (service_role) puede leer/escribir OTPs
CREATE POLICY "Solo backend puede acceder OTPs"
  ON otp_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Politica: solo el backend puede acceder sesiones
CREATE POLICY "Solo backend puede acceder sesiones"
  ON sesiones_app FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Nota: Como el backend usa SUPABASE_ANON_KEY (no service_role),
-- y las politicas solo permiten service_role, el backend necesita
-- usar supabaseAdmin para estas tablas. O alternativamente,
-- agregar politicas mas permisivas:

-- Alternativa: permitir acceso con anon_key (mas simple)
-- Descomentar estas si el backend usa supabase (no supabaseAdmin):

DROP POLICY IF EXISTS "Solo backend puede acceder OTPs" ON otp_codes;
CREATE POLICY "Acceso completo OTPs" ON otp_codes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo backend puede acceder sesiones" ON sesiones_app;
CREATE POLICY "Acceso completo sesiones" ON sesiones_app FOR ALL USING (true) WITH CHECK (true);
