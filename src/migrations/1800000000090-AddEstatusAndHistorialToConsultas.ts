import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddEstatusAndHistorialToConsultas1800000000090 implements MigrationInterface {
  name = 'AddEstatusAndHistorialToConsultas1800000000090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add estatus column (workflow status independent of payment)
    await queryRunner.query(`
      ALTER TABLE consultas
        ADD COLUMN IF NOT EXISTS estatus TEXT DEFAULT 'BORRADOR';
    `);

    // 2. Add estatus_pago column (payment status, replaces estado_pago)
    await queryRunner.query(`
      ALTER TABLE consultas
        ADD COLUMN IF NOT EXISTS estatus_pago TEXT DEFAULT 'PENDIENTE_PAGO';
    `);

    // 3. Migrate existing estado_pago values to estatus_pago
    await queryRunner.query(`
      UPDATE consultas SET estatus_pago = 'PAGADO' WHERE estado_pago = 'PAGADO';
    `);
    await queryRunner.query(`
      UPDATE consultas SET estatus_pago = 'PENDIENTE_PAGO' WHERE estado_pago = 'PENDIENTE' OR estado_pago IS NULL;
    `);

    // 4. Set estatus based on existing data
    await queryRunner.query(`
      UPDATE consultas SET estatus = 'FINALIZADA'
      WHERE estatus_pago = 'PAGADO';
    `);
    await queryRunner.query(`
      UPDATE consultas SET estatus = 'PROCESADA'
      WHERE estatus = 'BORRADOR' AND diagnostico IS NOT NULL AND diagnostico != '';
    `);

    // 5. Create consulta_historial table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consulta_historial (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
        tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
          'CREACION', 'CAMBIO_ESTATUS', 'EDICION', 'CANCELACION', 'REAGENDADO', 'PAGADO', 'FINALIZADO'
        )),
        usuario_id UUID REFERENCES auth.users(id),
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consulta_historial_consulta
        ON consulta_historial(consulta_id, created_at DESC);
    `);

    await queryRunner.query(`
      ALTER TABLE consulta_historial ENABLE ROW LEVEL SECURITY;
    `);

    await queryRunner.query(`
      CREATE POLICY "Allow all for authenticated" ON consulta_historial
        FOR ALL TO authenticated USING (true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consulta_historial;`);
    await queryRunner.query(`ALTER TABLE consultas DROP COLUMN IF EXISTS estatus;`);
    await queryRunner.query(`ALTER TABLE consultas DROP COLUMN IF EXISTS estatus_pago;`);
  }
}
