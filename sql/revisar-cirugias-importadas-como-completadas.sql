-- Revisión (SOLO LECTURA): cirugías que entraron COMPLETADAS por el importador
-- sin que nadie confirmara que se realizaron (oct 2026).
--
-- Causa: hasta oct 2026 el importador de agenda marcaba como completada toda fila
-- con fecha anterior al día de la importación. Ahora solo las de hace más de
-- 15 días (DIAS_ATRAS_BANDEJA) entran como historial; las recientes entran como
-- agendadas y aparecen en «Por cerrar».
--
-- Cómo corregir: este archivo NO modifica nada. Con la lista, confirma con la
-- clínica cuáles no se operaron y anúlalas desde la Agenda (admin → «Anular»):
-- así se retiran honorarios no pagados, se libera el lente y queda en historial.

-- 1) Más probables (revisar primero): importadas como completadas, fecha dentro de los 15 días previos
--    a la importación y sin cierre manual registrado en el historial.
SELECT
  c.id,
  c.fecha,
  c.hora,
  c.nombre_paciente,
  c.procedimiento,
  c.ojo,
  c.created_at::date                                   AS importada_el,
  (c.created_at::date - c.fecha)                       AS dias_antes_de_importar,
  (SELECT count(*) FROM eventos_honorario e
    WHERE e.origen_tipo = 'OPERACION' AND e.origen_id = c.id
      AND e.estado <> 'CANCELADO')                     AS honorarios_activos,
  (SELECT count(*) FROM eventos_honorario e
    WHERE e.origen_tipo = 'OPERACION' AND e.origen_id = c.id
      AND e.estado = 'PAGADO')                         AS honorarios_pagados
FROM agenda_cirugias c
WHERE c.estado = 'completada'
  AND c.origen_registro = 'IMPORTACION'
  AND c.fecha IS NOT NULL
  AND c.fecha >= (c.created_at::date - 15)
  AND NOT EXISTS (
    SELECT 1 FROM cirugia_historial h
     WHERE h.cirugia_id = c.id
       AND h.accion = 'ESTADO_CAMBIADO'
       AND h.detalle->>'a' = 'completada'
  )
ORDER BY c.fecha DESC, c.hora;

-- 2) Lista general para que la clínica confirme: TODAS las cirugías completadas
--    desde una fecha (cualquier origen), con quién la cerró y cómo.
--    Ajusta la fecha de inicio según el periodo a revisar.
SELECT
  c.id,
  c.fecha,
  c.hora,
  c.nombre_paciente,
  c.procedimiento,
  c.ojo,
  d.alias                                              AS cirujano,
  c.origen_registro,
  CASE WHEN cierre.usuario_id IS NULL THEN 'Sin cierre manual (importada)'
       ELSE 'Cerrada en el sistema' END                AS como_se_completo,
  u.nombre                                             AS cerrada_por,
  cierre.created_at                                    AS cerrada_el
FROM agenda_cirugias c
LEFT JOIN doctores d ON d.id = c.doctor_id
LEFT JOIN LATERAL (
  SELECT h.usuario_id, h.created_at FROM cirugia_historial h
   WHERE h.cirugia_id = c.id AND h.accion = 'ESTADO_CAMBIADO' AND h.detalle->>'a' = 'completada'
   ORDER BY h.created_at DESC LIMIT 1
) cierre ON true
LEFT JOIN usuarios u ON u.id = cierre.usuario_id
WHERE c.estado = 'completada'
  AND c.fecha >= DATE '2026-09-01'
ORDER BY c.fecha, c.hora;
