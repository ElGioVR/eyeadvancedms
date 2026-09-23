import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateReglasProductividadCirugia1800000000200 implements MigrationInterface {
  name = 'CreateReglasProductividadCirugia1800000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tipo de cálculo soportado por las reglas de productividad de cirugía.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_calculo_productividad AS ENUM ('FIJO', 'PORCENTAJE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reglas_productividad_cirugia (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        origen_id UUID NOT NULL REFERENCES aseguranzas(id) ON DELETE CASCADE,
        servicio_id UUID NOT NULL REFERENCES aseguranza_servicios(id) ON DELETE CASCADE,
        rol_id UUID NOT NULL REFERENCES cat_roles_participante(id) ON DELETE CASCADE,
        tipo_calculo tipo_calculo_productividad NOT NULL DEFAULT 'FIJO',
        valor NUMERIC(10,2) NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'PESOS',
        vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
        vigente_hasta DATE,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_rpc_origen ON reglas_productividad_cirugia(origen_id);
      CREATE INDEX idx_rpc_servicio ON reglas_productividad_cirugia(servicio_id);
      CREATE INDEX idx_rpc_rol ON reglas_productividad_cirugia(rol_id);
      CREATE INDEX idx_rpc_vigencia ON reglas_productividad_cirugia(vigente_desde, vigente_hasta);
    `);

    // Solo una regla activa/vigente por Origen + Servicio + Rol.
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_rpc_unica_vigente
        ON reglas_productividad_cirugia(origen_id, servicio_id, rol_id)
        WHERE vigente_hasta IS NULL AND activo = true;
    `);

    await queryRunner.query(`ALTER TABLE reglas_productividad_cirugia ENABLE ROW LEVEL SECURITY;`);

    await queryRunner.query(`
      CREATE POLICY "reglas_productividad_admin_all" ON reglas_productividad_cirugia
        FOR ALL TO authenticated
        USING (
          EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin')
        );
    `);

    await queryRunner.query(`
      CREATE POLICY "reglas_productividad_recepcionista_read" ON reglas_productividad_cirugia
        FOR SELECT TO authenticated
        USING (
          EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista')
        );
    `);

    await queryRunner.query(`
      CREATE POLICY "reglas_productividad_doctor_read" ON reglas_productividad_cirugia
        FOR SELECT TO authenticated
        USING (
          EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'doctor')
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "reglas_productividad_doctor_read" ON reglas_productividad_cirugia;`);
    await queryRunner.query(`DROP POLICY IF EXISTS "reglas_productividad_recepcionista_read" ON reglas_productividad_cirugia;`);
    await queryRunner.query(`DROP POLICY IF EXISTS "reglas_productividad_admin_all" ON reglas_productividad_cirugia;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reglas_productividad_cirugia;`);
    await queryRunner.query(`DROP TYPE IF EXISTS tipo_calculo_productividad;`);
  }
}
