import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * «Indicado por» seleccionable en estudios y procedimientos de la consulta:
 * médico que indicó cada servicio (puede ser distinto del doctor de la
 * consulta y de quien lo realiza). NULL en registros anteriores = doctor de
 * la consulta.
 */
export class IndicadoPorConceptos1800000000460 implements MigrationInterface {
  name = 'IndicadoPorConceptos1800000000460';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consulta_conceptos
        ADD COLUMN IF NOT EXISTS indicado_por_id uuid REFERENCES doctores(id) ON DELETE SET NULL`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consulta_conceptos_indicado_por_id ON consulta_conceptos(indicado_por_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consulta_conceptos_indicado_por_id`);
    await queryRunner.query(`ALTER TABLE consulta_conceptos DROP COLUMN IF EXISTS indicado_por_id`);
  }
}
