const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();
  
  // Clear existing
  await c.query('DELETE FROM aseguranza_servicios');
  
  const aid = await c.query("SELECT id FROM aseguranzas WHERE LOWER(nombre) = 'issstecali' LIMIT 1");
  if (aid.rows.length === 0) { console.log('ISSSTECALI not found'); await c.end(); return; }
  const id = aid.rows[0].id;
  
  const s = [
    ['ESTUDIO','Campimetria por Ojo','campimetria por ojo'],
    ['ESTUDIO','Electroretinograma','electroretinograma'],
    ['ESTUDIO','Estudio de Autoflorescencia Mas Fotografia Retinal','estudio de autoflorescencia mas fotografia retinal'],
    ['ESTUDIO','Estudio de Fotografia Digital','estudio de fotografia digital'],
    ['ESTUDIO','Estudio de Ora (Ocular Response Analizer) Por Ojo','estudio de ora ocular response analizer por ojo'],
    ['ESTUDIO','Fluorangiografia por Ojo','fluorangiografia por ojo'],
    ['ESTUDIO','Fluorangiografia Por Verde Indocianina Por Ojo','fluorangiografia por verde indocianina por ojo'],
    ['ESTUDIO','Fotos de Fondo de Ojo por Ojo','fotos de fondo de ojo por ojo'],
    ['ESTUDIO','Microscopia Especular Por Ojo','microscopia especular por ojo'],
    ['ESTUDIO','Paquimetria por Ojo','paquimetria por ojo'],
    ['ESTUDIO','Potenciales Visuales Evocados por Ojo','potenciales visuales evocados por ojo'],
    ['ESTUDIO','Pruebas de sensibilidad al Contraste de Ambos Ojos','pruebas de sensibilidad al contraste de ambos ojos'],
    ['ESTUDIO','Pruebas De Ishihara por Ojo','pruebas de ishihara por ojo'],
    ['ESTUDIO','Tomografia de Coherencia Optica de Nervio Optico por ojo','tomografia de coherencia optica de nervio optico por ojo'],
    ['ESTUDIO','Tomografia de Coherencia Optica de Segmento Anterior por ojo','tomografia de coherencia optica de segmento anterior por ojo'],
    ['ESTUDIO','Tomografia de Coherencia Optica Macular por ojo','tomografia de coherencia optica macular por ojo'],
    ['ESTUDIO','Tonometria por ojo','tonometria por ojo'],
    ['ESTUDIO','Topografia Corneal Por Ojo','topografia corneal por ojo'],
    ['ESTUDIO','Ultrasonido A por Ojo','ultrasonido a por ojo'],
    ['ESTUDIO','Ultrasonido B Por Ojo','ultrasonido b por ojo'],
    ['ESTUDIO','Agudeza Visual Lambda 100 Por Ojo','agudeza visual lambda 100 por ojo'],
    ['ESTUDIO','Calculo de Lente Intraocular','calculo de lente intraocular'],
    ['CONSULTA','Consulta Cornea','consulta cornea'],
    ['CONSULTA','Consulta De Estrabismo','consulta de estrabismo'],
    ['CONSULTA','Consulta De Glaucoma','consulta de glaucoma'],
    ['CONSULTA','Consulta De Uveitis','consulta de uveitis'],
    ['CONSULTA','Consulta oftalmologica Pediatrica Prematuros en Hospital','consulta oftalmologica pediatrica prematuros en hospital'],
    ['CONSULTA','Consulta Subsecuente','consulta subsecuente'],
    ['CONSULTA','Revision','revision'],
    ['PROCEDIMIENTO','Aplicacion de Gas durante Cirugia por ojo','aplicacion de gas durante cirugia por ojo'],
    ['PROCEDIMIENTO','Cerclaje (Para Vitrectomia) Por Ojo','cerclaje para vitrectomia por ojo'],
    ['PROCEDIMIENTO','Cerclaje Escleral Por Ojo','cerclaje escleral por ojo'],
    ['PROCEDIMIENTO','Colocacion de Silicon Intravitrealmente durante Cirugia Por Ojo','colocacion de silicon intravitrealmente durante cirugia por ojo'],
    ['PROCEDIMIENTO','Colocacion de Valvula de Ahmed con Valvula Por Ojo','colocacion de valvula de ahmed con valvula por ojo'],
    ['PROCEDIMIENTO','Crioablacion Durante Cirugia de Retina Por Ojo','crioablacion durante cirugia de retina por ojo'],
    ['PROCEDIMIENTO','Crioterapia por ojo','crioterapia por ojo'],
    ['PROCEDIMIENTO','Cross-Linking Corneal','cross-linking corneal'],
    ['PROCEDIMIENTO','Diodo por Ojo','diodo por ojo'],
    ['PROCEDIMIENTO','Exploracion Con Toma de Biopsia Mucormicosis','exploracion con toma de biopsia mucormicosis'],
    ['PROCEDIMIENTO','Extraccion de Cuerpo Extrano Con Sutura de Herida Escleral','extraccion de cuerpo extrano con sutura de herida escleral'],
    ['PROCEDIMIENTO','Extraccion De Cuerpo Extrano Intraocular','extraccion de cuerpo extrano intraocular'],
    ['PROCEDIMIENTO','Facoaspiracion por Ojo','facoaspiracion por ojo'],
    ['PROCEDIMIENTO','Facoemulsificacion de Catarata','facoemulsificacion de catarata'],
    ['PROCEDIMIENTO','Facoemulsificacion mas Colocacion de Lente Intraocular','facoemulsificacion mas colocacion de lente intraocular'],
    ['PROCEDIMIENTO','Facotrabeculectomia Por Ojo','facotrabeculectomia por ojo'],
    ['PROCEDIMIENTO','Fotocoagulacion con Bloqueo Retrobulbar Por Ojo','fotocoagulacion con bloqueo retrobulbar por ojo'],
    ['PROCEDIMIENTO','Fotocoagulacion por Ojo (En Lampara De Hendidura)','fotocoagulacion por ojo en lampara de hendidura'],
    ['PROCEDIMIENTO','Fotoiridotomia por Ojo','fotoiridotomia por ojo'],
    ['PROCEDIMIENTO','Implante de Anillo de Malyugin por Ojo','implante de anillo de malyugin por ojo'],
    ['PROCEDIMIENTO','Implante Secundario de Lente Intraocular','implante secundario de lente intraocular'],
    ['PROCEDIMIENTO','Inyeccion intravitrea','inyeccion intravitrea'],
    ['PROCEDIMIENTO','Laser Focal En Macula por Ojo','laser focal en macula por ojo'],
    ['PROCEDIMIENTO','Limitorrexis con Azul Brillante por ojo','limitorrexis con azul brillante por ojo'],
    ['PROCEDIMIENTO','Panfotocoagulacion por Ojo','panfotocoagulacion por ojo'],
    ['PROCEDIMIENTO','Reseccion/Retiro de Membranas Retinianas durante Cirugia de Retina por ojo','reseccion retiro de membranas retinianas durante cirugia de retina por ojo'],
    ['PROCEDIMIENTO','Reseccion en bloque de lesion Papilomatosa','reseccion en bloque de lesion papilomatosa'],
    ['PROCEDIMIENTO','Retiro de Implante Intraescleral por Ojo','retiro de implante intraescleral por ojo'],
    ['PROCEDIMIENTO','Retiro de Lente Intraocular de Camara Anterior (por ojo)','retiro de lente intraocular de camara anterior por ojo'],
    ['PROCEDIMIENTO','Retiro de Lente Intraocular de Camara Posterior (por ojo)','retiro de lente intraocular de camara posterior por ojo'],
    ['PROCEDIMIENTO','Retiro De Puntos','retiro de puntos'],
    ['PROCEDIMIENTO','Retiro de Silicon por Ojo','retiro de silicon por ojo'],
    ['PROCEDIMIENTO','Revision Bajo Anestesia por Ojo','revision bajo anestesia por ojo'],
    ['PROCEDIMIENTO','Sondeo de Via Lagrimal por ojo','sondeo de via lagrimal por ojo'],
    ['PROCEDIMIENTO','Suero Autologo por Ojo','suero autologo por ojo'],
    ['PROCEDIMIENTO','Sutura de Dehiscencia de herida Corneal (Por ojo)','sutura de dehiscencia de herida corneal por ojo'],
    ['PROCEDIMIENTO','Toma de Muestra de Secrecion de Ulcera Corneal (por ojo)','toma de muestra de secrecion de ulcera corneal por ojo'],
    ['PROCEDIMIENTO','Toma de muestra Biopsia de musculos rectos por ojo','toma de muestra biopsia de musculos rectos por ojo'],
    ['PROCEDIMIENTO','Trabeculectomia Por Ojo','trabeculectomia por ojo'],
    ['PROCEDIMIENTO','Trabeculoplastia con Laser de Micropulsado Por Ojo','trabeculoplastia con laser de micropulsado por ojo'],
    ['PROCEDIMIENTO','Trabeculoplastia Selectiva Laser Por Ojo','trabeculoplastia selectiva laser por ojo'],
    ['PROCEDIMIENTO','Transplante de Cornea con Facoemulsificacion','transplante de cornea con facoemulsificacion'],
    ['PROCEDIMIENTO','Transplante de Cornea sin Facoemulsificacion','transplante de cornea sin facoemulsificacion'],
    ['PROCEDIMIENTO','Vitrectomia Anterior por ojo','vitrectomia anterior por ojo'],
    ['PROCEDIMIENTO','Vitrectomia Con Endolaser por ojo','vitrectomia con endolaser por ojo'],
    ['PROCEDIMIENTO','Vitrectomia Mas Cerclaje Mas Crioablacion por ojo','vitrectomia mas cerclaje mas crioablacion por ojo'],
    ['PROCEDIMIENTO','Vitrectomia Mas Reseccion De Membranas Mas Fotocoagulacion por ojo','vitrectomia mas reseccion de membranas mas fotocoagulacion por ojo'],
    ['PROCEDIMIENTO','Vitrectomia Posterior Mas Silicon por ojo','vitrectomia posterior mas silicon por ojo'],
    ['PROCEDIMIENTO','Vitrectomia Posterior Por Ojo','vitrectomia posterior por ojo'],
    ['PROCEDIMIENTO','IRIDOTOMIA','iridotomia'],
    ['PROCEDIMIENTO','Aplicacion de Antiangiogenico','aplicacion de antiangiogenico'],
    ['PROCEDIMIENTO','Aplicacion de Medicamento Intravitreo','aplicacion de medicamento intravitreo'],
    ['PROCEDIMIENTO','Aplicacion de Gas durante Cirugia por ojo','aplicacion de gas durante cirugia por ojo'],
  ];
  
  let inserted = 0;
  for (const [tipo, nombre, nombreNorm] of s) {
    const r = await c.query(
      'INSERT INTO aseguranza_servicios (aseguranza_id, tipo, nombre, nombre_norm, costo, porcentaje_cobertura) SELECT $1, $2, $3, $4, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM aseguranza_servicios WHERE aseguranza_id = $1 AND tipo = $2 AND nombre_norm = $4) RETURNING id',
      [id, tipo, nombre, nombreNorm]
    );
    if (r.rows.length > 0) inserted++;
  }
  const count = await c.query('SELECT count(*) FROM aseguranza_servicios');
  console.log('Inserted:', inserted, '| Total:', count.rows[0].count);
  await c.end();
})();
