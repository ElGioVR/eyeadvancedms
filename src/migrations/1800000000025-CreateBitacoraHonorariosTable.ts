import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateBitacoraHonorariosTable1800000000025 implements MigrationInterface {
  name = 'CreateBitacoraHonorariosTable1800000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bitacora_honorarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tabla VARCHAR(50) NOT NULL,
        registro_id UUID NOT NULL,
        accion VARCHAR(50) NOT NULL,
        valor_anterior JSONB,
        valor_nuevo JSONB,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_bitacora_honorarios_tabla ON bitacora_honorarios(tabla, registro_id);
      CREATE INDEX idx_bitacora_honorarios_usuario_id ON bitacora_honorarios(usuario_id);
      CREATE INDEX idx_bitacora_honorarios_created_at ON bitacora_honorarios(created_at DESC);

      -- Solo admin puede ver bitácora
      ALTER TABLE bitacora_honorarios ENABLE ROW LEVEL SECURITY;

      CREATE POLICY bitacora_honorarios_admin_only ON bitacora_honorarios
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS bitacora_honorarios_admin_only ON bitacora_honorarios;
      DROP TABLE IF EXISTS bitacora_honorarios;
    `);
  }
}
