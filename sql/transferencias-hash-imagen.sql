-- ============================================================================
-- Anti-doble de transferencias (ingresos de Carga IA)  —  2026-06-27
-- ============================================================================
-- Problema: el mismo pantallazo de un movimiento bancario se cargaba dos veces
-- (cargas en paralelo / dos pestañas / la IA leía la hora o la referencia distinto
-- entre cargas) y el "escudo" por campos no lo atrapaba porque vive solo en el
-- código (consulta-y-luego-inserta, sin candado en la base).
--
-- Solución: una HUELLA única de la imagen (hash SHA-256 de los bytes del pantallazo).
-- Si llega el MISMO comprobante otra vez, la base lo rechaza, sin importar cómo lea
-- la IA los campos. El índice es PARCIAL (solo donde hash_imagen no es nulo) para que
-- las filas viejas (sin huella) y otros caminos que no tienen la imagen (ej.
-- subir-comprobante.js) NO se vean afectados.

ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS hash_imagen text;

CREATE UNIQUE INDEX IF NOT EXISTS transferencias_hash_imagen_uniq
  ON transferencias (hash_imagen) WHERE hash_imagen IS NOT NULL;

-- Tras crear la columna, recargar el caché de esquema de la API:
--   NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Limpieza de duplicados EXACTOS viejos (mismo monto+fecha+plataforma+referencia+hora)
-- Se borraron SOLO las copias LIBRES y SIN abono, dejando una por grupo.
-- Respaldo de las 340 filas borradas: tabla  transferencias_backup_dups_20260627
-- (NO se tocaron las copias ya asignadas a boletas; esas requieren revisión manual).
-- ----------------------------------------------------------------------------
