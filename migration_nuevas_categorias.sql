-- ============================================================
-- MIGRACIÓN: Nuevas Categorías de Gastos
-- Ejecutar en Supabase → SQL Editor
-- ============================================================
-- Agrega dos nuevas categorías:
--   1. "Devoluciones"      → cuando se regresa dinero a un cliente
--   2. "Retiro de ganancia" → retiro de ganancias por persona
-- ============================================================

-- 1. Insertar "Devoluciones" si no existe
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT
  'Devoluciones',
  '#6a1b9a',
  '↩️',
  ARRAY['Rifa 2 cifras', 'Rifa 3 cifras', 'Rifa 4 cifras']
WHERE NOT EXISTS (
  SELECT 1 FROM categorias_gastos WHERE nombre = 'Devoluciones'
);

-- 2. Insertar "Retiro de ganancia" si no existe
INSERT INTO categorias_gastos (nombre, color, icono, subcategorias)
SELECT
  'Retiro de ganancia',
  '#f57f17',
  '💰',
  ARRAY['Mateo', 'Alejandro', 'Papá']
WHERE NOT EXISTS (
  SELECT 1 FROM categorias_gastos WHERE nombre = 'Retiro de ganancia'
);

-- ============================================================
-- Verificación final
-- ============================================================
SELECT nombre, color, icono, subcategorias
FROM categorias_gastos
ORDER BY nombre;
