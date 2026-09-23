import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCirugiaHomologadaTables1800000000170 implements MigrationInterface {
  name = 'CreateCirugiaHomologadaTables1800000000170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1. Extender el enum de estados de cirugía con 'reagendada' (EST-001)
    // -----------------------------------------------------------------
    // ALTER TYPE ... ADD VALUE no es transaccional; reemplazamos el tipo
    // de forma atómica dentro de la transacción del runner.
    await queryRunner.query(`
      CREATE TYPE agenda_cirugia_estado_new AS ENUM (
        'agendada', 'aplazada', 'reagendada', 'completada', 'cancelada'
      );
    `);

    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE agenda_cirugia_estado_new
          USING estado::text::agenda_cirugia_estado_new,
        ALTER COLUMN estado SET DEFAULT 'agendada';
    `);

    await queryRunner.query(`DROP TYPE agenda_cirugia_estado;`);
    await queryRunner.query(`ALTER TYPE agenda_cirugia_estado_new RENAME TO agenda_cirugia_estado;`);

    // -----------------------------------------------------------------
    // 2. Catálogo de ojos (OJO-001)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cat_ojos (
        codigo TEXT PRIMARY KEY CHECK (codigo IN ('OD', 'OI', 'OU')),
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        activo BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await queryRunner.query(`
      INSERT INTO cat_ojos (codigo, nombre, orden) VALUES
        ('OD', 'Ojo derecho', 1),
        ('OI', 'Ojo izquierdo', 2),
        ('OU', 'Ambos ojos', 3)
      ON CONFLICT (codigo) DO NOTHING;
    `);

    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD CONSTRAINT chk_agenda_cirugias_ojo
        CHECK (ojo IS NULL OR ojo IN ('OD', 'OI', 'OU')) NOT VALID;
    `);
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias VALIDATE CONSTRAINT chk_agenda_cirugias_ojo;
    `);

    // -----------------------------------------------------------------
    // 3. Catálogo de roles de participante (MED-003)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cat_roles_participante (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clave TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        orden INTEGER NOT NULL DEFAULT 0,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO cat_roles_participante (clave, nombre, descripcion, orden) VALUES
        ('cirujano', 'Cirujano', 'Cirujano principal de la cirugía', 1),
        ('ayudante', 'Ayudante', 'Ayudante quirúrgico', 2),
        ('anestesiologo', 'Anestesiólogo', 'Responsable de anestesia', 3),
        ('instrumentista', 'Instrumentista', 'Manejo de instrumentos', 4),
        ('circulante', 'Circulante', 'Enfermería circulante', 5)
      ON CONFLICT (clave) DO NOTHING;
    `);

    // -----------------------------------------------------------------
    // 4. Catálogo de recursos / quirófanos (AGE-002)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cat_recursos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('QUIROFANO', 'SALA', 'EQUIPO')),
        ubicacion TEXT,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO cat_recursos (nombre, tipo, ubicacion) VALUES
        ('Quirófano 1', 'QUIROFANO', 'Planta baja'),
        ('Quirófano 2', 'QUIROFANO', 'Planta baja')
      ON CONFLICT DO NOTHING;
    `);

    // -----------------------------------------------------------------
    // 5. Extender agenda_cirugias como tabla de cirugías homologadas
    //    (ORI-001, CAT-003, DAT-001, DET-001, CON-001, LIO-002)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD COLUMN IF NOT EXISTS origen_id UUID REFERENCES aseguranzas(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES aseguranza_servicios(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS duracion_min INTEGER,
        ADD COLUMN IF NOT EXISTS recurso_id UUID REFERENCES cat_recursos(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_origen_id ON agenda_cirugias(origen_id);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_servicio_id ON agenda_cirugias(servicio_id);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_codigo ON agenda_cirugias(codigo);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_recurso_id ON agenda_cirugias(recurso_id);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_created_by ON agenda_cirugias(created_by);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_doctor_fecha_hora
        ON agenda_cirugias(doctor_id, fecha, hora);
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_recurso_fecha_hora
        ON agenda_cirugias(recurso_id, fecha, hora);
    `);

    // -----------------------------------------------------------------
    // 6. Participantes de cirugía (MED-002, MED-003)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cirugia_participantes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        medico_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        rol_id UUID NOT NULL REFERENCES cat_roles_participante(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (cirugia_id, medico_id, rol_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_cirugia_participantes_cirugia_id ON cirugia_participantes(cirugia_id);
      CREATE INDEX idx_cirugia_participantes_medico_id ON cirugia_participantes(medico_id);
      CREATE INDEX idx_cirugia_participantes_rol_id ON cirugia_participantes(rol_id);
    `);

    // -----------------------------------------------------------------
    // 7. Productividad base por participante (PRD-001, PRD-003)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cirugia_productividad (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        participante_id UUID NOT NULL REFERENCES cirugia_participantes(id) ON DELETE CASCADE,
        origen_id UUID REFERENCES aseguranzas(id) ON DELETE SET NULL,
        servicio_id UUID REFERENCES aseguranza_servicios(id) ON DELETE SET NULL,
        rol_id UUID REFERENCES cat_roles_participante(id) ON DELETE RESTRICT,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE', 'CALCULADO', 'PAGADO', 'ANULADO')),
        monto NUMERIC(10,2),
        regla_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_cirugia_productividad_cirugia_id ON cirugia_productividad(cirugia_id);
      CREATE INDEX idx_cirugia_productividad_participante_id ON cirugia_productividad(participante_id);
      CREATE INDEX idx_cirugia_productividad_estado ON cirugia_productividad(estado);
    `);

    // -----------------------------------------------------------------
    // 8. Archivos de apoyo con borrado lógico (ARC-004, AUD-003)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cirugia_archivos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        nombre_original TEXT NOT NULL,
        nombre_storage TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size BIGINT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE,
        tipo_documento TEXT,
        uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_cirugia_archivos_cirugia_id ON cirugia_archivos(cirugia_id);
      CREATE INDEX idx_cirugia_archivos_cirugia_deleted ON cirugia_archivos(cirugia_id, deleted_at);
      CREATE INDEX idx_cirugia_archivos_uploaded_by ON cirugia_archivos(uploaded_by);
    `);

    // -----------------------------------------------------------------
    // 9. Historial de cirugía (AUD-004, AUD-005, EST-003)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE cirugia_historial (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        accion TEXT NOT NULL CHECK (accion IN (
          'CIRUGIA_CREADA', 'LIO_ASIGNADO', 'PARTICIPANTE_ASIGNADO',
          'ARCHIVO_AGREGADO', 'ARCHIVO_ELIMINADO', 'ESTADO_CAMBIADO'
        )),
        detalle JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_cirugia_historial_cirugia_id ON cirugia_historial(cirugia_id, created_at DESC);
    `);

    // -----------------------------------------------------------------
    // 10. RLS para catálogos y tablas de cirugía
    // -----------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE cat_ojos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cat_ojos_select_authenticated ON cat_ojos FOR SELECT TO authenticated USING (true);
      CREATE POLICY cat_ojos_admin_write ON cat_ojos FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

      ALTER TABLE cat_roles_participante ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cat_roles_select_authenticated ON cat_roles_participante FOR SELECT TO authenticated USING (true);
      CREATE POLICY cat_roles_admin_write ON cat_roles_participante FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

      ALTER TABLE cat_recursos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cat_recursos_select_authenticated ON cat_recursos FOR SELECT TO authenticated USING (true);
      CREATE POLICY cat_recursos_admin_write ON cat_recursos FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
    `);

    await queryRunner.query(`
      ALTER TABLE cirugia_participantes ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cirugia_participantes_admin_all ON cirugia_participantes FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
      CREATE POLICY cirugia_participantes_recepcionista_all ON cirugia_participantes FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
      CREATE POLICY cirugia_participantes_doctor_own ON cirugia_participantes FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM agenda_cirugias ac
          JOIN doctores d ON d.id = ac.doctor_id
          WHERE ac.id = cirugia_participantes.cirugia_id AND d.usuario_id = auth.uid()
        ));

      ALTER TABLE cirugia_productividad ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cirugia_productividad_admin_all ON cirugia_productividad FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
      CREATE POLICY cirugia_productividad_recepcionista_all ON cirugia_productividad FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
      CREATE POLICY cirugia_productividad_doctor_own ON cirugia_productividad FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM agenda_cirugias ac
          JOIN doctores d ON d.id = ac.doctor_id
          WHERE ac.id = cirugia_productividad.cirugia_id AND d.usuario_id = auth.uid()
        ));

      ALTER TABLE cirugia_archivos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cirugia_archivos_admin_all ON cirugia_archivos FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
      CREATE POLICY cirugia_archivos_recepcionista_all ON cirugia_archivos FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
      CREATE POLICY cirugia_archivos_doctor_own ON cirugia_archivos FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM agenda_cirugias ac
          JOIN doctores d ON d.id = ac.doctor_id
          WHERE ac.id = cirugia_archivos.cirugia_id AND d.usuario_id = auth.uid()
        ));

      ALTER TABLE cirugia_historial ENABLE ROW LEVEL SECURITY;
      CREATE POLICY cirugia_historial_admin_all ON cirugia_historial FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
      CREATE POLICY cirugia_historial_recepcionista_all ON cirugia_historial FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
      CREATE POLICY cirugia_historial_doctor_own ON cirugia_historial FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM agenda_cirugias ac
          JOIN doctores d ON d.id = ac.doctor_id
          WHERE ac.id = cirugia_historial.cirugia_id AND d.usuario_id = auth.uid()
        ));
    `);

    // -----------------------------------------------------------------
    // 11. Storage privado para archivos de cirugía (STO-001, STO-002)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('cirugias', 'cirugias', false)
      ON CONFLICT (id) DO NOTHING;
    `);

    await queryRunner.query(`
      CREATE POLICY cirugias_storage_select_authenticated ON storage.objects
        FOR SELECT TO authenticated USING (bucket_id = 'cirugias');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Storage
    await queryRunner.query(`
      DROP POLICY IF EXISTS cirugias_storage_select_authenticated ON storage.objects;
    `);
    await queryRunner.query(`
      DELETE FROM storage.objects WHERE bucket_id = 'cirugias';
      DELETE FROM storage.buckets WHERE id = 'cirugias';
    `);

    // RLS / tablas de cirugía
    await queryRunner.query(`
      DROP POLICY IF EXISTS cirugia_historial_doctor_own ON cirugia_historial;
      DROP POLICY IF EXISTS cirugia_historial_recepcionista_all ON cirugia_historial;
      DROP POLICY IF EXISTS cirugia_historial_admin_all ON cirugia_historial;
      DROP TABLE IF EXISTS cirugia_historial;

      DROP POLICY IF EXISTS cirugia_archivos_doctor_own ON cirugia_archivos;
      DROP POLICY IF EXISTS cirugia_archivos_recepcionista_all ON cirugia_archivos;
      DROP POLICY IF EXISTS cirugia_archivos_admin_all ON cirugia_archivos;
      DROP TABLE IF EXISTS cirugia_archivos;

      DROP POLICY IF EXISTS cirugia_productividad_doctor_own ON cirugia_productividad;
      DROP POLICY IF EXISTS cirugia_productividad_recepcionista_all ON cirugia_productividad;
      DROP POLICY IF EXISTS cirugia_productividad_admin_all ON cirugia_productividad;
      DROP TABLE IF EXISTS cirugia_productividad;

      DROP POLICY IF EXISTS cirugia_participantes_doctor_own ON cirugia_participantes;
      DROP POLICY IF EXISTS cirugia_participantes_recepcionista_all ON cirugia_participantes;
      DROP POLICY IF EXISTS cirugia_participantes_admin_all ON cirugia_participantes;
      DROP TABLE IF EXISTS cirugia_participantes;
    `);

    // Columnas extendidas de agenda_cirugias
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agenda_cirugias_recurso_fecha_hora;
      DROP INDEX IF EXISTS idx_agenda_cirugias_doctor_fecha_hora;
      DROP INDEX IF EXISTS idx_agenda_cirugias_created_by;
      DROP INDEX IF EXISTS idx_agenda_cirugias_recurso_id;
      DROP INDEX IF EXISTS idx_agenda_cirugias_codigo;
      DROP INDEX IF EXISTS idx_agenda_cirugias_servicio_id;
      DROP INDEX IF EXISTS idx_agenda_cirugias_origen_id;
      ALTER TABLE agenda_cirugias
        DROP CONSTRAINT IF EXISTS chk_agenda_cirugias_ojo,
        DROP COLUMN IF EXISTS origen_id,
        DROP COLUMN IF EXISTS servicio_id,
        DROP COLUMN IF EXISTS codigo,
        DROP COLUMN IF EXISTS duracion_min,
        DROP COLUMN IF EXISTS recurso_id,
        DROP COLUMN IF EXISTS created_by;
    `);

    // Catálogos
    await queryRunner.query(`
      DROP POLICY IF EXISTS cat_recursos_admin_write ON cat_recursos;
      DROP POLICY IF EXISTS cat_recursos_select_authenticated ON cat_recursos;
      DROP TABLE IF EXISTS cat_recursos;

      DROP POLICY IF EXISTS cat_roles_admin_write ON cat_roles_participante;
      DROP POLICY IF EXISTS cat_roles_select_authenticated ON cat_roles_participante;
      DROP TABLE IF EXISTS cat_roles_participante;

      DROP POLICY IF EXISTS cat_ojos_admin_write ON cat_ojos;
      DROP POLICY IF EXISTS cat_ojos_select_authenticated ON cat_ojos;
      DROP TABLE IF EXISTS cat_ojos;
    `);

    // Restaurar enum original (best effort; fallará si hay valores 'reagendada')
    await queryRunner.query(`
      CREATE TYPE agenda_cirugia_estado_old AS ENUM (
        'agendada', 'aplazada', 'completada', 'cancelada'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE agenda_cirugia_estado_old
          USING estado::text::agenda_cirugia_estado_old,
        ALTER COLUMN estado SET DEFAULT 'agendada';
    `);
    await queryRunner.query(`DROP TYPE agenda_cirugia_estado;`);
    await queryRunner.query(`ALTER TYPE agenda_cirugia_estado_old RENAME TO agenda_cirugia_estado;`);
  }
}
