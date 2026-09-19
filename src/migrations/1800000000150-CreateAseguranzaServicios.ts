import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAseguranzaServicios1800000000150 implements MigrationInterface {
  name = 'CreateAseguranzaServicios1800000000150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS aseguranza_servicios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aseguranza_id UUID NOT NULL REFERENCES aseguranzas(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL CHECK (tipo IN ('ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA')),
        nombre TEXT NOT NULL,
        nombre_norm TEXT NOT NULL,
        costo NUMERIC(10,2) DEFAULT 0,
        porcentaje_cobertura NUMERIC(5,2) DEFAULT 0 CHECK (porcentaje_cobertura >= 0 AND porcentaje_cobertura <= 100),
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(aseguranza_id, tipo, nombre_norm)
      );
    `);

    // 2. RLS
    await queryRunner.query(`ALTER TABLE aseguranza_servicios ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY "aseguranza_servicios_read" ON aseguranza_servicios
        FOR SELECT TO authenticated USING (true);
    `);
    await queryRunner.query(`
      CREATE POLICY "aseguranza_servicios_admin_write" ON aseguranza_servicios
        FOR ALL TO authenticated
        USING (
          EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin')
        );
    `);

    // 3. Index
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_asv_aseguranza ON aseguranza_servicios(aseguranza_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_asv_nombre_norm ON aseguranza_servicios(nombre_norm);`);

    // 4. Seed catalog with ISSSTECALI as default aseguradora
    const issstecali = await queryRunner.query(`SELECT id FROM aseguranzas WHERE LOWER(nombre) = 'issstecali' LIMIT 1`);
    if (issstecali.length === 0) return;
    const aid = issstecali[0].id;

    const servicios: Array<[string, string, string]> = [
      ['ESTUDIO', 'Campimetría por Ojo', 'campimetria por ojo'],
      ['ESTUDIO', 'Electroretinograma', 'electroretinograma'],
      ['ESTUDIO', 'Estudio de Autoflorescencia Mas Fotografía Retinal', 'estudio de autoflorescencia mas fotografia retinal'],
      ['ESTUDIO', 'Estudio de Fotografía Digital', 'estudio de fotografia digital'],
      ['ESTUDIO', 'Estudio de Ora (Ocular Response Analizer) Por Ojo', 'estudio de ora ocular response analizer por ojo'],
      ['ESTUDIO', 'Fluorangiografía por Ojo', 'fluorangiografia por ojo'],
      ['ESTUDIO', 'Fluorangiografía Por Verde Indocianina Por Ojo', 'fluorangiografia por verde indocianina por ojo'],
      ['ESTUDIO', 'Fotos de Fondo de Ojo por Ojo', 'fotos de fondo de ojo por ojo'],
      ['ESTUDIO', 'Microscopía Especular Por Ojo', 'microscopia especular por ojo'],
      ['ESTUDIO', 'Paquimetría por Ojo', 'paquimetria por ojo'],
      ['ESTUDIO', 'Potenciales Visuales Evocados por Ojo', 'potenciales visuales evocados por ojo'],
      ['ESTUDIO', 'Pruebas de sensibilidad al Contraste de Ambos Ojos', 'pruebas de sensibilidad al contraste de ambos ojos'],
      ['ESTUDIO', 'Pruebas De Ishihara por Ojo', 'pruebas de ishihara por ojo'],
      ['ESTUDIO', 'Tomografía de Coherencia Óptica de Nervio Óptico por ojo', 'tomografia de coherencia optica de nervio optico por ojo'],
      ['ESTUDIO', 'Tomografía de Coherencia Óptica de Segmento Anterior por ojo', 'tomografia de coherencia optica de segmento anterior por ojo'],
      ['ESTUDIO', 'Tomografía de Coherencia Óptica Macular por ojo', 'tomografia de coherencia optica macular por ojo'],
      ['ESTUDIO', 'Tonometría por ojo', 'tonometria por ojo'],
      ['ESTUDIO', 'Topografía Corneal Por Ojo', 'topografia corneal por ojo'],
      ['ESTUDIO', 'Ultrasonido A por Ojo', 'ultrasonido a por ojo'],
      ['ESTUDIO', 'Ultrasonido B Por Ojo', 'ultrasonido b por ojo'],
      ['ESTUDIO', 'Agudeza Visual Lambda 100 Por Ojo', 'agudeza visual lambda 100 por ojo'],
      ['ESTUDIO', 'Cálculo de Lente Intraocular', 'calculo de lente intraocular'],
      ['PROCEDIMIENTO', 'Aplicación de Gas durante Cirugía por ojo', 'aplicacion de gas durante cirugia por ojo'],
      ['PROCEDIMIENTO', 'Cerclaje (Para Vitrectomía) Por Ojo', 'cerclaje para vitrectomia por ojo'],
      ['PROCEDIMIENTO', 'Cerclaje Escleral Por Ojo', 'cerclaje escleral por ojo'],
      ['PROCEDIMIENTO', 'Colocación de Silicón Intravitrealmente durante Cirugía Por Ojo', 'colocacion de silicon intravitrealmente durante cirugia por ojo'],
      ['PROCEDIMIENTO', 'Colocación de Válvula de Ahmed con Válvula Por Ojo (incluye válvula)', 'colocacion de valvula de ahmed con valvula por ojo incluye valvula'],
      ['PROCEDIMIENTO', 'Crioablación Durante Cirugía de Retina Por Ojo', 'crioablacion durante cirugia de retina por ojo'],
      ['PROCEDIMIENTO', 'Crioterapia por ojo', 'crioterapia por ojo'],
      ['PROCEDIMIENTO', 'Cross-Linking Corneal', 'cross-linking corneal'],
      ['PROCEDIMIENTO', 'Diodo por Ojo', 'diodo por ojo'],
      ['PROCEDIMIENTO', 'Exploración Con Toma de Biopsia Mucormicosis', 'exploracion con toma de biopsia mucormicosis'],
      ['PROCEDIMIENTO', 'Extracción de Cuerpo Extraño Con Sutura de Herida Escleral', 'extraccion de cuerpo extrano con sutura de herida escleral'],
      ['PROCEDIMIENTO', 'Extracción De Cuerpo Extraño Intraocular', 'extraccion de cuerpo extrano intraocular'],
      ['PROCEDIMIENTO', 'Facoaspiración por Ojo', 'facoaspiracion por ojo'],
      ['PROCEDIMIENTO', 'Facoemulsificación de Catarata', 'facoemulsificacion de catarata'],
      ['PROCEDIMIENTO', 'Facoemulsificación mas Colocación de Lente Intraocular (No Incluye Lente)', 'facoemulsificacion mas colocacion de lente intraocular no incluye lente'],
      ['PROCEDIMIENTO', 'Facotrabeculectomía Por Ojo', 'facotrabeculectomia por ojo'],
      ['PROCEDIMIENTO', 'Fotocoagulación con Bloqueo Retrobulbar Por Ojo', 'fotocoagulacion con bloqueo retrobulbar por ojo'],
      ['PROCEDIMIENTO', 'Fotocoagulación por Ojo (En Lámpara De Hendidura)', 'fotocoagulacion por ojo en lampara de hendidura'],
      ['PROCEDIMIENTO', 'Fotoiridotomía por Ojo', 'fotoiridotomia por ojo'],
      ['PROCEDIMIENTO', 'Implante de Anillo de Malyugin por Ojo', 'implante de anillo de malyugin por ojo'],
      ['PROCEDIMIENTO', 'Implante Secundario de Lente Intraocular (No Incluye Lente)', 'implante secundario de lente intraocular no incluye lente'],
      ['PROCEDIMIENTO', 'Inyección intravítrea', 'inyeccion intravitrea'],
      ['PROCEDIMIENTO', 'Laser Focal En Macula por Ojo', 'laser focal en macula por ojo'],
      ['PROCEDIMIENTO', 'Limitorrexis con Azul Brillante por ojo (incluye todos los costos de cirugía)', 'limitorrexis con azul brillante por ojo incluye todos los costos de cirugia'],
      ['PROCEDIMIENTO', 'Panfotocoagulación por Ojo', 'panfotocoagulacion por ojo'],
      ['PROCEDIMIENTO', 'Resección/Retiro de Membranas Retinianas durante Cirugía de Retina por ojo', 'reseccion retiro de membranas retinianas durante cirugia de retina por ojo'],
      ['PROCEDIMIENTO', 'Resección en bloque de lesión Papilomatosa (Kunt-Zymanowsky)', 'reseccion en bloque de lesion papilomatosa kunt-zymanowsky'],
      ['PROCEDIMIENTO', 'Retiro de Implante Intraescleral por Ojo', 'retiro de implante intraescleral por ojo'],
      ['PROCEDIMIENTO', 'Retiro de Lente Intraocular de Cámara Anterior (por ojo)', 'retiro de lente intraocular de camara anterior por ojo'],
      ['PROCEDIMIENTO', 'Retiro de Lente Intraocular de Cámara Posterior (por ojo)', 'retiro de lente intraocular de camara posterior por ojo'],
      ['PROCEDIMIENTO', 'Retiro De Puntos', 'retiro de puntos'],
      ['PROCEDIMIENTO', 'Retiro de Silicón por Ojo', 'retiro de silicon por ojo'],
      ['PROCEDIMIENTO', 'Revisión Bajo Anestesia por Ojo', 'revision bajo anestesia por ojo'],
      ['PROCEDIMIENTO', 'Sondeo de Vía Lagrimal por ojo', 'sondeo de via lagrimal por ojo'],
      ['PROCEDIMIENTO', 'Suero Autólogo por Ojo', 'suero autologo por ojo'],
      ['PROCEDIMIENTO', 'Sutura de Dehiscencia de herida Corneal (Por ojo)', 'sutura de dehiscencia de herida corneal por ojo'],
      ['PROCEDIMIENTO', 'Toma de Muestra de Secreción de Úlcera Corneal (por ojo)', 'toma de muestra de secrecion de ulcera corneal por ojo'],
      ['PROCEDIMIENTO', 'Toma de muestra Biopsia de músculos rectos por ojo', 'toma de muestra biopsia de musculos rectos por ojo'],
      ['PROCEDIMIENTO', 'Trabeculectomía Por Ojo', 'trabeculectomia por ojo'],
      ['PROCEDIMIENTO', 'Trabeculoplastía con Laser de Micropulsado Por Ojo', 'trabeculoplastia con laser de micropulsado por ojo'],
      ['PROCEDIMIENTO', 'Trabeculoplastía Selectiva Laser Por Ojo', 'trabeculoplastia selectiva laser por ojo'],
      ['PROCEDIMIENTO', 'Transplante de Córnea con Facoemulsificación', 'transplante de cornea con facoemulsificacion'],
      ['PROCEDIMIENTO', 'Transplante de Córnea sin Facoemulsificación', 'transplante de cornea sin facoemulsificacion'],
      ['PROCEDIMIENTO', 'Vitrectomía Anterior por ojo', 'vitrectomia anterior por ojo'],
      ['PROCEDIMIENTO', 'Vitrectomía Con Endolaser por ojo', 'vitrectomia con endolaser por ojo'],
      ['PROCEDIMIENTO', 'Vitrectomía Mas Cerclaje Mas Crioablación por ojo', 'vitrectomia mas cerclaje mas crioablacion por ojo'],
      ['PROCEDIMIENTO', 'Vitrectomía Mas Resección De Membranas Mas Fotocoagulación por ojo', 'vitrectomia mas reseccion de membranas mas fotocoagulacion por ojo'],
      ['PROCEDIMIENTO', 'Vitrectomía Posterior Mas Silicón por ojo', 'vitrectomia posterior mas silicon por ojo'],
      ['PROCEDIMIENTO', 'Vitrectomía Posterior Por Ojo', 'vitrectomia posterior por ojo'],
      ['PROCEDIMIENTO', 'IRIDOTOMIA', 'iridotomia'],
      ['PROCEDIMIENTO', 'Aplicación de Antiangiogénico (No Incluye Antiangiogénico)', 'aplicacion de antiangiogenico no incluye antiangiogenico'],
      ['PROCEDIMIENTO', 'Aplicación de Medicamento Intravitreo (medicamento proporcionado por el instituto y por el paciente)', 'aplicacion de medicamento intravitreo'],
    ];

    for (const [tipo, nombre, nombreNorm] of servicios) {
      await queryRunner.query(
        `INSERT INTO aseguranza_servicios (aseguranza_id, tipo, nombre, nombre_norm, costo, porcentaje_cobertura)
         SELECT $1, $2, $3, $4, 0, 0
         WHERE NOT EXISTS (SELECT 1 FROM aseguranza_servicios WHERE aseguranza_id = $1 AND tipo = $2 AND nombre_norm = $4)`,
        [aid, tipo, nombre, nombreNorm]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS aseguranza_servicios;`);
  }
}
