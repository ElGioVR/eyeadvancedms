import { type MigrationInterface, type QueryRunner } from 'typeorm';

async function widenMoneda(queryRunner: QueryRunner, tabla: string): Promise<void> {
  const existe = await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );
  if (!existe || existe.length === 0) return;

  await queryRunner.query(`
    ALTER TABLE ${tabla}
      ALTER COLUMN moneda TYPE VARCHAR(10),
      ALTER COLUMN moneda SET DEFAULT 'MXN';
  `);
  await queryRunner.query(`
    UPDATE ${tabla}
      SET moneda = 'USD'
      WHERE moneda IS NULL OR moneda = '' OR moneda ILIKE '%USD%' OR moneda ILIKE '%DOLAR%';
  `);
  await queryRunner.query(`
    UPDATE ${tabla}
      SET moneda = 'MXN'
      WHERE moneda IS NULL OR moneda = '' OR moneda NOT IN ('MXN', 'USD');
  `);
}

export class WidenMonedaHonorarios1800000000262 implements MigrationInterface {
  name = 'WidenMonedaHonorarios1800000000262';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await widenMoneda(queryRunner, 'eventos_honorario');
    await widenMoneda(queryRunner, 'tarifas_doctor');
    await widenMoneda(queryRunner, 'liquidaciones_doctor');
    await widenMoneda(queryRunner, 'reglas_productividad_cirugia');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of [
      'eventos_honorario',
      'tarifas_doctor',
      'liquidaciones_doctor',
      'reglas_productividad_cirugia',
    ]) {
      const existe = await queryRunner.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [tabla]
      );
      if (!existe || existe.length === 0) continue;
      await queryRunner.query(`
        UPDATE ${tabla} SET moneda = 'MXN' WHERE moneda IS NULL OR moneda <> 'MXN';
        ALTER TABLE ${tabla}
          ALTER COLUMN moneda SET DEFAULT 'MXN',
          ALTER COLUMN moneda TYPE VARCHAR(3);
      `);
    }
  }
}
