-- =============================================================================
-- ELIMINAR RIFAS DIARIAS - FASE 3 (BASE DE DATOS)
-- =============================================================================
--
-- Este script elimina de Supabase TODO lo relacionado con las rifas diarias
-- (de 2 y 3 cifras), que ya fueron sacadas del codigo en las Fases 1, 2A,
-- 2B y 2C. Las rifas diarias son ilegales en Colombia y se descontinuaron.
--
-- IMPORTANTE: Ejecutar EN ORDEN, paso por paso, revisando cada bloque.
-- NO ejecutar todo de golpe. Cada bloque trae instrucciones para validar
-- que va bien antes de pasar al siguiente.
--
-- Antes de empezar, asegurate de que:
--   1. La rama main esta al dia con todos los commits de "Eliminar rifas
--      diarias - Fase 1/2A/2B/2C" YA DESPLEGADOS en Vercel.
--   2. Nadie esta usando el sistema en este momento.
--   3. Idealmente: haces un backup de Supabase antes (Settings > Backups).
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 - REVISION PREVIA (solo lectura, no modifica nada)
-- -----------------------------------------------------------------------------
-- Estos SELECTs te muestran que hay en las tablas antes de borrarlas.
-- Asi sabes exactamente cuanto vas a perder.

-- Cuantas boletas hay en cada tabla diaria:
SELECT 'boletas_diarias'           AS tabla, COUNT(*) AS total FROM boletas_diarias
UNION ALL
SELECT 'boletas_diarias_3cifras'   AS tabla, COUNT(*) AS total FROM boletas_diarias_3cifras
UNION ALL
SELECT 'config_rifa_diaria'        AS tabla, COUNT(*) AS total FROM config_rifa_diaria;

-- Cuantos clientes tienen registrado algo en boletas_diarias_compradas:
SELECT COUNT(*) AS clientes_con_diarias_compradas
  FROM clientes
 WHERE boletas_diarias_compradas IS NOT NULL
   AND boletas_diarias_compradas > 0;

-- Si historial_rifas tiene una columna 'tipo', cuantas rifas hay por tipo:
SELECT tipo, COUNT(*) AS total
  FROM historial_rifas
 GROUP BY tipo;


-- -----------------------------------------------------------------------------
-- PASO 2 - BORRAR LAS 3 TABLAS DE RIFAS DIARIAS
-- -----------------------------------------------------------------------------
-- Esto borra para siempre las tablas y todos sus datos. Irreversible.
-- Confirmado por Mateo: borrarlas definitivamente.

DROP TABLE IF EXISTS boletas_diarias        CASCADE;
DROP TABLE IF EXISTS boletas_diarias_3cifras CASCADE;
DROP TABLE IF EXISTS config_rifa_diaria      CASCADE;

-- Validacion: deberian dar error "relation does not exist" si las borraste bien
-- SELECT 1 FROM boletas_diarias        LIMIT 1;  -- debe fallar
-- SELECT 1 FROM boletas_diarias_3cifras LIMIT 1; -- debe fallar
-- SELECT 1 FROM config_rifa_diaria      LIMIT 1; -- debe fallar


-- -----------------------------------------------------------------------------
-- PASO 3 - BORRAR LA COLUMNA boletas_diarias_compradas DE clientes
-- -----------------------------------------------------------------------------
-- Esa columna llevaba la cuenta de cuantas boletas diarias habia comprado
-- cada cliente. Ya nadie la lee ni la escribe (lo arreglamos en Fase 2A/2B).

ALTER TABLE clientes DROP COLUMN IF EXISTS boletas_diarias_compradas;

-- Validacion: el siguiente SELECT debe dar error "column does not exist"
-- SELECT boletas_diarias_compradas FROM clientes LIMIT 1;


-- -----------------------------------------------------------------------------
-- PASO 4 (OPCIONAL) - LIMPIAR HISTORIAL DE RIFAS DIARIAS
-- -----------------------------------------------------------------------------
-- La tabla historial_rifas guarda el resumen de cada rifa terminada.
-- Tiene una columna 'tipo' con valores '2cifras', '3cifras', '4cifras'.
--
-- DECISION TUYA:
--   a) DEJAR los registros historicos de diarias (linea comentada). Asi
--      conservas el historico para consulta personal aunque ya no se use.
--   b) BORRAR todos los registros de diarias (descomentar la linea de DELETE).
--
-- Recomendacion: dejarlos. Ocupan poco espacio y nadie los usa en el codigo.

-- DELETE FROM historial_rifas WHERE tipo IN ('2cifras', '3cifras');


-- -----------------------------------------------------------------------------
-- PASO 5 - VERIFICACION FINAL
-- -----------------------------------------------------------------------------
-- Confirma que no quedan rastros en tablas que SI conservamos.

-- Abonos historicos: dejamos los que tienen tipo='2cifras' o '3cifras' como
-- registro contable (no se borran, solo se consulta).
SELECT tipo, COUNT(*) AS abonos_historicos
  FROM abonos
 GROUP BY tipo;

-- Boletas historicas archivadas (boletas_historico) si existe esa tabla:
-- SELECT COUNT(*) FROM boletas_historico;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
