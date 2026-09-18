import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SeedDoctorPilotoHonorarios1800000000130 implements MigrationInterface {
  name = 'SeedDoctorPilotoHonorarios1800000000130';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Find Dr. Piloto
    const doctorResult = await queryRunner.query(`
      SELECT id FROM doctores
      WHERE LOWER(email) = 'piloto@eyeadvanced.com'
         OR LOWER(nombre_completo) ILIKE '%piloto%'
      LIMIT 1
    `);
    if (doctorResult.length === 0) return;
    const doctorId = doctorResult[0].id;

    // 2. Ensure usuario_id is linked
    const userIdResult = await queryRunner.query(`
      SELECT id FROM usuarios WHERE LOWER(email) = 'piloto@eyeadvanced.com' LIMIT 1
    `);
    if (userIdResult.length > 0) {
      await queryRunner.query(`UPDATE doctores SET usuario_id = $1 WHERE id = $2 AND usuario_id IS NULL`, [userIdResult[0].id, doctorId]);
    }

    // 3. Create active tariffs
    const today = new Date().toISOString().slice(0, 10);
    await queryRunner.query(`INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) SELECT $1, 'CONSULTA', 'PRINCIPAL', 'FIJO', 800, 'PESOS', $2 WHERE NOT EXISTS (SELECT 1 FROM tarifas_doctor WHERE doctor_id = $1 AND tipo_concepto = 'CONSULTA' AND concepto_id IS NULL AND vigente_hasta IS NULL)`, [doctorId, today]);
    await queryRunner.query(`INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) SELECT $1, 'ESTUDIO', 'PRINCIPAL', 'FIJO', 1200, 'PESOS', $2 WHERE NOT EXISTS (SELECT 1 FROM tarifas_doctor WHERE doctor_id = $1 AND tipo_concepto = 'ESTUDIO' AND concepto_id IS NULL AND vigente_hasta IS NULL)`, [doctorId, today]);
    await queryRunner.query(`INSERT INTO tarifas_doctor (doctor_id, tipo_concepto, rol, tipo_calculo, valor, moneda, vigente_desde) SELECT $1, 'PROCEDIMIENTO', 'PRINCIPAL', 'FIJO', 5000, 'PESOS', $2 WHERE NOT EXISTS (SELECT 1 FROM tarifas_doctor WHERE doctor_id = $1 AND tipo_concepto = 'PROCEDIMIENTO' AND concepto_id IS NULL AND vigente_hasta IS NULL)`, [doctorId, today]);

    // 4. Ensure an open period exists
    const periodExists = await queryRunner.query(`SELECT id FROM periodos_pago WHERE estado IN ('ABIERTO', 'EN_REVISION') LIMIT 1`);
    let periodoId: string;
    if (periodExists.length === 0) {
      const periodResult = await queryRunner.query(`INSERT INTO periodos_pago (codigo, fecha_desde, fecha_hasta, estado) VALUES ('2026-09-S1', '2026-09-01', '2026-09-30', 'ABIERTO') ON CONFLICT (codigo) DO UPDATE SET estado = 'ABIERTO' RETURNING id`);
      periodoId = periodResult[0].id;
    } else {
      periodoId = periodExists[0].id;
    }

    // 5. Backfill consulta_conceptos for Dr. Piloto's consultas without conceptos
    await queryRunner.query(`INSERT INTO consulta_conceptos (consulta_id, doctor_id, tipo_concepto, concepto, precio_aplicado) SELECT c.id, c.doctor_id, 'CONSULTA', 'Consulta de rutina', COALESCE(c.costo_total, 800) FROM consultas c WHERE c.doctor_id = $1 AND NOT EXISTS (SELECT 1 FROM consulta_conceptos cc WHERE cc.consulta_id = c.id)`, [doctorId]);

    // 6. Generate eventos_honorario
    await queryRunner.query(`INSERT INTO eventos_honorario (origen_tipo, origen_id, doctor_id, rol, paciente_id, fecha_servicio, monto_base, monto_devengado, moneda, estado, periodo_id) SELECT CASE cc.tipo_concepto WHEN 'CONSULTA' THEN 'CONSULTA' WHEN 'ESTUDIO' THEN 'ESTUDIO' WHEN 'PROCEDIMIENTO' THEN 'PROCEDIMIENTO' ELSE 'CONSULTA' END, cc.id, cc.doctor_id, 'PRINCIPAL', c.paciente_id, c.fecha::date, cc.precio_aplicado, cc.precio_aplicado, 'PESOS', 'DEVENGADO', $2 FROM consulta_conceptos cc JOIN consultas c ON c.id = cc.consulta_id WHERE cc.doctor_id = $1 AND NOT EXISTS (SELECT 1 FROM eventos_honorario eh WHERE eh.origen_id = cc.id AND eh.doctor_id = cc.doctor_id)`, [doctorId, periodoId]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM eventos_honorario WHERE doctor_id IN (SELECT id FROM doctores WHERE LOWER(email) = 'piloto@eyeadvanced.com')`);
    await queryRunner.query(`DELETE FROM consulta_conceptos WHERE doctor_id IN (SELECT id FROM doctores WHERE LOWER(email) = 'piloto@eyeadvanced.com')`);
    await queryRunner.query(`DELETE FROM tarifas_doctor WHERE doctor_id IN (SELECT id FROM doctores WHERE LOWER(email) = 'piloto@eyeadvanced.com')`);
  }
}
