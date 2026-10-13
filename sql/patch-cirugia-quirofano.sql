-- Cirugías: quirófano en texto libre (reemplaza la selección del catálogo de recursos en el formulario).
-- Idempotente. NO ejecutar hasta revisar.
BEGIN;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS quirofano TEXT;

COMMIT;

NOTIFY pgrst, 'reload schema';
