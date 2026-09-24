import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateSyncLogTable1800000000250 implements MigrationInterface {
  name = 'CreateSyncLogTable1800000000250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sync_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE,
        consultas_verificadas INTEGER NOT NULL DEFAULT 0,
        cirugias_verificadas INTEGER NOT NULL DEFAULT 0,
        eventos_creados INTEGER NOT NULL DEFAULT 0,
        eventos_existentes INTEGER NOT NULL DEFAULT 0,
        errores INTEGER NOT NULL DEFAULT 0,
        duracion_ms INTEGER NOT NULL DEFAULT 0,
        ejecutado_por UUID REFERENCES usuarios(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

      CREATE POLICY sync_log_admin_all ON sync_log
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sync_log`);
  }
}
