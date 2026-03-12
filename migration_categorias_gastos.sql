-- ============================================================
-- MIGRACIÓN: Actualización de Categorías de Gastos
-- Ejecutar en Supabase → SQL Editor
-- ============================================================
-- Renombra las categorías existentes a los nuevos nombres y
-- agrega las que falten. También actualiza los registros en
-- la tabla 'gastos' para mantener la referencia consistente.
-- ============================================================

-- 1. Renombrar "Construcción" → "Construcción de apartamentos"
UPDATE categorias_gastos
SET nombre = 'Construcción de apartamentos'
WHERE nombre = 'Construcción';

-- 2. Renombrar "Premio / Apartamento" → "Rifa de apartamento"
UPDATE categorias_gastos
SET nombre = 'Rifa de apartamento'
WHERE nombre = 'Premio / Apartamento';

-- 3. "Operacional" ya tiene el nombre correcto, solo nos aseguramos
--    de que exista (no hace nada si ya existe)
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT 'Operacional', '#607d8b', '⚙️', ARRAY['Publicidad Facebook', 'Plataformas', 'Nómina equipo', 'Internet y telefonía', 'Arriendos', 'Papelería', 'Otros']
WHERE NOT EXISTS (SELECT 1 FROM categorias_gastos WHERE nombre = 'Operacional');

-- 4. Insertar "Rifa de camioneta" si no existe
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT 'Rifa de camioneta', '#e65100', '🚛', ARRAY['Publicidad', 'Logística', 'Documentación', 'Premiación', 'Otros']
WHERE NOT EXISTS (SELECT 1 FROM categorias_gastos WHERE nombre = 'Rifa de camioneta');

-- 5. Insertar "Rifa de apartamento" si no existía antes (por si acaso)
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT 'Rifa de apartamento', '#2e7d32', '🏠', ARRAY['Publicidad', 'Logística', 'Documentación', 'Premiación', 'Adecuación', 'Trámites legales', 'Otros']
WHERE NOT EXISTS (SELECT 1 FROM categorias_gastos WHERE nombre = 'Rifa de apartamento');

-- 6. Insertar "Construcción de apartamentos" si no existía antes (por si acaso)
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT 'Construcción de apartamentos', '#1565c0', '🏗️', ARRAY['Nómina obreros', 'Materiales', 'Herramientas', 'Transporte', 'Servicios públicos', 'Otros']
WHERE NOT EXISTS (SELECT 1 FROM categorias_gastos WHERE nombre = 'Construcción de apartamentos');

-- ============================================================
-- Actualizar registros en 'gastos' para mantener consistencia
-- ============================================================

-- Actualizar gastos que usaban el nombre antiguo "Construcción"
UPDATE gastos
SET categoria = 'Construcción de apartamentos'
WHERE categoria = 'Construcción';

-- Actualizar gastos que usaban el nombre antiguo "Premio / Apartamento"
UPDATE gastos
SET categoria = 'Rifa de apartamento'
WHERE categoria = 'Premio / Apartamento';

-- ============================================================
-- Verificación final
-- ============================================================
SELECT nombre, color, icono, subcategorias
FROM categorias_gastos
ORDER BY nombre;
