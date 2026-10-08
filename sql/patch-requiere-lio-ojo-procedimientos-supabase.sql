-- C12 / C13 (comentarios clínica, oct 2026). Aditivo e idempotente.
-- 1) Bandera requiere_lio en el catálogo de servicios (si aún no existe).
ALTER TABLE aseguranza_servicios ADD COLUMN IF NOT EXISTS requiere_lio BOOLEAN NOT NULL DEFAULT false;

-- 2) Siembra: marca como Faco + LIO los servicios cuyo nombre lo indica (FACO, LIO, CATARATA, FACOEMULSIFICACION).
--    Revisa el resultado con el SELECT antes de confiar en él.
UPDATE aseguranza_servicios
SET requiere_lio = true
WHERE tipo = 'PROCEDIMIENTO'
  AND upper(translate(nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) ~ '(^|[^A-Z])(FACO|LIO)([^A-Z]|$)|CATARATA|FACOEMULSIFICACION';

SELECT id, nombre, requiere_lio FROM aseguranza_servicios WHERE requiere_lio ORDER BY nombre;

-- 3) Ojo por procedimiento adicional de la cirugía.
ALTER TABLE cirugia_procedimientos ADD COLUMN IF NOT EXISTS ojo TEXT;
ALTER TABLE cirugia_procedimientos DROP CONSTRAINT IF EXISTS cirugia_procedimientos_ojo_check;
ALTER TABLE cirugia_procedimientos ADD CONSTRAINT cirugia_procedimientos_ojo_check CHECK (ojo IN ('OD', 'OI', 'OU'));
