-- Cirugías: procedimiento del catálogo quirúrgico (Configuración → Conceptos).
-- servicio_id sigue siendo el vínculo de facturación con la aseguradora.
-- No modifica la función crear_cirugia: el vínculo se guarda después de crearla.
-- Idempotente. NO ejecutar hasta revisar.
BEGIN;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS catalogo_quirurgico_id UUID REFERENCES catalogo_quirurgico(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_catalogo_quirurgico
  ON agenda_cirugias (catalogo_quirurgico_id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT count(*) FILTER (WHERE catalogo_quirurgico_id IS NOT NULL) AS con_catalogo_quirurgico,
       count(*) AS total
  FROM agenda_cirugias;
