-- ============================================================
-- BACKFILL: consulta_conceptos desde datos históricos
-- Idempotente: usa ON CONFLICT para evitar duplicados
-- Ejecutar después de crear la tabla consulta_conceptos
-- ============================================================

-- 0. Tabla temporal de aliases para fuzzy matching
DROP TABLE IF EXISTS tmp_alias_estudios;
DROP TABLE IF EXISTS tmp_alias_procedimientos;

CREATE TEMP TABLE tmp_alias_estudios (
  texto_libre TEXT PRIMARY KEY,
  catalogo_id UUID
);

CREATE TEMP TABLE tmp_alias_procedimientos (
  texto_libre TEXT PRIMARY KEY,
  catalogo_id UUID
);

-- 1. Poblar aliases de estudios (match exacto por lower(trim))
INSERT INTO tmp_alias_estudios (texto_libre, catalogo_id)
SELECT DISTINCT
  lower(trim(c.estudio_1)),
  ce.id
FROM consultas c
JOIN catalogo_estudios ce ON lower(trim(ce.nombre)) = lower(trim(c.estudio_1))
WHERE c.estudio_1 IS NOT NULL AND c.estudio_1 != ''
ON CONFLICT (texto_libre) DO NOTHING;

-- Aliases manuales para variantes conocidas
INSERT INTO tmp_alias_estudios (texto_libre, catalogo_id) VALUES
  ('oct macular', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%oct%macular%' LIMIT 1)),
  ('oct nervio optico', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%oct%nervio%' LIMIT 1)),
  ('oct segmento anterior', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%oct%segmento%' LIMIT 1)),
  ('campimetria', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%campimetría%' LIMIT 1)),
  ('topografia corneal', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%topografía%' LIMIT 1)),
  ('ultrasonido b', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%ultrasonido b%' LIMIT 1)),
  ('ultrasonido a', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%ultrasonido a%' LIMIT 1)),
  ('biometria', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%cálculo%lente%' LIMIT 1)),
  ('agudeza visual', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%agudeza visual%' LIMIT 1)),
  ('paquimetria', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%paquimetría%' LIMIT 1)),
  ('fluorangiografia', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%fluorangiografía%' LIMIT 1)),
  ('electroretinograma', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%electroretinograma%' LIMIT 1)),
  ('potenciales visuales', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%potenciales visuales%' LIMIT 1)),
  ('prueba ishihara', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%ishihara%' LIMIT 1)),
  ('fotografia digital', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%fotografía digital%' LIMIT 1)),
  ('microscopia especular', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%microscopia especular%' LIMIT 1)),
  ('tonometria', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%tonometría%' LIMIT 1)),
  ('fotos fondo de ojo', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%fotos de fondo%' LIMIT 1)),
  ('autoflorescencia', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%autoflorescencia%' LIMIT 1)),
  ('ora', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%ora%' LIMIT 1)),
  ('sensibilidad contraste', (SELECT id FROM catalogo_estudios WHERE nombre ILIKE '%contraste%' LIMIT 1))
ON CONFLICT (texto_libre) DO NOTHING;

-- 2. Poblar aliases de procedimientos (match exacto)
INSERT INTO tmp_alias_procedimientos (texto_libre, catalogo_id)
SELECT DISTINCT
  lower(trim(c.procedimiento)),
  cp.id
FROM consultas c
JOIN catalogo_procedimientos cp ON lower(trim(cp.nombre)) = lower(trim(c.procedimiento))
WHERE c.procedimiento IS NOT NULL AND c.procedimiento != ''
ON CONFLICT (texto_libre) DO NOTHING;

-- Aliases manuales para procedimientos conocidos
INSERT INTO tmp_alias_procedimientos (texto_libre, catalogo_id) VALUES
  ('faco', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%facoemulsificación de catarata' LIMIT 1)),
  ('faco + lio', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%facoemulsificación mas%lente%' LIMIT 1)),
  ('facoemulsificacion', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%facoemulsificación de catarata' LIMIT 1)),
  ('vitrectomia anterior', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%vitrectomía anterior%' LIMIT 1)),
  ('vitrectomia posterior', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%vitrectomía posterior%' LIMIT 1)),
  ('vitrectomia + silicon', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%vitrectomía%silicón%' LIMIT 1)),
  ('panfotocoagulacion', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%panfotocoagulación%' LIMIT 1)),
  ('fotocoagulacion', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%fotocoagulación%lámpara%' LIMIT 1)),
  ('laser focal macula', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%laser focal%' LIMIT 1)),
  ('fotoiridotomia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%fotoiridotomía%' LIMIT 1)),
  ('iridotomia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%iridotomía' LIMIT 1)),
  ('inyeccion intravitrea', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%inyección intravitrea' LIMIT 1)),
  ('antiangiogenico', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%antiangiogénico%' LIMIT 1)),
  ('cross linking', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%cross-linking%' LIMIT 1)),
  ('trabeculectomia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%trabeculectomía%' LIMIT 1)),
  ('trabeculoplastia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%trabeculoplastía%' LIMIT 1)),
  ('cerclaje', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%cerclaje%vitrectomía%' LIMIT 1)),
  ('crioterapia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%crioterapia%' LIMIT 1)),
  ('diodo', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%diodo%' LIMIT 1)),
  ('sondeo via lagrimal', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%sondeo%lagrimal%' LIMIT 1)),
  ('transplante cornea', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%transplante%córnea%' LIMIT 1)),
  ('capsulotomia', (SELECT id FROM catalogo_procedimientos WHERE nombre ILIKE '%capsulotomía%' LIMIT 1))
ON CONFLICT (texto_libre) DO NOTHING;

-- 3. Backfill de ESTUDIOS desde estudio_1
INSERT INTO consulta_conceptos (consulta_id, tipo_concepto, concepto_id, texto_original, doctor_id)
SELECT
  c.id,
  'ESTUDIO'::tipo_concepto_clinico,
  ae.catalogo_id,
  c.estudio_1,
  c.estudio_1_doctor_id
FROM consultas c
LEFT JOIN tmp_alias_estudios ae ON ae.texto_libre = lower(trim(c.estudio_1))
WHERE c.estudio_1 IS NOT NULL AND c.estudio_1 != ''
  AND NOT EXISTS (
    SELECT 1 FROM consulta_conceptos cc
    WHERE cc.consulta_id = c.id
      AND cc.tipo_concepto = 'ESTUDIO'
      AND cc.texto_original = c.estudio_1
  )
ON CONFLICT DO NOTHING;

-- 4. Backfill de ESTUDIOS desde estudio_2
INSERT INTO consulta_conceptos (consulta_id, tipo_concepto, concepto_id, texto_original, doctor_id)
SELECT
  c.id,
  'ESTUDIO'::tipo_concepto_clinico,
  ae.catalogo_id,
  c.estudio_2,
  c.estudio_2_doctor_id
FROM consultas c
LEFT JOIN tmp_alias_estudios ae ON ae.texto_libre = lower(trim(c.estudio_2))
WHERE c.estudio_2 IS NOT NULL AND c.estudio_2 != ''
  AND NOT EXISTS (
    SELECT 1 FROM consulta_conceptos cc
    WHERE cc.consulta_id = c.id
      AND cc.tipo_concepto = 'ESTUDIO'
      AND cc.texto_original = c.estudio_2
  )
ON CONFLICT DO NOTHING;

-- 5. Backfill de ESTUDIOS desde estudio_3
INSERT INTO consulta_conceptos (consulta_id, tipo_concepto, concepto_id, texto_original, doctor_id)
SELECT
  c.id,
  'ESTUDIO'::tipo_concepto_clinico,
  ae.catalogo_id,
  c.estudio_3,
  c.estudio_3_doctor_id
FROM consultas c
LEFT JOIN tmp_alias_estudios ae ON ae.texto_libre = lower(trim(c.estudio_3))
WHERE c.estudio_3 IS NOT NULL AND c.estudio_3 != ''
  AND NOT EXISTS (
    SELECT 1 FROM consulta_conceptos cc
    WHERE cc.consulta_id = c.id
      AND cc.tipo_concepto = 'ESTUDIO'
      AND cc.texto_original = c.estudio_3
  )
ON CONFLICT DO NOTHING;

-- 6. Backfill de PROCEDIMIENTOS
INSERT INTO consulta_conceptos (consulta_id, tipo_concepto, concepto_id, texto_original, doctor_id)
SELECT
  c.id,
  'PROCEDIMIENTO'::tipo_concepto_clinico,
  ap.catalogo_id,
  c.procedimiento,
  c.procedimiento_doctor_id
FROM consultas c
LEFT JOIN tmp_alias_procedimientos ap ON ap.texto_libre = lower(trim(c.procedimiento))
WHERE c.procedimiento IS NOT NULL AND c.procedimiento != ''
  AND NOT EXISTS (
    SELECT 1 FROM consulta_conceptos cc
    WHERE cc.consulta_id = c.id
      AND cc.tipo_concepto = 'PROCEDIMIENTO'
      AND cc.texto_original = c.procedimiento
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- REPORTE DE COBERTURA
-- ============================================================
SELECT 'RESUMEN' as seccion, '' as campo, '' as total, '' as migrados, '' as pendientes
UNION ALL
SELECT 'estudio_1',
       COUNT(*)::TEXT,
       COUNT(cc.id)::TEXT,
       (COUNT(*) - COUNT(cc.id))::TEXT
FROM consultas c
LEFT JOIN consulta_conceptos cc ON cc.consulta_id = c.id
  AND cc.tipo_concepto = 'ESTUDIO' AND cc.texto_original = c.estudio_1
WHERE c.estudio_1 IS NOT NULL AND c.estudio_1 != ''
UNION ALL
SELECT 'estudio_2',
       COUNT(*)::TEXT,
       COUNT(cc.id)::TEXT,
       (COUNT(*) - COUNT(cc.id))::TEXT
FROM consultas c
LEFT JOIN consulta_conceptos cc ON cc.consulta_id = c.id
  AND cc.tipo_concepto = 'ESTUDIO' AND cc.texto_original = c.estudio_2
WHERE c.estudio_2 IS NOT NULL AND c.estudio_2 != ''
UNION ALL
SELECT 'estudio_3',
       COUNT(*)::TEXT,
       COUNT(cc.id)::TEXT,
       (COUNT(*) - COUNT(cc.id))::TEXT
FROM consultas c
LEFT JOIN consulta_conceptos cc ON cc.consulta_id = c.id
  AND cc.tipo_concepto = 'ESTUDIO' AND cc.texto_original = c.estudio_3
WHERE c.estudio_3 IS NOT NULL AND c.estudio_3 != ''
UNION ALL
SELECT 'procedimiento',
       COUNT(*)::TEXT,
       COUNT(cc.id)::TEXT,
       (COUNT(*) - COUNT(cc.id))::TEXT
FROM consultas c
LEFT JOIN consulta_conceptos cc ON cc.consulta_id = c.id
  AND cc.tipo_concepto = 'PROCEDIMIENTO' AND cc.texto_original = c.procedimiento
WHERE c.procedimiento IS NOT NULL AND c.procedimiento != '';

-- ============================================================
-- DETALLE: Textos no resueltos (para revisión manual)
-- ============================================================
SELECT 'NO_RESUELTOS' as seccion, c.estudio_1 as texto, COUNT(*) as repeticiones
FROM consultas c
LEFT JOIN tmp_alias_estudios ae ON ae.texto_libre = lower(trim(c.estudio_1))
WHERE c.estudio_1 IS NOT NULL AND c.estudio_1 != ''
  AND ae.catalogo_id IS NULL
GROUP BY c.estudio_1
ORDER BY repeticiones DESC;

-- Limpiar tablas temporales
DROP TABLE IF EXISTS tmp_alias_estudios;
DROP TABLE IF EXISTS tmp_alias_procedimientos;
