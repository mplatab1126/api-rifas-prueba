-- ============================================================
-- TABLAS PARA LA APP MOVIL - FASE 2
-- Ejecutar este SQL en Supabase (SQL Editor)
-- ============================================================

-- 1. Tabla de notificaciones para clientes de la app
-- Cada notificacion se envia a un telefono especifico.
-- Tipos: pago_registrado, sorteo_resultado, recordatorio_pago,
--         rifa_nueva, boleta_pagada, sistema
CREATE TABLE IF NOT EXISTS notificaciones_app (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'sistema',
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  datos JSONB,
  leida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para buscar notificaciones por telefono rapidamente
CREATE INDEX IF NOT EXISTS idx_notificaciones_app_telefono
  ON notificaciones_app (telefono, created_at DESC);

-- Indice para contar no leidas
CREATE INDEX IF NOT EXISTS idx_notificaciones_app_no_leidas
  ON notificaciones_app (telefono, leida)
  WHERE leida = FALSE;

-- 2. Habilitar RLS
ALTER TABLE notificaciones_app ENABLE ROW LEVEL SECURITY;

-- Politica permisiva (el backend usa anon_key)
CREATE POLICY "Acceso completo notificaciones_app"
  ON notificaciones_app FOR ALL
  USING (true) WITH CHECK (true);

-- 3. Funcion para limpiar notificaciones viejas (mas de 90 dias)
-- Ejecutar manualmente o con un cron job
CREATE OR REPLACE FUNCTION limpiar_notificaciones_viejas()
RETURNS INTEGER AS $$
DECLARE
  filas_eliminadas INTEGER;
BEGIN
  DELETE FROM notificaciones_app
  WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS filas_eliminadas = ROW_COUNT;
  RETURN filas_eliminadas;
END;
$$ LANGUAGE plpgsql;

-- 4. Funcion para limpiar OTPs expirados (mantenimiento)
CREATE OR REPLACE FUNCTION limpiar_otps_expirados()
RETURNS INTEGER AS $$
DECLARE
  filas_eliminadas INTEGER;
BEGIN
  DELETE FROM otp_codes
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS filas_eliminadas = ROW_COUNT;
  RETURN filas_eliminadas;
END;
$$ LANGUAGE plpgsql;

-- 5. Funcion para limpiar sesiones expiradas (mantenimiento)
CREATE OR REPLACE FUNCTION limpiar_sesiones_expiradas()
RETURNS INTEGER AS $$
DECLARE
  filas_eliminadas INTEGER;
BEGIN
  UPDATE sesiones_app SET activa = false
  WHERE expires_at < NOW() AND activa = true;
  GET DIAGNOSTICS filas_eliminadas = ROW_COUNT;
  RETURN filas_eliminadas;
END;
$$ LANGUAGE plpgsql;
