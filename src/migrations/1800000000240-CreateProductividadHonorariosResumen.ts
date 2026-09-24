import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateProductividadHonorariosResumen1800000000240
  implements MigrationInterface
{
  name = 'CreateProductividadHonorariosResumen1800000000240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eventos_honorario_fecha_servicio_doctor
        ON eventos_honorario(fecha_servicio, doctor_id);

      CREATE INDEX IF NOT EXISTS idx_cirugia_productividad_estado_cirugia
        ON cirugia_productividad(estado, cirugia_id)
        WHERE estado <> 'ANULADO';

      CREATE OR REPLACE FUNCTION productividad_honorarios_resumen(
        p_desde date,
        p_hasta date,
        p_doctor_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        fuente text,
        doctor_id uuid,
        fecha date,
        monto numeric,
        estado_pago text,
        origen text
      )
      LANGUAGE sql
      STABLE
      AS $$
        -- Eventos de honorario (excluye REVERSADO y D10c PROCEDIMIENTO si hay cirugía)
        SELECT
          eh.origen_tipo::text AS fuente,
          eh.doctor_id,
          eh.fecha_servicio AS fecha,
          eh.monto_devengado AS monto,
          CASE
            WHEN COALESCE(eh.tarifa_snapshot->>'sin_tarifa', 'false') = 'true'
              THEN 'PENDIENTE_CONFIG'
            WHEN eh.estado = 'PAGADO'::estado_evento_honorario
              THEN 'PAGADO'
            ELSE 'POR_PAGAR'
          END AS estado_pago,
          COALESCE(
            eh.tarifa_snapshot->>'origen_nombre',
            (
              SELECT a.nombre
              FROM consulta_conceptos cc
              JOIN consultas c ON c.id = cc.consulta_id
              JOIN aseguranzas a ON a.id = c.aseguranza_id
              WHERE eh.origen_tipo IN ('CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO')
                AND cc.id = eh.origen_id
              LIMIT 1
            ),
            (
              SELECT a.nombre
              FROM pacientes p
              JOIN aseguranzas a ON a.id = p.aseguranza_id
              WHERE p.id = eh.paciente_id
              LIMIT 1
            )
          ) AS origen
        FROM eventos_honorario eh
        WHERE eh.estado <> 'REVERSADO'::estado_evento_honorario
          AND eh.fecha_servicio BETWEEN p_desde AND p_hasta
          AND (p_doctor_id IS NULL OR eh.doctor_id = p_doctor_id)
          AND NOT (
            eh.origen_tipo = 'PROCEDIMIENTO'
            AND EXISTS (
              SELECT 1
              FROM consulta_conceptos cc
              JOIN consultas c ON c.id = cc.consulta_id
              JOIN agenda_cirugias ac
                ON ac.consulta_id = COALESCE(c.consulta_origen_id, c.id)
              WHERE cc.id = eh.origen_id
                AND ac.estado <> 'cancelada'
            )
          )

        UNION ALL

        -- Productividad de cirugía (excluye ANULADO y cirugías canceladas)
        SELECT
          'CIRUGIA' AS fuente,
          part.medico_id AS doctor_id,
          ac.fecha,
          cp.monto,
          CASE
            WHEN cp.regla_id IS NULL OR cp.monto IS NULL
              THEN 'PENDIENTE_CONFIG'
            WHEN cp.estado = 'PAGADO'
              THEN 'PAGADO'
            ELSE 'POR_PAGAR'
          END AS estado_pago,
          a.nombre AS origen
        FROM cirugia_productividad cp
        JOIN cirugia_participantes part ON part.id = cp.participante_id
        JOIN agenda_cirugias ac ON ac.id = cp.cirugia_id
        LEFT JOIN aseguranzas a ON a.id = cp.origen_id
        WHERE cp.estado <> 'ANULADO'
          AND ac.estado <> 'cancelada'
          AND ac.fecha BETWEEN p_desde AND p_hasta
          AND (p_doctor_id IS NULL OR part.medico_id = p_doctor_id)
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS productividad_honorarios_resumen(date, date, uuid)`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_cirugia_productividad_estado_cirugia`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_eventos_honorario_fecha_servicio_doctor`
    );
  }
}
