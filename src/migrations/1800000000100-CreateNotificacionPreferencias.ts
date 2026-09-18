import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateNotificacionPreferencias1800000000100 implements MigrationInterface {
  name = 'CreateNotificacionPreferencias1800000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notificacion_preferencias (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
          'PAGO_HONORARIOS',
          'RECORDATORIO_CONSULTA',
          'ASIGNACION_SERVICIO',
          'PROXIMA_CIRUGIA',
          'CANCELACION',
          'REAGENDADO',
          'SISTEMA'
        )),
        canal TEXT NOT NULL DEFAULT 'IN_APP' CHECK (canal IN ('IN_APP', 'EMAIL', 'PUSH')),
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(user_id, tipo_evento, canal)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE notificacion_preferencias ENABLE ROW LEVEL SECURITY;
    `);

    await queryRunner.query(`
      CREATE POLICY "Users manage own preferences" ON notificacion_preferencias
        FOR ALL TO authenticated
        USING (user_id = auth.uid());
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notificacion_preferencias(user_id);
    `);

    // Insert default preferences for all existing users
    await queryRunner.query(`
      INSERT INTO notificacion_preferencias (user_id, tipo_evento, canal, activo)
      SELECT u.id, ev.tipo, 'IN_APP', true
      FROM auth.users u
      CROSS JOIN (VALUES
        ('PAGO_HONORARIOS'),
        ('RECORDATORIO_CONSULTA'),
        ('ASIGNACION_SERVICIO'),
        ('PROXIMA_CIRUGIA'),
        ('CANCELACION'),
        ('REAGENDADO')
      ) AS ev(tipo)
      WHERE NOT EXISTS (
        SELECT 1 FROM notificacion_preferencias np
        WHERE np.user_id = u.id AND np.tipo_evento = ev.tipo AND np.canal = 'IN_APP'
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notificacion_preferencias;`);
  }
}
