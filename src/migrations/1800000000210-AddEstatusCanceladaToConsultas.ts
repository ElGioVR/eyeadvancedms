import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddEstatusCanceladaToConsultas1800000000210 implements MigrationInterface {
  name = 'AddEstatusCanceladaToConsultas1800000000210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'FINALIZADA', 'CANCELADA'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE consultas SET estatus = 'FINALIZADA' WHERE estatus = 'CANCELADA'`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'FINALIZADA'))`);
  }
}
