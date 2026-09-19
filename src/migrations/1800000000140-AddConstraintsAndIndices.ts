import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddConstraintsAndIndices1800000000140 implements MigrationInterface {
  name = 'AddConstraintsAndIndices1800000000140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Homologar moneda: cualquier valor con MXN→MXN, USD→USD, NULL→MXN
    await queryRunner.query(`UPDATE consultas SET moneda = 'MXN' WHERE moneda ILIKE '%MXN%' OR moneda ILIKE '%PESO%' OR moneda = 'PESOS' OR moneda = 'MXN'`);
    await queryRunner.query(`UPDATE consultas SET moneda = 'USD' WHERE moneda ILIKE '%USD%' OR moneda ILIKE '%DOLAR%' OR moneda = 'DOLARES' OR moneda = 'USD'`);
    await queryRunner.query(`UPDATE consultas SET moneda = 'MXN' WHERE moneda IS NULL OR moneda NOT IN ('MXN', 'USD')`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_moneda CHECK (moneda IN ('MXN', 'USD'))`);
    await queryRunner.query(`ALTER TABLE consultas ALTER COLUMN moneda SET DEFAULT 'MXN'`);
    await queryRunner.query(`ALTER TABLE consultas ALTER COLUMN moneda SET NOT NULL`);

    // 2. CHECK constraints para estatus
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'FINALIZADA'))`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus_pago CHECK (estatus_pago IN ('PENDIENTE_PAGO', 'PAGADO'))`);

    // 3. Consultas.aseguranza_id (FK a aseguranzas)
    await queryRunner.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS aseguranza_id UUID REFERENCES aseguranzas(id) ON DELETE SET NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_consultas_aseguranza_id ON consultas(aseguranza_id)`);

    // 4. Folio con SEQUENCE + UNIQUE
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS seq_consulta_folio START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT uq_consultas_folio UNIQUE (folio)`);

    // 5. Índices de rendimiento (verificados con EXPLAIN)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_consultas_fecha ON consultas(fecha)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_consultas_paciente_id ON consultas(paciente_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_consultas_doctor_fecha ON consultas(doctor_id, fecha)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_fecha ON agenda_cirugias(fecha)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_doctor_fecha ON agenda_cirugias(doctor_id, fecha)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_eventos_honorario_doctor_estado_fecha ON eventos_honorario(doctor_id, estado, fecha_servicio)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eventos_honorario_doctor_estado_fecha`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_doctor_fecha`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_fecha`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_doctor_fecha`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_paciente_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_fecha`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS uq_consultas_folio`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS seq_consulta_folio`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_aseguranza_id`);
    await queryRunner.query(`ALTER TABLE consultas DROP COLUMN IF EXISTS aseguranza_id`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus_pago`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ALTER COLUMN moneda DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE consultas ALTER COLUMN moneda DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_moneda`);
  }
}
