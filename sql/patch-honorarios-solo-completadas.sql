-- Honorarios solo para servicios COMPLETADOS (consulta, estudio, cirugía).
-- OPCIONAL: limpia eventos de honorario ya generados (no pagados) de servicios
-- que NO están completados. Los PAGADOS no se tocan. Revisa antes con el SELECT.

-- 1) Vista previa
SELECT eh.origen_tipo, eh.estado, count(*) AS eventos, coalesce(sum(eh.monto_devengado), 0) AS monto
FROM eventos_honorario eh
WHERE eh.estado NOT IN ('PAGADO', 'CANCELADO')
  AND (
    eh.origen_id IN (SELECT id FROM consultas WHERE estatus <> 'COMPLETADA')
    OR eh.origen_id IN (SELECT cc.id FROM consulta_conceptos cc JOIN consultas c ON c.id = cc.consulta_id WHERE c.estatus <> 'COMPLETADA')
    OR eh.origen_id IN (SELECT id FROM agenda_cirugias WHERE estado::text <> 'completada')
  )
GROUP BY eh.origen_tipo, eh.estado;

-- 2) Limpieza (descomenta para ejecutar)
-- UPDATE eventos_honorario eh
-- SET estado = 'CANCELADO'
-- WHERE eh.estado NOT IN ('PAGADO', 'CANCELADO')
--   AND (
--     eh.origen_id IN (SELECT id FROM consultas WHERE estatus <> 'COMPLETADA')
--     OR eh.origen_id IN (SELECT cc.id FROM consulta_conceptos cc JOIN consultas c ON c.id = cc.consulta_id WHERE c.estatus <> 'COMPLETADA')
--     OR eh.origen_id IN (SELECT id FROM agenda_cirugias WHERE estado::text <> 'completada')
--   );
