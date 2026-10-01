-- =====================================================================
-- Importación masiva sin duplicados (Modificaciones agenda, oct 2026)
-- Mismo contenido que src/migrations/1800000000400-ImportSinDuplicados.ts
--  - pacientes/doctores.pendiente_completar: alta automática desde la
--    importación con datos por completar (indicador en la app).
--  - Índice único de alias de doctor sin distinguir mayúsculas/espacios
--    (solo activos). Si ya hay alias repetidos no se crea: se avisa con
--    NOTICE para unificarlos primero. Idempotente.
-- =====================================================================

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE doctores ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pacientes_pendiente_completar ON pacientes (id) WHERE pendiente_completar;
CREATE INDEX IF NOT EXISTS idx_doctores_pendiente_completar ON doctores (id) WHERE pendiente_completar;

DO $alias$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_doctores_alias_ci') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM doctores
     WHERE activo
     GROUP BY upper(btrim(regexp_replace(alias, '\s+', ' ', 'g')))
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Hay doctores activos con el mismo alias (sin distinguir mayusculas). Unificalos y vuelve a correr el script para crear el indice unico.';
    RETURN;
  END IF;
  CREATE UNIQUE INDEX uq_doctores_alias_ci
    ON doctores (upper(btrim(regexp_replace(alias, '\s+', ' ', 'g'))))
    WHERE activo;
END
$alias$;
