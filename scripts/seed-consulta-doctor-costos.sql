-- scripts/seed-consulta-doctor-costos.sql
-- Genera datos de prueba en consulta_doctor_costo si la tabla está vacía
-- Ejecutar: psql $DATABASE_URL -f scripts/seed-consulta-doctor-costos.sql

DO $$
DECLARE
  v_count INTEGER;
  v_doctor UUID;
  v_consulta UUID;
  v_costo_total DECIMAL;
  v_porcentaje DECIMAL;
  v_tipos TEXT[] := ARRAY['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'];
  v_descripciones TEXT[] := ARRAY['Consulta general', 'Estudio de campimetría', 'Procedimiento de catarata', 'Consultoría pre-operatoria', 'Revisión de lentes'];
  i INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM consulta_doctor_costo;

  IF v_count > 0 THEN
    RAISE NOTICE 'La tabla consulta_doctor_costo ya tiene % registros. Se omiten datos de prueba.', v_count;
    RETURN;
  END IF;

  RAISE NOTICE 'Generando datos de prueba en consulta_doctor_costo...';

  FOR v_doctor IN SELECT id FROM doctores WHERE activo = true LIMIT 3 LOOP
    FOR i IN 1..5 LOOP
      SELECT id, costo_total INTO v_consulta, v_costo_total
      FROM consultas
      WHERE doctor_id = v_doctor
      ORDER BY random()
      LIMIT 1;

      IF v_consulta IS NULL THEN
        v_costo_total := 1500 + (random() * 3500)::INTEGER;
        INSERT INTO consultas (paciente_id, doctor_id, fecha, hora_inicio, tipo_consulta, diagnostico, notas)
        SELECT
          (SELECT id FROM pacientes ORDER BY random() LIMIT 1),
          v_doctor,
          CURRENT_DATE - (random() * 90)::INTEGER,
          (8 + (random() * 8)::INTEGER)::TEXT || ':00',
          (ARRAY['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'])[floor(random()*3 + 1)]::tipo_consulta,
          'Diagnóstico de prueba',
          'Generado por script de migración'
        RETURNING id, costo_total INTO v_consulta, v_costo_total;
      END IF;

      v_porcentaje := (20 + (random() * 60)::INTEGER)::DECIMAL;

      INSERT INTO consulta_doctor_costo (consulta_id, doctor_id, tipo_costo, porcentaje, monto, descripcion)
      VALUES (
        v_consulta,
        v_doctor,
        v_tipos[1 + (i % 3)],
        v_porcentaje,
        ROUND((COALESCE(v_costo_total, 1500) * v_porcentaje / 100), 2),
        v_descripciones[1 + (i % 5)]
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Datos de prueba generados exitosamente.';
END $$;
