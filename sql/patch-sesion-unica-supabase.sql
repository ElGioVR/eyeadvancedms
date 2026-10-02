-- Sesion unica por usuario, "Trabajar aqui" (migracion 1800000000450).
-- Idempotente. Se puede aplicar antes o despues de desplegar el codigo:
-- sin estas columnas la app funciona igual, solo que sin el control de sesion.
BEGIN;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sesion_activa_id uuid,
  ADD COLUMN IF NOT EXISTS sesion_activa_desde timestamptz,
  ADD COLUMN IF NOT EXISTS sesion_vista_at timestamptz,
  ADD COLUMN IF NOT EXISTS sesion_dispositivo varchar(120);

COMMIT;

-- Verificacion: deben salir 4 filas.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'usuarios' AND column_name LIKE 'sesion_%'
 ORDER BY column_name;

-- Liberar a mano la sesion de un usuario (p. ej. si se quedo bloqueado):
-- UPDATE usuarios SET sesion_activa_id = NULL, sesion_vista_at = NULL WHERE email = 'correo@ejemplo.com';
