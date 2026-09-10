-- 1. Matriz de costos base
CREATE TYPE tipo_consulta_costo AS ENUM ('CONSULTA', 'ESTUDIO', 'REVISION', 'PROCEDIMIENTO');
CREATE TYPE tipo_visita_costo AS ENUM ('PRIMERA_VEZ', 'SUBSECUENTE');

CREATE TABLE matriz_costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_consulta tipo_consulta_costo NOT NULL,
  tipo_visita tipo_visita_costo NOT NULL,
  costo DECIMAL(10,2) NOT NULL DEFAULT 0,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tipo_consulta, tipo_visita)
);

-- 2. Catálogo de estudios
CREATE TABLE catalogo_estudios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  costo DECIMAL(10,2) NOT NULL DEFAULT 0,
  bilateral BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Catálogo de procedimientos
CREATE TABLE catalogo_procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  costo DECIMAL(10,2) NOT NULL DEFAULT 0,
  por_ojo BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Coberturas de aseguranza
CREATE TABLE coberturas_aseguranza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguranza_id UUID NOT NULL REFERENCES aseguranzas(id) ON DELETE CASCADE,
  porcentaje_cobertura DECIMAL(5,2) NOT NULL DEFAULT 100,
  monto_maximo DECIMAL(10,2),
  aplica_estudios BOOLEAN NOT NULL DEFAULT true,
  aplica_procedimientos BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(aseguranza_id)
);

-- 5. Seed: Matriz de costos
INSERT INTO matriz_costos (tipo_consulta, tipo_visita, costo, descripcion) VALUES
('CONSULTA', 'PRIMERA_VEZ', 800, 'Consulta inicial con el paciente'),
('CONSULTA', 'SUBSECUENTE', 500, 'Consulta de seguimiento'),
('ESTUDIO', 'PRIMERA_VEZ', 1500, 'Estudio diagnóstico inicial'),
('ESTUDIO', 'SUBSECUENTE', 1500, 'Estudio diagnóstico subsecuente'),
('PROCEDIMIENTO', 'PRIMERA_VEZ', 0, 'Procedimiento quirúrgico'),
('PROCEDIMIENTO', 'SUBSECUENTE', 0, 'Procedimiento quirúrgico subsecuente'),
('REVISION', 'PRIMERA_VEZ', 0, 'Revisión post-operatoria'),
('REVISION', 'SUBSECUENTE', 0, 'Revisión post-operatoria subsecuente');

-- 6. Seed: Catálogo de estudios
INSERT INTO catalogo_estudios (nombre, costo, bilateral) VALUES
('Tomografía de Coherencia Óptica Macular por ojo', 1200, true),
('Tomografía de Coherencia Óptica de Nervio Óptico por ojo', 1200, true),
('Tomografía de Coherencia Óptica de Segmento Anterior por ojo', 1200, true),
('Campimetría por Ojo', 800, true),
('Ultrasonido B Por Ojo', 600, true),
('Ultrasonido A por Ojo', 500, true),
('Cálculo de Lente Intraocular', 500, true),
('Agudeza Visual Lambda 100 Por Ojo', 300, true),
('Topografía Corneal Por Ojo', 700, true),
('Paquimetría por Ojo', 500, true),
('Fluorangiografía por Ojo', 1500, true),
('Fluorangiografía Por Verde Indocianina por Ojo', 2000, true),
('Electroretinograma', 2500, true),
('Potenciales Visuales Evocados por Ojo', 1500, true),
('Pruebas De Ishihara por Ojo', 300, true),
('Pruebas de sensibilidad al Contraste de Ambos Ojos', 400, false),
('Estudio de Ora (Ocular Response Analizer) Por Ojo', 800, true),
('Estudio de Autoflorescencia Mas Fotografía Retinal', 1200, true),
('Estudio de Fotografía Digital', 500, true),
('Microscopia Especular Por Ojo (Conteo de Células Endoteliales)', 1000, true),
('Tonometría por ojo', 300, true),
('Fotos de Fondo de Ojo por Ojo', 500, true);

-- 7. Seed: Catálogo de procedimientos
INSERT INTO catalogo_procedimientos (nombre, costo, por_ojo) VALUES
('Fotocoagulación por Ojo (En Lámpara De Hendidura)', 2000, true),
('Fotocoagulación con Bloqueo Retrobulbar Por Ojo', 2500, true),
('Panfotocoagulación por Ojo', 3000, true),
('Laser Focal En Macula por Ojo', 2000, true),
('Fotoiridotomía por Ojo', 1500, true),
('Aplicación De Antiangiogénico (No Incluye Antiangiogénico)', 1500, true),
('Aplicación de Medicamento Intravitreo', 2000, true),
('Inyección intravitrea', 2000, true),
('Facoemulsificación de Catarata', 8000, true),
('Facoemulsificación mas Colocación de Lente Intraocular (No Incluye Lente)', 10000, true),
('Facoaspiración por Ojo', 6000, true),
('Vitrectomía Anterior por ojo', 12000, true),
('Vitrectomía Posterior Por Ojo', 15000, true),
('Vitrectomía Posterior Mas Silicón por ojo', 18000, true),
('Vitrectomía Con Endolaser por ojo', 16000, true),
('Vitrectomía Mas Cerclaje Mas Crioablación por ojo', 20000, true),
('Vitrectomía Mas Resección De Membranas Mas Fotocoagulación por ojo', 19000, true),
('Cerclaje (Para Vitrectomía) Por Ojo', 3000, true),
('Cerclaje Escleral Por Ojo', 3000, true),
('Trabeculectomía Por Ojo', 10000, true),
('Trabeculoplastía Selectiva Laser Por Ojo', 4000, true),
('Trabeculoplastía con Laser de Micropulsado Por Ojo', 4000, true),
('Facotrabeculectomía Por Ojo', 12000, true),
('Cross-Linking Corneal', 8000, true),
('Crioterapia por ojo', 3000, true),
('Crioablación Durante Cirugía de Retina Por Ojo', 3000, true),
('Diodo por Ojo', 2000, true),
('IRIDOTOMIA', 1500, true),
('Sondeo de Vía Lagrimal por ojo', 2000, true),
('Transplante de Córnea sin Facoemulsificación', 20000, true),
('Transplante de Córnea con Facoemulsificación', 25000, true),
('Retiro de Lente Intraocular de Cámara Anterior (por ojo)', 5000, true),
('Retiro de Lente Intraocular de Cámara Posterior (por ojo)', 5000, true),
('Implante Secundario de Lente Intraocular (No Incluye Lente)', 8000, true),
('Implante de Anillo de Malyugim por Ojo', 6000, true),
('Limitorrexis con Azul Brillante por ojo', 4000, true),
('Resección/Retiro de Membranas Retinianas durante Cirugía de Retina por ojo', 5000, true),
('Resección en bloque de lesión Papilomatosa (Kunt-Zymanowsy)', 8000, true),
('Retiro de Implante Intraescleral por Ojo', 4000, true),
('Retiro de Silicón por Ojo', 4000, true),
('Retiro De Puntos', 500, false),
('Revisión Bajo Anestesia por Ojo', 3000, true),
('Extracción de Cuerpo Extraño Con Sutura de Herida Escleral', 6000, true),
('Extracción De Cuerpo Extraño Intraocular', 10000, true),
('Exploración Con Toma de Biopsia Mucormicosis', 5000, true),
('Sutura de Dehiscencia de herida Corneal (Por ojo)', 4000, true),
('Toma de Muestra de Secreción de Ulcera Corneal (por ojo)', 1000, true),
('Toma de muestra Biopsia de músculos rectos por ojo', 3000, true),
('Suero Autólogo por Ojo', 2000, true),
('Fototerapia para ojo seco y Disfunción de Glándulas de Meibomio con Luz Pulsada Intensa (IPL) 4 sesiones', 4000, false),
('Capsulotomía', 2000, true);
