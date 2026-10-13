-- Confirmacion de citas: medio por el cual se confirmo (migracion 1800000000510).
-- Idempotente y aditivo. Sin esta columna la agenda sigue funcionando, pero
-- no se guarda el medio y confirmar desde la agenda responde 409.
BEGIN;

ALTER TABLE agenda_cirugias ADD COLUMN IF NOT EXISTS confirmacion_medio text;
ALTER TABLE consultas       ADD COLUMN IF NOT EXISTS confirmacion_medio text;

DO $$ BEGIN
  ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_confirmacion_medio_check
    CHECK (confirmacion_medio IS NULL OR confirmacion_medio IN ('whatsapp', 'telefono', 'correo', 'presencial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE consultas ADD CONSTRAINT consultas_confirmacion_medio_check
    CHECK (confirmacion_medio IS NULL OR confirmacion_medio IN ('whatsapp', 'telefono', 'correo', 'presencial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Verificacion
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('agenda_cirugias', 'consultas') AND column_name = 'confirmacion_medio'
 ORDER BY 1;
