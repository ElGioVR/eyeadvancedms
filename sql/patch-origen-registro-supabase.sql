-- =====================================================================
-- Origen del registro de cirugías y consultas: IMPORTACION (import masivo
-- desde Excel/CSV) o AGENDA (capturada en la agenda del sistema).
-- Idempotente. Copiar TODO en el SQL Editor de Supabase y Run.
-- =====================================================================
ALTER TABLE agenda_cirugias ADD COLUMN IF NOT EXISTS origen_registro TEXT NOT NULL DEFAULT 'AGENDA';
ALTER TABLE consultas       ADD COLUMN IF NOT EXISTS origen_registro TEXT NOT NULL DEFAULT 'AGENDA';

DO $$ BEGIN
  ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_origen_registro_check CHECK (origen_registro IN ('AGENDA', 'IMPORTACION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE consultas ADD CONSTRAINT consultas_origen_registro_check CHECK (origen_registro IN ('AGENDA', 'IMPORTACION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Registros que ya existían: las cirugías importadas no tienen created_by (el alta
-- manual sí) y las consultas importadas son las únicas con permite_empalme = true.
UPDATE agenda_cirugias SET origen_registro = 'IMPORTACION'
 WHERE created_by IS NULL AND origen_registro = 'AGENDA';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'consultas' AND column_name = 'permite_empalme') THEN
    UPDATE consultas SET origen_registro = 'IMPORTACION' WHERE permite_empalme = true AND origen_registro = 'AGENDA';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'agenda_cirugias' AS tabla, origen_registro, count(*) FROM agenda_cirugias GROUP BY 2
UNION ALL
SELECT 'consultas', origen_registro, count(*) FROM consultas GROUP BY 2;
