-- ============================================================
-- MIGRACIÓN: Agregar subcategoría "Impuestos" a Operacional
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

UPDATE categorias_gastos
SET subcategorias = array_append(subcategorias, 'Impuestos')
WHERE nombre = 'Operacional'
  AND NOT ('Impuestos' = ANY(subcategorias));

-- Verificación
SELECT nombre, subcategorias
FROM categorias_gastos
WHERE nombre = 'Operacional';
