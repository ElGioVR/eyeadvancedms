import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateConfiguracionSistemaTable1800000000030 implements MigrationInterface {
  name = 'CreateConfiguracionSistemaTable1800000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE configuracion_sistema (
        clave VARCHAR(100) PRIMARY KEY,
        valor JSONB NOT NULL,
        descripcion TEXT,
        updated_by UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
        ('honorarios', '{"aseguranza_afecta_honorarios": false, "base_calculo_honorario": "COBRO_TOTAL", "tipo_cambio_default": 17.50, "devengo_automatico": true}'::jsonb, 'Configuración del módulo de honorarios');

      ALTER TABLE configuracion_sistema ENABLE ROW LEVEL SECURITY;

      CREATE POLICY configuracion_sistema_admin_all ON configuracion_sistema
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY configuracion_sistema_read_all ON configuracion_sistema
        FOR SELECT USING (true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS configuracion_sistema_read_all ON configuracion_sistema;
      DROP POLICY IF EXISTS configuracion_sistema_admin_all ON configuracion_sistema;
      DROP TABLE IF EXISTS configuracion_sistema;
    `);
  }
}
