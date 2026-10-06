-- Bandeja de la agenda: confirmacion de citas por WhatsApp (migracion 1800000000490).
-- Idempotente. Se puede aplicar antes o despues de desplegar el codigo:
-- sin estas columnas la bandeja funciona, pero no guarda «Mensaje enviado» / «Confirmó».
BEGIN;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS confirmacion text,
  ADD COLUMN IF NOT EXISTS confirmacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmacion_por uuid;

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS confirmacion text,
  ADD COLUMN IF NOT EXISTS confirmacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmacion_por uuid;

DO $$ BEGIN
  ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_confirmacion_check
    CHECK (confirmacion IS NULL OR confirmacion IN ('enviada', 'confirmada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE consultas ADD CONSTRAINT consultas_confirmacion_check
    CHECK (confirmacion IS NULL OR confirmacion IN ('enviada', 'confirmada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Verificacion
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('agenda_cirugias', 'consultas') AND column_name LIKE 'confirmacion%'
 ORDER BY 1, 2;
