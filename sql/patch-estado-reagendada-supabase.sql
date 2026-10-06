-- Agrega 'reagendada' al enum agenda_cirugia_estado (lo traia la migracion 170,
-- que no quedo aplicada en produccion). Sin este valor, reagendar una cirugia
-- falla con: invalid input value for enum agenda_cirugia_estado: "reagendada".
-- Idempotente. ADD VALUE no puede ir dentro de BEGIN/COMMIT: correr tal cual.
ALTER TYPE agenda_cirugia_estado ADD VALUE IF NOT EXISTS 'reagendada' AFTER 'aplazada';

-- Verificacion
SELECT unnest(enum_range(NULL::agenda_cirugia_estado)) AS estado;
