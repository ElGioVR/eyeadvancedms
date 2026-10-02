-- "Indicado por" seleccionable en estudios y procedimientos (migracion 1800000000460).
-- Idempotente. Se puede aplicar antes o despues de desplegar el codigo:
-- sin esta columna la app guarda la consulta igual, solo que sin el "indicado por".
BEGIN;

ALTER TABLE consulta_conceptos
  ADD COLUMN IF NOT EXISTS indicado_por_id uuid REFERENCES doctores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consulta_conceptos_indicado_por_id
  ON consulta_conceptos(indicado_por_id);

COMMIT;

-- Verificacion: debe salir 1 fila.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'consulta_conceptos' AND column_name = 'indicado_por_id';
