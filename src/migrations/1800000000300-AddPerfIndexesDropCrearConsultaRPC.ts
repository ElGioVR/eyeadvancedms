import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Índices para las queries más frecuentes detectadas en auditoría:
 *  - inventario_items(stock): dashboard ordena bajo stock.
 *  - (fecha, deployed_to_performance): sync de productividad filtra así.
 * Además elimina el RPC crear_consulta (código muerto: el endpoint inserta directo).
 */
export class AddPerfIndexesDropCrearConsultaRPC1800000000300 implements MigrationInterface {
  name = 'AddPerfIndexesDropCrearConsultaRPC1800000000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventario_items_stock
        ON inventario_items(stock);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultas_fecha_deployed
        ON consultas(fecha, deployed_to_performance);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_fecha_deployed
        ON agenda_cirugias(fecha, deployed_to_performance);
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS crear_consulta(
        p_paciente_id UUID, p_doctor_id UUID, p_fecha DATE, p_hora_inicio TIME,
        p_hora_fin TIME, p_tipo_consulta TEXT, p_tipo_visita TEXT,
        p_diagnostico TEXT, p_notas TEXT, p_metodo_pago TEXT, p_moneda TEXT,
        p_estudios JSONB
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El RPC crear_consulta no se restaura (código muerto confirmado)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_fecha_deployed;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_fecha_deployed;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventario_items_stock;`);
  }
}
