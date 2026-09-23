import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePermisosArchivo1800000000190 implements MigrationInterface {
  name = 'CreatePermisosArchivo1800000000190';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE permisos_archivo (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        accion TEXT NOT NULL CHECK (accion IN ('ver', 'subir', 'descargar', 'eliminar')),
        permitido BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (usuario_id, accion)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_permisos_archivo_usuario ON permisos_archivo(usuario_id);
      CREATE INDEX idx_permisos_archivo_accion ON permisos_archivo(accion);
    `);

    await queryRunner.query(`
      ALTER TABLE permisos_archivo ENABLE ROW LEVEL SECURITY;

      CREATE POLICY permisos_archivo_admin_all ON permisos_archivo FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

      CREATE POLICY permisos_archivo_user_own ON permisos_archivo FOR SELECT TO authenticated
        USING (usuario_id = auth.uid());
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS permisos_archivo_user_own ON permisos_archivo;
      DROP POLICY IF EXISTS permisos_archivo_admin_all ON permisos_archivo;
      DROP TABLE IF EXISTS permisos_archivo;
    `);
  }
}
