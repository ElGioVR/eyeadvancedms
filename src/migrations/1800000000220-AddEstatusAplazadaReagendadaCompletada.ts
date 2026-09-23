import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddEstatusAplazadaReagendadaCompletada1800000000220 implements MigrationInterface {
  name = 'AddEstatusAplazadaReagendadaCompletada1800000000220';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE consultas SET estatus = 'COMPLETADA' WHERE estatus = 'FINALIZADA'`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE consultas SET estatus = 'FINALIZADA' WHERE estatus = 'COMPLETADA'`);
    await queryRunner.query(`UPDATE consultas SET estatus = 'FINALIZADA' WHERE estatus IN ('APLAZADA', 'REAGENDADA')`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'FINALIZADA', 'CANCELADA'))`);
  }
}
