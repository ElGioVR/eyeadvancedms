-- Backfill: consultas.consulta_origen_id a partir del prefijo de 8 chars
-- en diagnostico generado por AgendarEstudioModal:
--   'Estudio derivado de consulta <primeros 8 chars del id de la raíz>'
-- Idempotente: solo llena si está NULL y el prefijo empata con exactamente 1 consulta.
-- Ejecutar en BD local desechable o con respaldo; NO en producción sin revisión.

UPDATE consultas child
SET consulta_origen_id = parent.id
FROM consultas child2
CROSS JOIN LATERAL (
  SELECT substring(child2.diagnostico
    FROM 'Estudio derivado de consulta ([0-9a-fA-F]{8})') AS prefijo
) x
JOIN consultas parent
  ON lower(substring(parent.id::text FROM 1 FOR 8)) = lower(x.prefijo)
WHERE child.id = child2.id
  AND child.consulta_origen_id IS NULL
  AND x.prefijo IS NOT NULL
  AND child2.diagnostico LIKE 'Estudio derivado de consulta %'
  AND (
    SELECT count(*)
    FROM consultas p2
    WHERE lower(substring(p2.id::text FROM 1 FOR 8)) = lower(x.prefijo)
  ) = 1;
