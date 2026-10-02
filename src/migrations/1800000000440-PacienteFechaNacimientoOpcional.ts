import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * La fecha de nacimiento del paciente deja de ser obligatoria: se puede crear
 * el paciente (y su consulta o cirugía) sin ella y completarla después.
 * Antes la API rellenaba 2000-01-01 como valor ficticio.
 */
export class PacienteFechaNacimientoOpcional1800000000440 implements MigrationInterface {
  name = 'PacienteFechaNacimientoOpcional1800000000440';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pacientes ALTER COLUMN fecha_nacimiento DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Solo reversible si no quedaron pacientes sin fecha.
    await queryRunner.query(`ALTER TABLE pacientes ALTER COLUMN fecha_nacimiento SET NOT NULL`);
  }
}
