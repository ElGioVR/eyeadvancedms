-- Numero de expediente del paciente (migracion 1800000000430).
-- Opcional; unico sin distinguir mayusculas ni espacios extremos.
-- Idempotente. Pegar completo en el SQL Editor de Supabase ANTES de desplegar el codigo.
BEGIN;

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_expediente TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_numero_expediente_uq
  ON pacientes (upper(btrim(numero_expediente)))
  WHERE numero_expediente IS NOT NULL AND btrim(numero_expediente) <> '';

COMMIT;

-- Verificacion: debe devolver una fila con la columna y otra con el indice.
SELECT 'columna' AS objeto, column_name AS nombre FROM information_schema.columns
 WHERE table_name = 'pacientes' AND column_name = 'numero_expediente'
UNION ALL
SELECT 'indice', indexname FROM pg_indexes WHERE tablename = 'pacientes' AND indexname = 'pacientes_numero_expediente_uq';
