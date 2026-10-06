-- Agrega 'reagendada' al enum agenda_cirugia_estado (lo traia la migracion 170,
-- que no quedo aplicada en produccion). Sin este valor, reagendar una cirugia
-- falla con: invalid input value for enum agenda_cirugia_estado: "reagendada".
-- Idempotente. Correr SOLO esta linea: el SQL Editor ejecuta todo en una
-- transaccion y el valor nuevo no se puede usar hasta que se confirme (55P04).
ALTER TYPE agenda_cirugia_estado ADD VALUE IF NOT EXISTS 'reagendada' AFTER 'aplazada';

-- Verificacion: correr DESPUES, en una consulta aparte:
--   SELECT unnest(enum_range(NULL::agenda_cirugia_estado)) AS estado;
