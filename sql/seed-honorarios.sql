-- ============================================================
-- SEED: Datos de prueba para el módulo de Honorarios
-- 3 doctores con tarifas, 60 días de eventos
-- Ejecutar después de todas las migraciones Fase 1-3
-- ============================================================

-- ============================================================
-- 1. TARIFAS PARA 3 DOCTORES EXISTENTES
-- Usar los primeros 3 doctores activos de la tabla doctores
-- ============================================================

-- Tarifas para el primer doctor (Oftalmología Pediátrica)
DO $$
DECLARE
  doc1 UUID;
  doc2 UUID;
  doc3 UUID;
  fecha_base DATE := '2020-01-01';
BEGIN
  SELECT id INTO doc1 FROM doctores WHERE activo = true ORDER BY created_at LIMIT 1;
  SELECT id INTO doc2 FROM doctores WHERE activo = true AND id != doc1 ORDER BY created_at LIMIT 1;
  SELECT id INTO doc3 FROM doctores WHERE activo = true AND id NOT IN (doc1, doc2) ORDER BY created_at LIMIT 1;

  -- Solo insertar si hay doctores
  IF doc1 IS NOT NULL THEN
    INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) VALUES
    (doc1, 'CONSULTA', 'PRINCIPAL', 'FIJO', 800, 'MXN', fecha_base),
    (doc1, 'ESTUDIO', 'PRINCIPAL', 'FIJO', 1200, 'MXN', fecha_base),
    (doc1, 'PROCEDIMIENTO', 'PRINCIPAL', 'FIJO', 5000, 'MXN', fecha_base),
    (doc1, 'CONSULTA', 'AYUDANTE', 'FIJO', 400, 'MXN', fecha_base),
    (doc1, 'PROCEDIMIENTO', 'AYUDANTE', 'PORCENTAJE', 30, 'MXN', fecha_base)
    ON CONFLICT DO NOTHING;
  END IF;

  IF doc2 IS NOT NULL THEN
    INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) VALUES
    (doc2, 'CONSULTA', 'PRINCIPAL', 'FIJO', 1000, 'MXN', fecha_base),
    (doc2, 'ESTUDIO', 'PRINCIPAL', 'FIJO', 1500, 'MXN', fecha_base),
    (doc2, 'PROCEDIMIENTO', 'PRINCIPAL', 'FIJO', 8000, 'MXN', fecha_base),
    (doc2, 'PROCEDIMIENTO', 'PRINCIPAL', 'FIJO', 12000, 'MXN', fecha_base)
    ON CONFLICT DO NOTHING;
  END IF;

  IF doc3 IS NOT NULL THEN
    INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) VALUES
    (doc3, 'CONSULTA', 'PRINCIPAL', 'FIJO', 600, 'MXN', fecha_base),
    (doc3, 'ESTUDIO', 'PRINCIPAL', 'FIJO', 800, 'MXN', fecha_base),
    (doc3, 'PROCEDIMIENTO', 'PRINCIPAL', 'FIJO', 3000, 'MXN', fecha_base)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- 2. PERÍODO DE PAGO DE EJEMPLO
-- ============================================================
INSERT INTO periodos_pago (codigo, fecha_desde, fecha_hasta, estado)
VALUES ('2026-09-S1', '2026-09-01', '2026-09-15', 'ABIERTO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO periodos_pago (codigo, fecha_desde, fecha_hasta, estado, cerrado_at)
VALUES ('2026-08-S2', '2026-08-16', '2026-08-31', 'CERRADO', '2026-09-01T10:00:00Z')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- 3. EVENTOS DE HONORARIO DE EJEMPLO (60 días)
-- Generar eventos para los doctores con consultas existentes
-- ============================================================

DO $$
DECLARE
  doc UUID;
  pac UUID;
  con UUID;
  fec DATE;
  dias INT;
  i INT;
  tipo_doc tipo_concepto_clinico;
  tipo_rol rol_doctor_concepto;
BEGIN
  FOR doc IN SELECT id FROM doctores WHERE activo = true LIMIT 3 LOOP
    FOR i IN 0..59 LOOP
      fec := CURRENT_DATE - (60 - i);

      -- Buscar un paciente existente
      SELECT id INTO pac FROM pacientes LIMIT 1;
      IF pac IS NULL THEN CONTINUE; END IF;

      -- Buscar una consulta existente para ese doctor
      SELECT id INTO con FROM consultas WHERE doctor_id = doc LIMIT 1;

      -- Crear evento de tipo CONSULTA
      BEGIN
        INSERT INTO eventos_honorario (
          origen_tipo, origen_id, doctor_id, rol, paciente_id,
          fecha_servicio, monto_base, monto_devengado, moneda, estado,
          tarifa_snapshot
        ) VALUES (
          'CONSULTA',
          COALESCE(con, gen_random_uuid()),
          doc,
          'PRINCIPAL',
          pac,
          fec,
          CASE
            WHEN i % 3 = 0 THEN 1500
            WHEN i % 3 = 1 THEN 1000
            ELSE 800
          END,
          CASE
            WHEN i % 3 = 0 THEN 1500
            WHEN i % 3 = 1 THEN 1000
            ELSE 800
          END,
          'MXN',
          'DEVENGADO',
          jsonb_build_object('tipo_calculo', 'FIJO', 'valor', 800)
        );
      EXCEPTION WHEN unique_violation THEN
        -- Ignorar duplicados (idempotencia)
        NULL;
      END;

      -- Crear evento de tipo ESTUDIO cada 3 días
      IF i % 3 = 0 THEN
        BEGIN
          INSERT INTO eventos_honorario (
            origen_tipo, origen_id, doctor_id, rol, paciente_id,
            fecha_servicio, monto_base, monto_devengado, moneda, estado,
            tarifa_snapshot
          ) VALUES (
            'ESTUDIO',
            gen_random_uuid(),
            doc,
            'PRINCIPAL',
            pac,
            fec,
            1200,
            1200,
            'MXN',
            'DEVENGADO',
            jsonb_build_object('tipo_calculo', 'FIJO', 'valor', 1200)
          );
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;

      -- Crear evento de tipo PROCEDIMIENTO cada 7 días
      IF i % 7 = 0 THEN
        BEGIN
          INSERT INTO eventos_honorario (
            origen_tipo, origen_id, doctor_id, rol, paciente_id,
            fecha_servicio, monto_base, monto_devengado, moneda, estado,
            tarifa_snapshot
          ) VALUES (
            'PROCEDIMIENTO',
            gen_random_uuid(),
            doc,
            'PRINCIPAL',
            pac,
            fec,
            5000 + (i * 100),
            5000 + (i * 100),
            'MXN',
            'DEVENGADO',
            jsonb_build_object('tipo_calculo', 'FIJO', 'valor', 5000)
          );
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;

    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================
SELECT 'EVENTOS_CREADOS' as seccion,
  COUNT(*)::TEXT as total,
  COUNT(DISTINCT doctor_id)::TEXT as doctores,
  MIN(fecha_servicio)::TEXT as fecha_min,
  MAX(fecha_servicio)::TEXT as fecha_max
FROM eventos_honorario;

SELECT 'TARIFAS_CREADAS' as seccion,
  COUNT(*)::TEXT as total,
  COUNT(DISTINCT doctor_id)::TEXT as doctores
FROM tarifas_doctor;

SELECT 'PERIODOS_CREADOS' as seccion,
  COUNT(*)::TEXT as total
FROM periodos_pago;
