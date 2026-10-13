-- Cirugías: varios procedimientos quirúrgicos (catálogo de Conceptos) por cirugía.
-- agenda_cirugias.catalogo_quirurgico_id sigue guardando el principal (compatibilidad).
-- Idempotente. NO ejecutar hasta revisar.
BEGIN;

CREATE TABLE IF NOT EXISTS agenda_cirugias_procedimientos_qx (
  cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
  catalogo_quirurgico_id UUID NOT NULL REFERENCES catalogo_quirurgico(id) ON DELETE RESTRICT,
  orden SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (cirugia_id, catalogo_quirurgico_id)
);

CREATE INDEX IF NOT EXISTS idx_cirugias_proc_qx_catalogo
  ON agenda_cirugias_procedimientos_qx (catalogo_quirurgico_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
