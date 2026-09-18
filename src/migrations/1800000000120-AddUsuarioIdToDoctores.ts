import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddUsuarioIdToDoctores1800000000120 implements MigrationInterface {
  name = 'AddUsuarioIdToDoctores1800000000120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE doctores
        ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_doctores_usuario_id ON doctores(usuario_id);
    `);

    // Auto-link: match existing doctores by email to usuarios
    await queryRunner.query(`
      UPDATE doctores d
      SET usuario_id = u.id
      FROM usuarios u
      WHERE d.usuario_id IS NULL
        AND d.email IS NOT NULL
        AND LOWER(d.email) = LOWER(u.email)
        AND u.rol = 'doctor';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE doctores DROP COLUMN IF EXISTS usuario_id;`);
  }
}
