DO $$
DECLARE
  v_count INTEGER;
  v_doctor UUID;
  v_consulta UUID;
  v_costo_total DECIMAL;
  v_paciente UUID;
  v_tipos TEXT[] := ARRAY['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'];
  v_descripciones TEXT[] := ARRAY['Consulta general', 'Estudio de campimetria', 'Procedimiento de catarata', 'Consultoria pre-operatoria', 'Revision de lentes'];
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
      v_costo_total := 1500 + (random() * 3500)::INTEGER;
      SELECT id INTO v_paciente FROM pacientes ORDER BY random() LIMIT 1;
      v_consulta := gen_random_uuid();

      INSERT INTO consultas (id, paciente_id, doctor_id, fecha, hora_inicio, tipo_consulta, tipo_visita, diagnostico, notas)
      VALUES (
        v_consulta,
        v_paciente,
        v_doctor,
        CURRENT_DATE - (random() * 90)::INTEGER,
        make_time(8 + (random() * 8)::INTEGER, 0, 0),
        (ARRAY['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'])[floor(random()*3 + 1)]::tipo_consulta,
        (ARRAY['PRIMERA_VEZ', 'SUBSECUENTE'])[floor(random()*2 + 1)]::tipo_visita,
        'Diagnostico de prueba',
        'Generado por script de migracion'
      );

      INSERT INTO consulta_doctor_costo (id, consulta_id, doctor_id, tipo_costo, monto, descripcion)
      VALUES (
        gen_random_uuid(),
        v_consulta,
        v_doctor,
        v_tipos[1 + (i % 3)],
        ROUND(v_costo_total, 2),
        v_descripciones[1 + (i % 5)]
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Datos de prueba generados exitosamente.';
END $$;
