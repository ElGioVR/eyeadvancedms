import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCrearConsultaRPC1800000000160 implements MigrationInterface {
  name = 'CreateCrearConsultaRPC1800000000160';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Atomic function: crear_consulta
    // Inserts consulta + consulta_conceptos + historial in ONE transaction
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION crear_consulta(
        p_paciente_id UUID,
        p_doctor_id UUID,
        p_fecha DATE,
        p_hora_inicio TIME,
        p_hora_fin TIME DEFAULT NULL,
        p_tipo_consulta TEXT DEFAULT 'CONSULTA',
        p_tipo_visita TEXT DEFAULT 'PRIMERA_VEZ',
        p_diagnostico TEXT DEFAULT NULL,
        p_notas TEXT DEFAULT NULL,
        p_metodo_pago TEXT DEFAULT NULL,
        p_moneda TEXT DEFAULT 'MXN',
        p_estudios JSONB DEFAULT '[]',
        p_procedimiento TEXT DEFAULT NULL,
        p_procedimiento_doctor_id UUID DEFAULT NULL,
        p_paciente_aseguranza_id UUID DEFAULT NULL
      ) RETURNS JSONB AS $$
      DECLARE
        v_consulta_id UUID;
        v_folio TEXT;
        v_aseguranza_id UUID;
        v_costo_total NUMERIC := 0;
        v_estudio JSONB;
        v_concepto_tipo TEXT;
        v_concepto_nombre TEXT;
        v_concepto_precio NUMERIC;
        v_concepto_doctor_id UUID;
        v_svc RECORD;
        v_seq INT;
        v_year TEXT;
      BEGIN
        -- Resolve aseguranza from patient
        IF p_paciente_aseguranza_id IS NOT NULL THEN
          v_aseguranza_id := p_paciente_aseguranza_id;
        ELSE
          SELECT aseguranza_id INTO v_aseguranza_id
          FROM pacientes WHERE id = p_paciente_id;
        END IF;

        -- Generate folio
        v_year := RIGHT(EXTRACT(YEAR FROM NOW())::TEXT, 2);
        SELECT COALESCE(MAX(CAST(SUBSTRING(folio FROM 7 FOR 5) AS INT)), 0) + 1
        INTO v_seq FROM consultas WHERE folio LIKE 'CON-' || v_year || '-%';
        v_folio := 'CON-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');

        -- Insert consulta
        INSERT INTO consultas (
          folio, paciente_id, doctor_id, fecha, hora_inicio, hora_fin,
          tipo_consulta, tipo_visita, diagnostico, notas, metodo_pago,
          moneda, estatus, estatus_pago, aseguranza_id
        ) VALUES (
          v_folio, p_paciente_id, p_doctor_id, p_fecha, p_hora_inicio, p_hora_fin,
          p_tipo_consulta::tipo_consulta, p_tipo_visita::tipo_visita, p_diagnostico, p_notas, p_metodo_pago,
          p_moneda, 'BORRADOR', 'PENDIENTE_PAGO', v_aseguranza_id
        ) RETURNING id INTO v_consulta_id;

        -- Process estudios from JSONB array
        FOR v_estudio IN SELECT * FROM jsonb_array_elements(p_estudios)
        LOOP
          v_concepto_nombre := v_estudio->>'nombre';
          v_concepto_doctor_id := (v_estudio->>'doctor_id')::UUID;
          v_concepto_tipo := 'ESTUDIO';

          -- Resolve price from aseguranza_servicios
          v_concepto_precio := 0;
          IF v_aseguranza_id IS NOT NULL AND v_concepto_nombre IS NOT NULL THEN
            SELECT costo INTO v_concepto_precio
            FROM aseguranza_servicios
            WHERE aseguranza_id = v_aseguranza_id
              AND tipo = v_concepto_tipo
              AND LOWER(nombre_norm) = LOWER(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(v_concepto_nombre, '[áà]', 'a', 'gi'),
                  '[éè]', 'e', 'gi'
                )
              )
              AND activo = true
            LIMIT 1;
          END IF;

          -- Insert concepto
          INSERT INTO consulta_conceptos (
            consulta_id, doctor_id, tipo_concepto, concepto_id, texto_original, precio_aplicado
          ) VALUES (
            v_consulta_id,
            COALESCE(v_concepto_doctor_id, p_doctor_id),
            v_concepto_tipo::tipo_concepto_clinico,
            NULL,
            v_concepto_nombre,
            v_concepto_precio
          );

          v_costo_total := v_costo_total + v_concepto_precio;
        END LOOP;

        -- Process procedimiento
        IF p_procedimiento IS NOT NULL THEN
          v_concepto_precio := 0;
          IF v_aseguranza_id IS NOT NULL THEN
            SELECT costo INTO v_concepto_precio
            FROM aseguranza_servicios
            WHERE aseguranza_id = v_aseguranza_id
              AND tipo = 'PROCEDIMIENTO'
              AND LOWER(nombre_norm) = LOWER(p_procedimiento)
              AND activo = true
            LIMIT 1;
          END IF;

          INSERT INTO consulta_conceptos (
            consulta_id, doctor_id, tipo_concepto, concepto_id, texto_original, precio_aplicado
          ) VALUES (
            v_consulta_id,
            COALESCE(p_procedimiento_doctor_id, p_doctor_id),
            'PROCEDIMIENTO'::tipo_concepto_clinico,
            NULL,
            p_procedimiento,
            v_concepto_precio
          );
          v_costo_total := v_costo_total + v_concepto_precio;
        END IF;

        -- Update total cost
        UPDATE consultas
        SET costo_total = v_costo_total,
            estatus = CASE WHEN v_costo_total > 0 THEN 'PROCESADA' ELSE 'BORRADOR' END,
            estatus_pago = CASE WHEN v_costo_total > 0 THEN 'PENDIENTE_PAGO' ELSE 'PAGADO' END
        WHERE id = v_consulta_id;

        -- Insert historial
        INSERT INTO consulta_historial (consulta_id, tipo_evento, usuario_id, payload)
        VALUES (v_consulta_id, 'EDICION', auth.uid(), jsonb_build_object(
          'motivo', 'Creación de consulta',
          'folio', v_folio,
          'costo_total', v_costo_total,
          'aseguranza_id', v_aseguranza_id
        ));

        RETURN jsonb_build_object(
          'consulta_id', v_consulta_id,
          'folio', v_folio,
          'costo_total', v_costo_total,
          'aseguranza_id', v_aseguranza_id
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    // Atomic function: actualizar_consulta
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_consulta(
        p_consulta_id UUID,
        p_updates JSONB
      ) RETURNS JSONB AS $$
      DECLARE
        v_old_estatus TEXT;
        v_new_estatus TEXT;
      BEGIN
        SELECT estatus INTO v_old_estatus FROM consultas WHERE id = p_consulta_id;

        UPDATE consultas SET
          fecha = COALESCE((p_updates->>'fecha')::DATE, fecha),
          hora_inicio = COALESCE((p_updates->>'hora_inicio')::TIME, hora_inicio),
          hora_fin = COALESCE((p_updates->>'hora_fin')::TIME, hora_fin),
          diagnostico = COALESCE(p_updates->>'diagnostico', diagnostico),
          notas = COALESCE(p_updates->>'notas', notas),
          metodo_pago = COALESCE(p_updates->>'metodo_pago', metodo_pago),
          estatus = COALESCE(p_updates->>'estatus', estatus),
          estatus_pago = COALESCE(p_updates->>'estatus_pago', estatus_pago),
          updated_at = now()
        WHERE id = p_consulta_id
        RETURNING estatus INTO v_new_estatus;

        IF v_old_estatus IS DISTINCT FROM v_new_estatus THEN
          INSERT INTO consulta_historial (consulta_id, tipo_evento, usuario_id, payload)
          VALUES (p_consulta_id, 'CAMBIO_ESTATUS', auth.uid(), jsonb_build_object(
            'de', v_old_estatus, 'a', v_new_estatus
          ));
        ELSE
          INSERT INTO consulta_historial (consulta_id, tipo_evento, usuario_id, payload)
          VALUES (p_consulta_id, 'EDICION', auth.uid(), jsonb_build_object(
            'campos_modificados', jsonb_object_keys(p_updates)
          ));
        END IF;

        RETURN jsonb_build_object('ok', true, 'estatus', v_new_estatus);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS actualizar_consulta(UUID, JSONB)`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS crear_consulta(UUID, UUID, DATE, TIME, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, UUID)`);
  }
}
