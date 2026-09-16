-- ============================================================
-- VERIFICACIÓN: Cuadre de cobro_detalles vs cobros.monto
-- Ejecutar después del backfill de cobro_detalles
-- ============================================================

-- 1. Verificar que la suma de detalles cuadra con el monto del cobro
SELECT
  'CUADRE' as verificacion,
  c.id as cobro_id,
  c.folio,
  c.monto as monto_cobro,
  COALESCE(SUM(cd.monto_final), 0) as monto_detalles,
  ROUND(c.monto - COALESCE(SUM(cd.monto_final), 0), 2) as diferencia,
  CASE
    WHEN ABS(c.monto - COALESCE(SUM(cd.monto_final), 0)) < 0.01 THEN 'OK'
    WHEN COALESCE(SUM(cd.monto_final), 0) = 0 THEN 'SIN_DETALLES'
    ELSE 'ERROR'
  END as estado
FROM cobros c
LEFT JOIN cobro_detalles cd ON cd.cobro_id = c.id
GROUP BY c.id, c.folio, c.monto
ORDER BY ABS(c.monto - COALESCE(SUM(cd.monto_final), 0)) DESC
LIMIT 50;

-- 2. Resumen de cobros con y sin detalles
SELECT
  'RESUMEN' as verificacion,
  COUNT(*) as total_cobros,
  COUNT(cd.id) as cobros_con_detalles,
  COUNT(*) - COUNT(DISTINCT cd.cobro_id) as cobros_sin_detalles,
  ROUND(
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(DISTINCT cd.cobro_id)::DECIMAL / COUNT(*) * 100)
      ELSE 0
    END, 1
  ) as porcentaje_cubierto
FROM cobros c
LEFT JOIN cobro_detalles cd ON cd.cobro_id = c.id;

-- 3. Cobros con discrepancia significativa (> $1 de diferencia)
SELECT
  'DISCREPANCIA' as verificacion,
  c.id as cobro_id,
  c.folio,
  c.monto as monto_cobro,
  COALESCE(SUM(cd.monto_final), 0) as monto_detalles,
  ROUND(ABS(c.monto - COALESCE(SUM(cd.monto_final), 0)), 2) as diferencia_abs
FROM cobros c
LEFT JOIN cobro_detalles cd ON cd.cobro_id = c.id
GROUP BY c.id, c.folio, c.monto
HAVING ABS(c.monto - COALESCE(SUM(cd.monto_final), 0)) > 1
ORDER BY diferencia_abs DESC;

-- 4. Verificar integridad referencial: detalles huérfanos
SELECT
  'HUERFANOS' as verificacion,
  cd.id as detalle_id,
  cd.cobro_id,
  'Detalle sin cobro válido' as problema
FROM cobro_detalles cd
LEFT JOIN cobros c ON c.id = cd.cobro_id
WHERE c.id IS NULL;

-- 5. Verificar que concepto_id es válido en consulta_conceptos
SELECT
  'CONCEPTO_INVALIDO' as verificacion,
  cc.id as concepto_id,
  cc.tipo_concepto,
  cc.concepto_id,
  'concepto_id no existe en catálogo' as problema
FROM consulta_conceptos cc
WHERE cc.concepto_id IS NOT NULL
  AND (
    (cc.tipo_concepto = 'ESTUDIO' AND NOT EXISTS (SELECT 1 FROM catalogo_estudios ce WHERE ce.id = cc.concepto_id))
    OR
    (cc.tipo_concepto = 'PROCEDIMIENTO' AND NOT EXISTS (SELECT 1 FROM catalogo_procedimientos cp WHERE cp.id = cc.concepto_id))
  );
