-- Servicios predeterminados (consultas, estudios y procedimientos) para TODAS las aseguradoras.
-- Fuente: catalogo de conceptos de la licitacion ISSSTECALI DNPA-LP-23032026-ISSSTECALI-001 BIS
-- (Tijuana partida 95 y Ensenada partida 97, junio 2026). Precio: Tijuana; Ensenada si el concepto
-- solo viene ahi. 163 conceptos.
-- - Los servicios que una aseguradora ya tiene con el mismo nombre toman el precio de la licitacion.
-- - Los que faltan se agregan a cada aseguradora.
-- - Las aseguradoras nuevas reciben el catalogo automaticamente (trigger).
-- Idempotente. Pegar completo en el SQL Editor de Supabase.
BEGIN;

CREATE TABLE IF NOT EXISTS servicios_predeterminados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA')),
  nombre TEXT NOT NULL,
  nombre_norm TEXT NOT NULL UNIQUE,
  costo NUMERIC(10,2) NOT NULL DEFAULT 0,
  fuente TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE servicios_predeterminados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS servicios_predeterminados_read ON servicios_predeterminados;
CREATE POLICY servicios_predeterminados_read ON servicios_predeterminados FOR SELECT TO authenticated USING (true);

INSERT INTO servicios_predeterminados (tipo, nombre, nombre_norm, costo, fuente)
SELECT v.tipo, v.nombre, v.nombre_norm, v.costo, 'Licitacion ISSSTECALI 001 BIS, junio 2026'
FROM (VALUES
  ('CONSULTA', 'Consulta Cornea', 'consulta cornea', 400.00),
  ('CONSULTA', 'Consulta de Estrabismo', 'consulta de estrabismo', 400.00),
  ('CONSULTA', 'Consulta de Glaucoma', 'consulta de glaucoma', 400.00),
  ('CONSULTA', 'Consulta de Oculoplastica', 'consulta de oculoplastica', 400.00),
  ('CONSULTA', 'Consulta de Retina', 'consulta de retina', 440.00),
  ('CONSULTA', U&'Consulta de Uve\00EDtis', 'consulta de uveitis', 320.00),
  ('CONSULTA', 'Consulta En Hospital o Sala de Urgencias', 'consulta en hospital o sala de urgencias', 1100.00),
  ('CONSULTA', 'Consulta Especialista', 'consulta especialista', 450.00),
  ('CONSULTA', U&'Consulta oftalmol\00F3gica Pedi\00E1trica Prematuros en Hospital', 'consulta oftalmologica pediatrica prematuros en hospital', 1050.00),
  ('CONSULTA', 'Consulta Subsecuente', 'consulta subsecuente', 325.00),
  ('CONSULTA', U&'Valoraci\00F3n de Retinolog\00EDa Pedi\00E1trica en Hospital', 'valoracion de retinologia pediatrica en hospital', 1400.00),
  ('ESTUDIO', 'Agudeza Visual Lambda 100 por Ojo', 'agudeza visual lambda 100 por ojo', 60.00),
  ('ESTUDIO', U&'Angiotograf\00EDa de Macula por Tomograf\00EDa de Coherencia \00D3ptica y Fibras Nerviosas', 'angiotografia de macula por tomografia de coherencia optica y fibras nerviosas', 1540.00),
  ('ESTUDIO', 'Auto fluorescencia por ojo', 'auto fluorescencia por ojo', 2050.00),
  ('ESTUDIO', 'Autofluorescencia', 'autofluorescencia', 1100.00),
  ('ESTUDIO', U&'Autofluorescencia Mas Fotograf\00EDa Retinal', 'autofluorescencia mas fotografia retinal', 1500.00),
  ('ESTUDIO', 'Calculo de Lente Intraocular', 'calculo de lente intraocular', 1050.00),
  ('ESTUDIO', U&'C\00E1lculo de Lente Intraocular Por Ojo', 'calculo de lente intraocular por ojo', 1000.00),
  ('ESTUDIO', U&'Campimetr\00EDa Ambos Ojos', 'campimetria ambos ojos', 1540.00),
  ('ESTUDIO', U&'Campimetr\00EDa por ojo', 'campimetria por ojo', 1200.00),
  ('ESTUDIO', 'Electroretinograma', 'electroretinograma', 2500.00),
  ('ESTUDIO', U&'Estudio de Autoflorescencia Mas Fotograf\00EDa Retinal', 'estudio de autoflorescencia mas fotografia retinal', 2100.00),
  ('ESTUDIO', U&'Estudio de Fotograf\00EDa Digital', 'estudio de fotografia digital', 500.00),
  ('ESTUDIO', 'Estudio de Ora (Ocular Response Analizer) Por Ojo', 'estudio de ora (ocular response analizer) por ojo', 1000.00),
  ('ESTUDIO', U&'Examen Estrabol\00F3gico', 'examen estrabologico', 500.00),
  ('ESTUDIO', U&'Flourangiograf\00EDa Por Ojo', 'flourangiografia por ojo', 1300.00),
  ('ESTUDIO', U&'Fluorangiograf\00EDa por Ojo', 'fluorangiografia por ojo', 2800.00),
  ('ESTUDIO', U&'Fluorangiograf\00EDa Por Verde Indocianina Por Ojo', 'fluorangiografia por verde indocianina por ojo', 1000.00),
  ('ESTUDIO', U&'Fotograf\00EDa Retinal', 'fotografia retinal', 400.00),
  ('ESTUDIO', 'Fotos de Fondo de Ojo por Ojo', 'fotos de fondo de ojo por ojo', 300.00),
  ('ESTUDIO', 'Microscopia Especular Por Ojo', 'microscopia especular por ojo', 1080.00),
  ('ESTUDIO', U&'Microscopia Especular Por Ojo (Conteo de C\00E9lulas Endoteliales)', 'microscopia especular por ojo (conteo de celulas endoteliales)', 500.00),
  ('ESTUDIO', U&'Oct de Nervio \00D3ptico por Ojo', 'oct de nervio optico por ojo', 1540.00),
  ('ESTUDIO', 'Oct Macular por Ojo', 'oct macular por ojo', 1540.00),
  ('ESTUDIO', U&'Paquimetr\00EDa Corneal', 'paquimetria corneal', 200.00),
  ('ESTUDIO', U&'Paquimetr\00EDa por Ojo', 'paquimetria por ojo', 200.00),
  ('ESTUDIO', 'Potenciales Visuales Evocados por Ojo', 'potenciales visuales evocados por ojo', 700.00),
  ('ESTUDIO', 'Pruebas de Ishihara por Ojo', 'pruebas de ishihara por ojo', 200.00),
  ('ESTUDIO', 'Pruebas de sensibilidad al Contraste de Ambos Ojos', 'pruebas de sensibilidad al contraste de ambos ojos', 800.00),
  ('ESTUDIO', U&'Tomograf\00EDa de Coherencia \00D3ptica de Nervio \00D3ptico por ojo', 'tomografia de coherencia optica de nervio optico por ojo', 1500.00),
  ('ESTUDIO', U&'Tomograf\00EDa de Coherencia \00D3ptica de Segmento Anterior por ojo', 'tomografia de coherencia optica de segmento anterior por ojo', 1000.00),
  ('ESTUDIO', U&'Tomograf\00EDa de Coherencia \00D3ptica Macular por ojo', 'tomografia de coherencia optica macular por ojo', 1500.00),
  ('ESTUDIO', U&'Tonometr\00EDa', 'tonometria', 350.00),
  ('ESTUDIO', U&'Tonometr\00EDa por ojo', 'tonometria por ojo', 100.00),
  ('ESTUDIO', U&'Topograf\00EDa Corneal Por Ojo', 'topografia corneal por ojo', 300.00),
  ('ESTUDIO', 'Ultrasonido A por Ojo', 'ultrasonido a por ojo', 500.00),
  ('ESTUDIO', 'Ultrasonido B Por Ojo', 'ultrasonido b por ojo', 1500.00),
  ('ESTUDIO', 'Ultrasonido Modo A', 'ultrasonido modo a', 1080.00),
  ('ESTUDIO', 'Ultrasonido Modo B', 'ultrasonido modo b', 1080.00),
  ('PROCEDIMIENTO', 'Anestesia general', 'anestesia general', 3500.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de antiangiog\00E9nico (no incluye antiangiog\00E9nico)', 'aplicacion de antiangiogenico (no incluye antiangiogenico)', 500.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de Fototerapia con Led Rojo Antinflamatorio por ojo', 'aplicacion de fototerapia con led rojo antinflamatorio por ojo', 2500.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de Gas durante Cirug\00EDa por ojo', 'aplicacion de gas durante cirugia por ojo', 5850.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n De Injerto De Amnios', 'aplicacion de injerto de amnios', 14300.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de l\00EDquidos pesados por ojo', 'aplicacion de liquidos pesados por ojo', 4000.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de medicamento intrav\00EDtreo (medicamento proporcionado por instituto y por paciente)', 'aplicacion de medicamento intravitreo (medicamento proporcionado por instituto y por paciente)', 900.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n de Toxina botul\00EDnica en rectos mediales ambos ojos', 'aplicacion de toxina botulinica en rectos mediales ambos ojos', 12000.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n De Triamcinolona (Kenalog) Con Medicamento Por Ojo', 'aplicacion de triamcinolona (kenalog) con medicamento por ojo', 1800.00),
  ('PROCEDIMIENTO', U&'Aplicaci\00F3n Intravitreo Antiog\00E9nico (No Incluye El Antiangiog\00E9nico)', 'aplicacion intravitreo antiogenico (no incluye el antiangiogenico)', 2300.00),
  ('PROCEDIMIENTO', 'Biopsia en ojo', 'biopsia en ojo', 17000.00),
  ('PROCEDIMIENTO', U&'Blefaroplastia de Parpados Superiores con Resecci\00F3n Parcial de Musculo Orbicular', 'blefaroplastia de parpados superiores con reseccion parcial de musculo orbicular', 31000.00),
  ('PROCEDIMIENTO', U&'Capsulotom\00EDa', 'capsulotomia', 2100.00),
  ('PROCEDIMIENTO', U&'Cerclaje (Para Vitrectom\00EDa) Por Ojo', 'cerclaje (para vitrectomia) por ojo', 9480.00),
  ('PROCEDIMIENTO', 'Cerclaje Escleral Por Ojo', 'cerclaje escleral por ojo', 20000.00),
  ('PROCEDIMIENTO', U&'Ciclofotocoagulaci\00F3n Transescleral con diodo (por ojo)', 'ciclofotocoagulacion transescleral con diodo (por ojo)', 23300.00),
  ('PROCEDIMIENTO', U&'Cirug\00EDa de Agujero Macular Y/O Membrana Retiniana por Ojo', 'cirugia de agujero macular y/o membrana retiniana por ojo', 54350.00),
  ('PROCEDIMIENTO', U&'Cirug\00EDa de Correcci\00F3n de Entropion en Ambos Ojos', 'cirugia de correccion de entropion en ambos ojos', 39100.00),
  ('PROCEDIMIENTO', U&'Cirug\00EDa de Estrabismo por Ojo', 'cirugia de estrabismo por ojo', 26580.00),
  ('PROCEDIMIENTO', U&'Cirug\00EDa De Parche Escleral Y Conjuntival Por Ojo', 'cirugia de parche escleral y conjuntival por ojo', 21000.00),
  ('PROCEDIMIENTO', U&'Cirug\00EDa de Retiro de V\00E1lvula Ahmed por Toque Endotelial', 'cirugia de retiro de valvula ahmed por toque endotelial', 17000.00),
  ('PROCEDIMIENTO', U&'Colocaci\00F3n de Membrana Amni\00F3tica por Ojo en Quir\00F3fano', 'colocacion de membrana amniotica por ojo en quirofano', 14000.00),
  ('PROCEDIMIENTO', U&'Colocaci\00F3n de Parche Escleral por ojo, debe incluir tejido', 'colocacion de parche escleral por ojo, debe incluir tejido', 8000.00),
  ('PROCEDIMIENTO', U&'Colocaci\00F3n de Silic\00F3n Intravitrealmente durante Cirug\00EDa por Ojo', 'colocacion de silicon intravitrealmente durante cirugia por ojo', 4750.00),
  ('PROCEDIMIENTO', U&'Colocaci\00F3n de V\00E1lvula de Ahmed con V\00E1lvula por Ojo (incluye v\00E1lvula)', 'colocacion de valvula de ahmed con valvula por ojo (incluye valvula)', 41300.00),
  ('PROCEDIMIENTO', U&'Correcci\00F3n de Estrabismo', 'correccion de estrabismo', 22700.00),
  ('PROCEDIMIENTO', U&'Correcci\00F3n de Estrabismo Bajo Anestesia General Mediante Avanzamiento Dinamico de Recto Medial', 'correccion de estrabismo bajo anestesia general mediante avanzamiento dinamico de recto medial', 28800.00),
  ('PROCEDIMIENTO', U&'Crioablaci\00F3n Durante Cirug\00EDa de Retina Por Ojo', 'crioablacion durante cirugia de retina por ojo', 7500.00),
  ('PROCEDIMIENTO', 'Crioterapia por ojo', 'crioterapia por ojo', 9900.00),
  ('PROCEDIMIENTO', 'Cross-Linking Corneal', 'cross-linking corneal', 15100.00),
  ('PROCEDIMIENTO', 'Diodo por Ojo', 'diodo por ojo', 3100.00),
  ('PROCEDIMIENTO', U&'Evisceraci\00F3n + Pr\00F3tesis Ocular', 'evisceracion + protesis ocular', 45700.00),
  ('PROCEDIMIENTO', U&'Evisceraci\00F3n + Pr\00F3tesis Ocular Hecha a la Medida (No Incluye Pr\00F3tesis)', 'evisceracion + protesis ocular hecha a la medida (no incluye protesis)', 45700.00),
  ('PROCEDIMIENTO', U&'Evisceraci\00F3n + Pr\00F3tesis Ocular Prefabricada (No Incluye Pr\00F3tesis)', 'evisceracion + protesis ocular prefabricada (no incluye protesis)', 27300.00),
  ('PROCEDIMIENTO', U&'Exploraci\00F3n con Toma de Biopsia Mucormicosis', 'exploracion con toma de biopsia mucormicosis', 24800.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n de Cuerpo Extra\00F1o Con Sutura de Herida Escleral', 'extraccion de cuerpo extrano con sutura de herida escleral', 46500.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n de Cuerpo Extra\00F1o Corneal', 'extraccion de cuerpo extrano corneal', 5100.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n de Cuerpo Extra\00F1o Intraocular', 'extraccion de cuerpo extrano intraocular', 46715.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n de Silic\00F3n Intravitreo', 'extraccion de silicon intravitreo', 45000.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n Extracapsular de Catarata', 'extraccion extracapsular de catarata', 27300.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n Implante Lente Intraocular', 'extraccion implante lente intraocular', 18100.00),
  ('PROCEDIMIENTO', U&'Extracci\00F3n Silic\00F3n', 'extraccion silicon', 32200.00),
  ('PROCEDIMIENTO', U&'Facoaspiraci\00F3n por Ojo', 'facoaspiracion por ojo', 16000.00),
  ('PROCEDIMIENTO', U&'Facoemulsificaci\00F3n de Catarata (No Incluye Lio)', 'facoemulsificacion de catarata (no incluye lio)', 27300.00),
  ('PROCEDIMIENTO', U&'Facoemulsificaci\00F3n mas Colocaci\00F3n de Lente Intraocular (No Incluye Lente)', 'facoemulsificacion mas colocacion de lente intraocular (no incluye lente)', 27000.00),
  ('PROCEDIMIENTO', U&'Facotrabeculectom\00EDa Por Ojo', 'facotrabeculectomia por ojo', 27000.00),
  ('PROCEDIMIENTO', U&'Fotocoagulaci\00F3n con Bloqueo Retrobulbar Por Ojo', 'fotocoagulacion con bloqueo retrobulbar por ojo', 3000.00),
  ('PROCEDIMIENTO', U&'Fotocoagulaci\00F3n Por Ojo', 'fotocoagulacion por ojo', 5220.00),
  ('PROCEDIMIENTO', U&'Fotocoagulaci\00F3n por Ojo (En L\00E1mpara De Hendidura)', 'fotocoagulacion por ojo (en lampara de hendidura)', 3000.00),
  ('PROCEDIMIENTO', U&'Fotocoagulaci\00F3n Selectiva de Lesiones o Membranas Por Ojo', 'fotocoagulacion selectiva de lesiones o membranas por ojo', 5220.00),
  ('PROCEDIMIENTO', 'Fotoiridotomia por Ojo', 'fotoiridotomia por ojo', 2300.00),
  ('PROCEDIMIENTO', 'Fototerapia Para Ojo Seco y Disfunsion de Glandulas de Meibomio Con Luz Pulsada Intensa (IPL) 4 Sesiones', 'fototerapia para ojo seco y disfunsion de glandulas de meibomio con luz pulsada intensa (ipl) 4 sesiones', 18000.00),
  ('PROCEDIMIENTO', U&'Goniofotocoagulaci\00F3n Retineana', 'goniofotocoagulacion retineana', 5220.00),
  ('PROCEDIMIENTO', 'Implante de Anillo de Malyugim por Ojo', 'implante de anillo de malyugim por ojo', 14800.00),
  ('PROCEDIMIENTO', U&'Implante De V\00E1lvula de Ahmed', 'implante de valvula de ahmed', 36500.00),
  ('PROCEDIMIENTO', 'Implante Secundario de Lente Intraocular (No Incluye Lente)', 'implante secundario de lente intraocular (no incluye lente)', 6800.00),
  ('PROCEDIMIENTO', 'Implante Secundario de Lente Intraocular Suturado a Sulcus', 'implante secundario de lente intraocular suturado a sulcus', 33500.00),
  ('PROCEDIMIENTO', U&'Inyecci\00F3n de Antibi\00F3tico Intravitreo', 'inyeccion de antibiotico intravitreo', 5220.00),
  ('PROCEDIMIENTO', U&'Inyecci\00F3n de Esteroide Intravitreo (Incluye Esteroide)', 'inyeccion de esteroide intravitreo (incluye esteroide)', 5220.00),
  ('PROCEDIMIENTO', U&'Inyecci\00F3n de Esteroide Paraocular (Incluye Esteroide)', 'inyeccion de esteroide paraocular (incluye esteroide)', 3000.00),
  ('PROCEDIMIENTO', U&'Iridotom\00EDa Yang Laser', 'iridotomia yang laser', 5220.00),
  ('PROCEDIMIENTO', 'Laser Focal En Macula por Ojo', 'laser focal en macula por ojo', 3150.00),
  ('PROCEDIMIENTO', 'Laser Focal Selectivo', 'laser focal selectivo', 5220.00),
  ('PROCEDIMIENTO', 'Laser Macular', 'laser macular', 5220.00),
  ('PROCEDIMIENTO', U&'Lasik (Cirug\00EDa Refractiva Corneal Con Laser)', 'lasik (cirugia refractiva corneal con laser)', 33555.00),
  ('PROCEDIMIENTO', U&'Lavado De C\00E1mara Anterior', 'lavado de camara anterior', 8900.00),
  ('PROCEDIMIENTO', U&'Lavado de C\00E1mara Anterior Con Hiphema', 'lavado de camara anterior con hiphema', 8900.00),
  ('PROCEDIMIENTO', U&'Limitorrexis con Azul Brillante por ojo (incluye todos los costos de cirug\00EDa)', 'limitorrexis con azul brillante por ojo (incluye todos los costos de cirugia)', 54000.00),
  ('PROCEDIMIENTO', U&'Panfotocoagulaci\00F3n', 'panfotocoagulacion', 5220.00),
  ('PROCEDIMIENTO', U&'Panfotocoagulaci\00F3n por Ojo', 'panfotocoagulacion por ojo', 3100.00),
  ('PROCEDIMIENTO', U&'Rehabilitaci\00F3n De Cavidad Anoftalmica (Incluye Implantes)', 'rehabilitacion de cavidad anoftalmica (incluye implantes)', 27500.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n de Prolapso de Grasa y correcci\00F3n de ptosis aponeur\00F3tica ambos ojos', 'reseccion de prolapso de grasa y correccion de ptosis aponeurotica ambos ojos', 36500.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n de Pterigi\00F3n + Mitomicina', 'reseccion de pterigion + mitomicina', 9200.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n de Pterigi\00F3n + Mitomicina + Amnios', 'reseccion de pterigion + mitomicina + amnios', 16260.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n de Pterigion Mas Injerto de Mucosa Conjuntival Mas Aplicaci\00F3n de Mitocina Bajo Anestesia por Ojo', 'reseccion de pterigion mas injerto de mucosa conjuntival mas aplicacion de mitocina bajo anestesia por ojo', 24980.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n en Bloque de Lesi\00F3n Papilomatosa (Kunt-Zymanowsy)', 'reseccion en bloque de lesion papilomatosa (kunt-zymanowsy)', 20500.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n en Bloque de Lesi\00F3n Papilomatosa (Kunt-Zymanowsy) y Biopsia en Ojo', 'reseccion en bloque de lesion papilomatosa (kunt-zymanowsy) y biopsia en ojo', 33500.00),
  ('PROCEDIMIENTO', U&'Resecci\00F3n/Retiro de Membranas Retinianas durante Cirug\00EDa de Retina por ojo', 'reseccion/retiro de membranas retinianas durante cirugia de retina por ojo', 5200.00),
  ('PROCEDIMIENTO', 'Retinopexia Pneumatica', 'retinopexia pneumatica', 6140.00),
  ('PROCEDIMIENTO', 'Retiro de Implante Intraescleral por Ojo', 'retiro de implante intraescleral por ojo', 17300.00),
  ('PROCEDIMIENTO', U&'Retiro de Lente Intraocular de C\00E1mara Anterior (por ojo)', 'retiro de lente intraocular de camara anterior (por ojo)', 5300.00),
  ('PROCEDIMIENTO', U&'Retiro de Lente Intraocular de C\00E1mara Posterior (por ojo)', 'retiro de lente intraocular de camara posterior (por ojo)', 7500.00),
  ('PROCEDIMIENTO', 'Retiro de Puntos', 'retiro de puntos', 500.00),
  ('PROCEDIMIENTO', U&'Retiro de Silic\00F3n por Ojo', 'retiro de silicon por ojo', 26100.00),
  ('PROCEDIMIENTO', U&'Revisi\00F3n Bajo Anestesia por Ojo', 'revision bajo anestesia por ojo', 4100.00),
  ('PROCEDIMIENTO', U&'Sondeo de V\00EDa Lagrimal por ojo', 'sondeo de via lagrimal por ojo', 14500.00),
  ('PROCEDIMIENTO', U&'Suero Ant\00F3logo por Ojo', 'suero antologo por ojo', 800.00),
  ('PROCEDIMIENTO', 'Sutura de Dehiscencia de herida Corneal (Por ojo)', 'sutura de dehiscencia de herida corneal (por ojo)', 23000.00),
  ('PROCEDIMIENTO', U&'Toma de muestra Biopsia de m\00FAsculos rectos por ojo', 'toma de muestra biopsia de musculos rectos por ojo', 27000.00),
  ('PROCEDIMIENTO', U&'Toma de Muestra de Secreci\00F3n de Ulcera Corneal (por ojo)', 'toma de muestra de secrecion de ulcera corneal (por ojo)', 1000.00),
  ('PROCEDIMIENTO', U&'Trabeculectom\00EDa Por Ojo', 'trabeculectomia por ojo', 7000.00),
  ('PROCEDIMIENTO', U&'Trabeculoplast\00EDa Selectiva Laser Por Ojo', 'trabeculoplastia selectiva laser por ojo', 1600.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + Endolaser', 'vitrectomia + endolaser', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + Facoemulsificaci\00F3n', 'vitrectomia + facoemulsificacion', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + Gas (C3f8)', 'vitrectomia + gas (c3f8)', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + L\00EDquidos Pesados', 'vitrectomia + liquidos pesados', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + L\00EDquidos Pesados + Silic\00F3n', 'vitrectomia + liquidos pesados + silicon', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + Resecci\00F3n De Membrana + Fotocoagulaci\00F3n', 'vitrectomia + reseccion de membrana + fotocoagulacion', 42320.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa + Silic\00F3n', 'vitrectomia + silicon', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Anterior', 'vitrectomia anterior', 18400.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Anterior + Retiro De Lio', 'vitrectomia anterior + retiro de lio', 18400.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Anterior por ojo', 'vitrectomia anterior por ojo', 5800.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Con Endolaser por ojo', 'vitrectomia con endolaser por ojo', 45500.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Con Resecci\00F3n De Membrana Epirretiniana', 'vitrectomia con reseccion de membrana epirretiniana', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Mas Cerclaje m\00E1s Crioablaci\00F3n por ojo', 'vitrectomia mas cerclaje mas crioablacion por ojo', 45500.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Mas Cirug\00EDa Macular con Azul Brillante', 'vitrectomia mas cirugia macular con azul brillante', 46000.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Mas Resecci\00F3n De Membranas Mas Fotocoagulaci\00F3n por ojo', 'vitrectomia mas reseccion de membranas mas fotocoagulacion por ojo', 45400.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Para Retiro De Silic\00F3n', 'vitrectomia para retiro de silicon', 42020.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Posterior', 'vitrectomia posterior', 36800.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Posterior Mas Panfotocoagulaci\00F3n Retinal con Laser por ojo', 'vitrectomia posterior mas panfotocoagulacion retinal con laser por ojo', 42320.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Posterior Mas Silic\00F3n por ojo', 'vitrectomia posterior mas silicon por ojo', 43300.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Posterior Por Ojo', 'vitrectomia posterior por ojo', 23800.00),
  ('PROCEDIMIENTO', U&'Vitrectom\00EDa Simple', 'vitrectomia simple', 36800.00),
  ('PROCEDIMIENTO', 'Yag Laser Por Ojo', 'yag laser por ojo', 2000.00)
) AS v(tipo, nombre, nombre_norm, costo)
ON CONFLICT (nombre_norm) DO UPDATE
  SET tipo = EXCLUDED.tipo, nombre = EXCLUDED.nombre, costo = EXCLUDED.costo, fuente = EXCLUDED.fuente, updated_at = now();

-- 1) Servicios existentes con el mismo nombre (en cualquier tipo): toman el precio.
UPDATE aseguranza_servicios s
   SET costo = p.costo, updated_at = now()
  FROM servicios_predeterminados p
 WHERE s.nombre_norm = p.nombre_norm
   AND s.costo IS DISTINCT FROM p.costo;

-- 2) Los que faltan, en todas las aseguradoras.
INSERT INTO aseguranza_servicios (aseguranza_id, tipo, nombre, nombre_norm, costo)
SELECT a.id, p.tipo, p.nombre, p.nombre_norm, p.costo
  FROM aseguranzas a
 CROSS JOIN servicios_predeterminados p
 WHERE NOT EXISTS (
   SELECT 1 FROM aseguranza_servicios s WHERE s.aseguranza_id = a.id AND s.nombre_norm = p.nombre_norm
 );

-- 3) Aseguradoras nuevas: copian el catalogo predeterminado al crearse.
CREATE OR REPLACE FUNCTION copiar_servicios_predeterminados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO aseguranza_servicios (aseguranza_id, tipo, nombre, nombre_norm, costo)
  SELECT NEW.id, p.tipo, p.nombre, p.nombre_norm, p.costo
    FROM servicios_predeterminados p
  ON CONFLICT (aseguranza_id, tipo, nombre_norm) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_aseguranzas_servicios_predeterminados ON aseguranzas;
CREATE TRIGGER trg_aseguranzas_servicios_predeterminados
  AFTER INSERT ON aseguranzas
  FOR EACH ROW EXECUTE FUNCTION copiar_servicios_predeterminados();

COMMIT;

-- Verificacion: servicios del catalogo por aseguradora (debe ser 163 en cada una)
SELECT a.nombre AS aseguradora, count(s.id) AS servicios_del_catalogo
  FROM aseguranzas a
  LEFT JOIN aseguranza_servicios s
    ON s.aseguranza_id = a.id AND s.nombre_norm IN (SELECT nombre_norm FROM servicios_predeterminados)
 GROUP BY a.nombre ORDER BY a.nombre;
