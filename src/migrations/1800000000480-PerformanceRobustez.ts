import { readFileSync } from 'fs';
import { join } from 'path';
import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Performance y robustez (oct 2026). Mismo contenido que
 * sql/patch-performance-oct2026-supabase.sql (idempotente):
 * índices trigram y compuestos, resumen de pacientes por trigger, RPC del
 * dashboard, idempotencia de altas, límite de solicitudes compartido,
 * avisos de tiempo real (si existe el esquema realtime), salud() y jobs de
 * pg_cron (si la extensión está activa).
 */
export class PerformanceRobustez1800000000480 implements MigrationInterface {
  name = 'PerformanceRobustez1800000000480';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(join(process.cwd(), 'sql', 'patch-performance-oct2026-supabase.sql'), 'utf8');
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
          PERFORM cron.unschedule(j) FROM unnest(ARRAY['resumen-pacientes-diario','limpiar-idempotencia','limpiar-limites-tasa']) AS j
           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
        END IF;
        IF to_regclass('realtime.messages') IS NOT NULL THEN
          EXECUTE 'DROP POLICY IF EXISTS "usuarios activos escuchan cambios-clinica" ON realtime.messages';
        END IF;
      END $$;
      DROP TRIGGER IF EXISTS trg_avisar_cambio_consultas ON consultas;
      DROP TRIGGER IF EXISTS trg_avisar_cambio_agenda ON agenda_cirugias;
      DROP FUNCTION IF EXISTS avisar_cambio_clinica();
      DROP TRIGGER IF EXISTS trg_consultas_resumen_paciente ON consultas;
      DROP FUNCTION IF EXISTS trg_consultas_resumen_paciente();
      DROP FUNCTION IF EXISTS recalcular_resumen_paciente(uuid);
      ALTER TABLE pacientes DROP COLUMN IF EXISTS consultas_count, DROP COLUMN IF EXISTS ultima_visita;
      DROP FUNCTION IF EXISTS dashboard_graficas(date, date, date, integer);
      DROP FUNCTION IF EXISTS reservar_idempotencia(uuid, uuid, text);
      DROP TABLE IF EXISTS solicitudes_idempotentes;
      DROP FUNCTION IF EXISTS limite_tasa(text, integer, integer, text);
      DROP FUNCTION IF EXISTS reiniciar_limite(text);
      DROP TABLE IF EXISTS limites_tasa;
      DROP FUNCTION IF EXISTS salud();
      DROP INDEX IF EXISTS idx_pacientes_telefono_trgm, idx_pacientes_email_trgm, idx_pacientes_expediente_trgm,
        idx_pacientes_tels_trgm, idx_agenda_nombre_trgm, idx_agenda_expediente_trgm, idx_consultas_fecha_estatus,
        idx_notificaciones_no_leidas, idx_agenda_cirugias_fecha_estado;
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          ALTER ROLE service_role RESET statement_timeout;
        END IF;
      END $$;
    `);
  }
}
