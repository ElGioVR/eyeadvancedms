import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Las consultas nacen AGENDADA (POST /api/consultas, importación de agenda),
 * pero ningún CHECK previo incluía ese valor: el insert fallaba con 500.
 */
export class AddEstatusAgendadaConsultas1800000000410 implements MigrationInterface {
  name = 'AddEstatusAgendadaConsultas1800000000410';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'AGENDADA', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA', 'FINALIZADA'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE consultas SET estatus = 'BORRADOR' WHERE estatus = 'AGENDADA'`);
    await queryRunner.query(`UPDATE consultas SET estatus = 'COMPLETADA' WHERE estatus = 'FINALIZADA'`);
    await queryRunner.query(`ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus`);
    await queryRunner.query(`ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN ('BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA'))`);
  }
}
