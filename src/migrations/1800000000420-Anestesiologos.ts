import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Anestesiólogos: nuevo tipo de personal (solo ejercen la anestesia).
 * Sus honorarios se liquidan en Productividad (eventos con rol ANESTESIOLOGO).
 */
export class Anestesiologos1800000000420 implements MigrationInterface {
  name = 'Anestesiologos1800000000420';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE doctores DROP CONSTRAINT IF EXISTS doctores_tipo_personal_check`);
    await queryRunner.query(`ALTER TABLE doctores ADD CONSTRAINT doctores_tipo_personal_check CHECK (tipo_personal IN ('MEDICO', 'ENFERMERO', 'ANESTESIOLOGO'))`);
    await queryRunner.query(`
      INSERT INTO cat_roles_participante (clave, nombre, descripcion, orden)
      VALUES ('anestesiologo', 'Anestesiólogo', 'Responsable de anestesia', 3)
      ON CONFLICT (clave) DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE doctores SET tipo_personal = 'MEDICO' WHERE tipo_personal = 'ANESTESIOLOGO'`);
    await queryRunner.query(`ALTER TABLE doctores DROP CONSTRAINT IF EXISTS doctores_tipo_personal_check`);
    await queryRunner.query(`ALTER TABLE doctores ADD CONSTRAINT doctores_tipo_personal_check CHECK (tipo_personal IN ('MEDICO', 'ENFERMERO'))`);
  }
}
