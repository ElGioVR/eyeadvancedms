import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Comentarios clínica (oct 2026), Fase 0 — cambios aditivos.
 * - agenda_cirugias: tipo_caso (PRIMERA | REAGENDA | REINTERVENCION), reagenda_de_id,
 *   procedencia, tiempos de cirugía y estancia (minutos).
 * - cirugia_lentes: hasta 3 lentes por cirugía (PRIMERO | SEGUNDO | RESPALDO) con
 *   estado RESERVADO → USADO | LIBERADO. Solo origen INVENTARIO toca stock; HOSPITAL no.
 * - aseguranza_servicios.requiere_lio: activa el bloque LIO en el formulario.
 */
export class CirugiaLentesReservasTipoCaso1800000000500 implements MigrationInterface {
  name = 'CirugiaLentesReservasTipoCaso1800000000500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD COLUMN IF NOT EXISTS tipo_caso TEXT NOT NULL DEFAULT 'PRIMERA',
        ADD COLUMN IF NOT EXISTS reagenda_de_id UUID REFERENCES agenda_cirugias(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS procedencia TEXT,
        ADD COLUMN IF NOT EXISTS tiempo_cx_min INTEGER,
        ADD COLUMN IF NOT EXISTS tiempo_estancia_min INTEGER`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_tipo_caso_check
          CHECK (tipo_caso IN ('PRIMERA', 'REAGENDA', 'REINTERVENCION'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_tiempos_check
          CHECK ((tiempo_cx_min IS NULL OR tiempo_cx_min >= 0)
             AND (tiempo_estancia_min IS NULL OR tiempo_estancia_min >= 0));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_paciente_fecha_ojo
        ON agenda_cirugias (paciente_id, fecha, ojo)`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_reagenda_de
        ON agenda_cirugias (reagenda_de_id) WHERE reagenda_de_id IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cirugia_lentes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        orden TEXT NOT NULL CHECK (orden IN ('PRIMERO', 'SEGUNDO', 'RESPALDO')),
        origen TEXT NOT NULL CHECK (origen IN ('INVENTARIO', 'HOSPITAL')),
        inventario_item_id UUID REFERENCES inventario_items(id) ON DELETE SET NULL,
        fabricante TEXT,
        modelo TEXT,
        poder_d NUMERIC(5,2),
        torico BOOLEAN NOT NULL DEFAULT false,
        estado TEXT NOT NULL DEFAULT 'RESERVADO' CHECK (estado IN ('RESERVADO', 'USADO', 'LIBERADO')),
        requerido BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT cirugia_lentes_inventario_check CHECK (
          origen = 'HOSPITAL' OR inventario_item_id IS NOT NULL),
        CONSTRAINT cirugia_lentes_requerido_check CHECK (
          NOT requerido OR estado = 'USADO')
      )`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cirugia_lentes_cirugia_orden
        ON cirugia_lentes (cirugia_id, orden)`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cirugia_lentes_item_reservado
        ON cirugia_lentes (inventario_item_id) WHERE estado = 'RESERVADO'`);
    await queryRunner.query(`ALTER TABLE cirugia_lentes ENABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      ALTER TABLE aseguranza_servicios
        ADD COLUMN IF NOT EXISTS requiere_lio BOOLEAN NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cirugia_lentes`);
    await queryRunner.query(`ALTER TABLE aseguranza_servicios DROP COLUMN IF EXISTS requiere_lio`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_reagenda_de`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_paciente_fecha_ojo`);
    await queryRunner.query(`ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_tiempos_check`);
    await queryRunner.query(`ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_tipo_caso_check`);
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        DROP COLUMN IF EXISTS tiempo_estancia_min,
        DROP COLUMN IF EXISTS tiempo_cx_min,
        DROP COLUMN IF EXISTS procedencia,
        DROP COLUMN IF EXISTS reagenda_de_id,
        DROP COLUMN IF EXISTS tipo_caso`);
  }
}
