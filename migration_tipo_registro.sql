-- Agregar columna para distinguir registros automáticos de manuales
-- 'automatico' = encontrado por teléfono en la base de datos
-- 'manual' = el cliente ingresó sus datos manualmente

ALTER TABLE registro_sorteo
ADD COLUMN IF NOT EXISTS tipo_registro TEXT NOT NULL DEFAULT 'automatico';
