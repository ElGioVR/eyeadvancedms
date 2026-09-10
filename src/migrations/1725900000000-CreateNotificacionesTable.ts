import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateNotificacionesTable1725900000000 implements MigrationInterface {
  name = 'CreateNotificacionesTable1725900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE notificacion_tipo AS ENUM ('info', 'warning', 'error');

      CREATE TABLE notificaciones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo notificacion_tipo NOT NULL DEFAULT 'info',
        titulo VARCHAR(255) NOT NULL,
        mensaje TEXT NOT NULL,
        entidad_tipo VARCHAR(50),
        entidad_id UUID,
        leido BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_notificaciones_user_id ON notificaciones(user_id);
      CREATE INDEX idx_notificaciones_leido ON notificaciones(user_id, leido);
      CREATE INDEX idx_notificaciones_created_at ON notificaciones(created_at DESC);

      ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

      CREATE POLICY notificaciones_user_isolation ON notificaciones
        USING (user_id = auth.uid());
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS notificaciones_user_isolation ON notificaciones;
      DROP TABLE IF EXISTS notificaciones;
      DROP TYPE IF EXISTS notificacion_tipo;
    `);
  }
}
