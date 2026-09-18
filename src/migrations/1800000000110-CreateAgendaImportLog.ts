import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAgendaImportLog1800000000110 implements MigrationInterface {
  name = 'CreateAgendaImportLog1800000000110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agenda_import_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id UUID REFERENCES auth.users(id),
        archivo_nombre VARCHAR(255),
        total_filas INT DEFAULT 0,
        filas_ok INT DEFAULT 0,
        filas_rechazadas INT DEFAULT 0,
        detalle_rechazados JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE agenda_import_log ENABLE ROW LEVEL SECURITY;
    `);

    await queryRunner.query(`
      CREATE POLICY "Allow all for authenticated" ON agenda_import_log
        FOR ALL TO authenticated USING (true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agenda_import_log;`);
  }
}
