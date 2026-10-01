-- =====================================================================
-- agenda_cirugias.anestesia (Modificaciones agenda, punto I)
-- Mismo contenido que src/migrations/1800000000340-AddAnestesiaToAgendaCirugias.ts
-- Idempotente. Nullable: cirugías existentes quedan sin dato; el formulario
-- nuevo la exige. Aplicar SOLO tras revisión; primero en BD local desechable.
-- =====================================================================

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS anestesia TEXT;

ALTER TABLE agenda_cirugias
  DROP CONSTRAINT IF EXISTS agenda_cirugias_anestesia_check;
ALTER TABLE agenda_cirugias
  ADD CONSTRAINT agenda_cirugias_anestesia_check
  CHECK (anestesia IS NULL OR anestesia IN ('LOCAL_SEDACION', 'LOCAL', 'GENERAL'));
