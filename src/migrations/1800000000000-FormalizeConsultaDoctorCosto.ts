import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FormalizeConsultaDoctorCosto1800000000000 implements MigrationInterface {
  name = 'FormalizeConsultaDoctorCosto1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Documentar la tabla existente que fue creada directamente en Supabase.
    // La tabla ya tiene datos reales — NO se recrea.

    // Habilitar RLS si no está habilitado
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'consulta_doctor_costo'
            AND n.nspname = 'public'
            AND c.relrowsecurity = true
        ) THEN
          ALTER TABLE consulta_doctor_costo ENABLE ROW LEVEL SECURITY;
        END IF;
      END
      $$;
    `);

    // Política: admin ve todo
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consulta_doctor_costo'
            AND policyname = 'consulta_doctor_costo_admin_all'
        ) THEN
          CREATE POLICY consulta_doctor_costo_admin_all ON consulta_doctor_costo
            USING (
              EXISTS (
                SELECT 1 FROM usuarios
                WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
              )
            );
        END IF;
      END
      $$;
    `);

    // Política: recepcionista ve todo
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consulta_doctor_costo'
            AND policyname = 'consulta_doctor_costo_recepcionista_all'
        ) THEN
          CREATE POLICY consulta_doctor_costo_recepcionista_all ON consulta_doctor_costo
            USING (
              EXISTS (
                SELECT 1 FROM usuarios
                WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista'
              )
            );
        END IF;
      END
      $$;
    `);

    // Política: doctor ve sus propios registros
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consulta_doctor_costo'
            AND policyname = 'consulta_doctor_costo_doctor_own'
        ) THEN
          CREATE POLICY consulta_doctor_costo_doctor_own ON consulta_doctor_costo
            USING (
              doctor_id IN (
                SELECT doctores.id FROM doctores
                WHERE doctores.usuario_id = auth.uid()
              )
            );
        END IF;
      END
      $$;
    `);

    // Índices para performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consulta_doctor_costo_consulta_id
        ON consulta_doctor_costo(consulta_id);
      CREATE INDEX IF NOT EXISTS idx_consulta_doctor_costo_doctor_id
        ON consulta_doctor_costo(doctor_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS consulta_doctor_costo_doctor_own ON consulta_doctor_costo;
      DROP POLICY IF EXISTS consulta_doctor_costo_recepcionista_all ON consulta_doctor_costo;
      DROP POLICY IF EXISTS consulta_doctor_costo_admin_all ON consulta_doctor_costo;
      ALTER TABLE consulta_doctor_costo DISABLE ROW LEVEL SECURITY;
    `);
  }
}
