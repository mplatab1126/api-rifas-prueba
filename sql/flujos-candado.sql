-- Candado anti-duplicado del MOTOR DE FLUJOS (#3) — aplicado 2026-06-22 en "Rifa prueba".
-- Evita que dos copias del motor avancen la MISMA sesión a la vez (mensajes dobles al cliente,
-- el mismo bug que tuvo Liliana con los saludos). La lógica va en FUNCIONES, no escribiendo
-- directo a la columna nueva por la API REST: así el candado no depende de la caché de esquema
-- de PostgREST (lección de la bitácora 2026-06-06).
--
-- Uso desde el motor (api/lib/flujo-motor.js): rpc('flujo_tomar_lock'|'flujo_soltar_lock').

ALTER TABLE public.flujo_sesiones ADD COLUMN IF NOT EXISTS procesando_at timestamptz;

-- Toma el candado de forma ATÓMICA. true = lo consiguió; false = otra copia lo tiene tomado
-- (y no han pasado 30s, el tope por si una copia se cae con el candado puesto).
CREATE OR REPLACE FUNCTION public.flujo_tomar_lock(p_sesion uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.flujo_sesiones
     SET procesando_at = now()
   WHERE id = p_sesion
     AND (procesando_at IS NULL OR procesando_at < now() - interval '30 seconds');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

-- Suelta el candado al terminar el turno.
CREATE OR REPLACE FUNCTION public.flujo_soltar_lock(p_sesion uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.flujo_sesiones SET procesando_at = NULL WHERE id = p_sesion;
$$;

-- El motor corre como service_role/anon (ver bitácora): ambas necesitan EXECUTE.
GRANT EXECUTE ON FUNCTION public.flujo_tomar_lock(uuid)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flujo_soltar_lock(uuid) TO anon, authenticated, service_role;
