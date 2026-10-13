-- Cirugías: documentos requeridos que no se adjuntan, con su motivo.
-- Idempotente. NO ejecutar hasta revisar.
BEGIN;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS documentos_faltantes JSONB;

COMMIT;

NOTIFY pgrst, 'reload schema';
