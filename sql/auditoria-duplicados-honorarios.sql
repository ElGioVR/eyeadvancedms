-- Auditoría de duplicados potenciales en honorarios (solo SELECT).
-- Correr antes/después de backfill y tras dedupe D10. No modifica datos.

-- 1) Eventos con dedupe_key repetida (excluye REVERSADO; el índice único parcial
--    debería impedir esto en BD; si aparece, hubo carga manual o índice ausente).
SELECT dedupe_key, count(*) AS n, array_agg(id ORDER BY created_at) AS eventos
FROM eventos_honorario
WHERE dedupe_key IS NOT NULL
  AND estado <> 'REVERSADO'
GROUP BY dedupe_key
HAVING count(*) > 1
ORDER BY n DESC;

-- 2) Mismo origen+doctor+rol con más de un evento vivo (índice previo idx_eventos_honorario_unique).
SELECT origen_tipo, origen_id, doctor_id, rol, count(*) AS n
FROM eventos_honorario
WHERE estado <> 'REVERSADO'
GROUP BY origen_tipo, origen_id, doctor_id, rol
HAVING count(*) > 1
ORDER BY n DESC;

-- 3) PROCEDIMIENTO con evento vivo Y cirugía no cancelada en la raíz (D10c:
--    debería excluirse el evento en el resumen; listar si aún existe).
SELECT eh.id AS evento_id, eh.origen_id AS concepto_id, cc.consulta_id,
       COALESCE(c.consulta_origen_id, c.id) AS raiz, ac.id AS cirugia_id, ac.estado
FROM eventos_honorario eh
JOIN consulta_conceptos cc ON cc.id = eh.origen_id
JOIN consultas c ON c.id = cc.consulta_id
JOIN agenda_cirugias ac
  ON ac.consulta_id = COALESCE(c.consulta_origen_id, c.id)
WHERE eh.origen_tipo = 'PROCEDIMIENTO'
  AND eh.estado <> 'REVERSADO'
  AND ac.estado <> 'cancelada'
ORDER BY eh.fecha_servicio DESC;

-- 4) Estudios con diagnostico de derivación pero sin consulta_origen_id
--    (candidatos a sql/backfill-consulta-origen.sql).
SELECT id, folio, fecha, diagnostico
FROM consultas
WHERE consulta_origen_id IS NULL
  AND diagnostico LIKE 'Estudio derivado de consulta %'
ORDER BY fecha DESC;

-- 5) consulta_origen_id apuntando a una raíz que ya no existe (FK ON DELETE SET NULL
--    debería haberlo limpiado; si aparece, revisar integridad).
SELECT id, consulta_origen_id
FROM consultas
WHERE consulta_origen_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM consultas r WHERE r.id = consultas.consulta_origen_id);
