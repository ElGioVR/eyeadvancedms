import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Sesión única por usuario («Trabajar aquí»): la sesión con prioridad
 * (claim `session_id` del JWT de Supabase), cuándo empezó, su última actividad
 * y una etiqueta del dispositivo para el aviso. Ver lib/sesion-unica.ts.
 */
export class SesionUnicaUsuarios1800000000450 implements MigrationInterface {
  name = 'SesionUnicaUsuarios1800000000450';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS sesion_activa_id uuid,
        ADD COLUMN IF NOT EXISTS sesion_activa_desde timestamptz,
        ADD COLUMN IF NOT EXISTS sesion_vista_at timestamptz,
        ADD COLUMN IF NOT EXISTS sesion_dispositivo varchar(120)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuarios
        DROP COLUMN IF EXISTS sesion_dispositivo,
        DROP COLUMN IF EXISTS sesion_vista_at,
        DROP COLUMN IF EXISTS sesion_activa_desde,
        DROP COLUMN IF EXISTS sesion_activa_id`);
  }
}
