#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B10 (Detalle de cirugía + navegación
 * Consulta ↔ Cirugía) de Fase 1 (Creación de cirugía homologada) de
 * EyeAdvancedMS.
 *
 * IDs cubiertos: DET-001, DET-002, DET-003, CON-001, CON-002, CON-003
 * (ver `docs/cirugias/fase-1-creacion-cirugia.md`).
 *
 * No instala ni ejecuta frameworks pesados. NO conecta a Supabase/PostgreSQL
 * ni ejecuta migraciones; sólo lee el contenido textual del repo y verifica
 * que existan los elementos obligatorios del bloque B10:
 *
 *   - Página de detalle `src/app/(dashboard)/cirugias/[id]/page.tsx`:
 *       * 'use client'
 *       * cabecera con código (CIR-), paciente, procedimiento + ojo, origen,
 *         fecha y hora (DET-001)
 *       * 6 bloques en el orden definido (DET-002):
 *           1) Información de la cirugía
 *           2) Equipo médico
 *           3) Lente Intraocular (LIO)
 *           4) Archivos de apoyo
 *           5) Productividad
 *           6) Historial
 *       * botón "+ Agregar archivo" con subida a
 *         `/api/cirugias/${id}/archivos` (DET-003)
 *       * botón/link "Ver consulta" que use `/consultas/[id]` cuando existe
 *         consulta_id (CON-002)
 *
 *   - Endpoint `src/app/api/cirugias/[id]/route.ts` (GET):
 *       * usa requireAuth
 *       * consulta `agenda_cirugias` con joins a pacientes, origen, servicio,
 *         recurso y LIO
 *       * carga relacionados: participantes (`cirugia_participantes`),
 *         archivos (`cirugia_archivos`), productividad (`cirugia_productividad`)
 *         e historial (`cirugia_historial`)
 *       * responde 404 si la cirugía no existe
 *
 *   - Endpoint `src/app/api/cirugias/route.ts` (GET):
 *       * soporta `?consulta_id=` y `?paciente_id=` para listar cirugías
 *         filtradas (CON-002)
 *
 *   - Página de detalle de consulta
 *     `src/app/(dashboard)/consultas/[id]/page.tsx`:
 *       * botón "Crear cirugía" con `href=/cirugias/nueva?consulta_id=`
 *         (CON-003)
 *       * lista de cirugías relacionadas con links a `/cirugias/[id]`
 *         (CON-002)
 *       * consume el endpoint filtrado por `?consulta_id=`
 *
 *   - Página `src/app/(dashboard)/cirugias/nueva/page.tsx`:
 *       * lee `useSearchParams().get('consulta_id')`
 *       * cuando hay `consulta_id` consulta `/api/consultas/[id]` y precarga
 *         paciente + origen + diagnóstico (CON-003)
 *       * en el body del POST envía `consulta_id`
 *
 *   - `package.json`: añade `"test:b10"` y deja intactos `test:b1..b9`.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación falló (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CIRUGIA_DETALLE_PAGE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'cirugias',
  '[id]',
  'page.tsx'
);
const CIRUGIA_NUEVA_PAGE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'cirugias',
  'nueva',
  'page.tsx'
);
const CONSULTA_DETALLE_PAGE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'consultas',
  '[id]',
  'page.tsx'
);
const CIRUGIA_API_ID_ROUTE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  '[id]',
  'route.ts'
);
const CIRUGIA_API_LIST_ROUTE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'route.ts'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones
// ---------------------------------------------------------------------------

let failures = 0;
let passes = 0;
const failuresDetail = [];

function ok(label) {
  passes += 1;
  console.log('  \u2713 ' + label);
}

function fail(label, detail) {
  failures += 1;
  const message = detail ? label + ' -> ' + detail : label;
  failuresDetail.push(message);
  console.log('  \u2717 ' + message);
}

function assertContainsAll(content, needles, groupLabel) {
  const missing = needles.filter(function (needle) {
    return !content.includes(needle);
  });
  if (missing.length === 0) {
    ok(groupLabel + ' (' + needles.length + ' elementos)');
    return true;
  }
  fail(
    groupLabel,
    'faltan: ' +
      missing
        .map(function (m) {
          return JSON.stringify(m);
        })
        .join(', ')
  );
  return false;
}

function assertNotContains(content, needle, groupLabel) {
  if (!content.includes(needle)) {
    ok(groupLabel);
    return true;
  }
  fail(groupLabel, 'presencia prohibida de: ' + JSON.stringify(needle));
  return false;
}

function assertRegexMatches(content, re, groupLabel) {
  if (re.test(content)) {
    ok(groupLabel);
    return true;
  }
  fail(groupLabel, 'no se encontró el patrón: ' + re.toString());
  return false;
}

function fileExistsOrFail(file, label) {
  if (!fs.existsSync(file)) {
    fail(label, file);
    return null;
  }
  ok(label);
  return fs.readFileSync(file, 'utf8');
}

function firstIndexOf(content, re) {
  const m = content.search(re);
  return m === -1 ? -1 : m;
}

// ---------------------------------------------------------------------------
// [1/6] DET-001 + DET-002 + DET-003: Página /cirugias/[id]
// ---------------------------------------------------------------------------

function checkCirugiaDetallePage() {
  console.log(
    '\n[1/6] Detalle /cirugias/[id] (DET-001/002/003): ' +
      path.relative(REPO_ROOT, CIRUGIA_DETALLE_PAGE)
  );

  const content = fileExistsOrFail(
    CIRUGIA_DETALLE_PAGE,
    'archivo de la página de detalle existe'
  );
  if (content === null) return;

  // Página cliente.
  assertRegexMatches(
    content,
    /^['"]use client['"]/m,
    "página marcada con 'use client'"
  );

  // DET-001: cabecera con código, paciente, procedimiento + ojo, origen,
  // fecha y hora. El prefijo "CIR-" lo emite el generador backend (helper
  // de código), por lo que el JSX muestra el valor completo de
  // `cirugia.codigo`. Verificamos que el código se expone explícitamente
  // como title del PageHeader.
  assertRegexMatches(
    content,
    /cirugia\.codigo|cirugia\?\.\s*codigo|\bcodigo\b/,
    'cabecera expone el código (cirugia.codigo)'
  );
  assertRegexMatches(
    content,
    /title=\{[^}]*cirugia\.codigo|title=\{cirugia\.codigo/,
    'PageHeader recibe cirugia.codigo como title (DET-001)'
  );
  assertRegexMatches(
    content,
    /subtitle=\{[\s\S]{0,200}nombrePaciente[\s\S]{0,200}cirugia\.fecha/,
    'cabecera arma subtitle con paciente + fecha (DET-001)'
  );
  assertRegexMatches(
    content,
    /nombrePaciente|pacientes\??\.nombre_completo/,
    'cabecera expone el nombre del paciente (DET-001)'
  );
  assertRegexMatches(
    content,
    /cirugia\.servicio\??\.nombre|servicio:Servicio/,
    'cabecera expone el procedimiento / servicio (DET-001)'
  );
  assertRegexMatches(
    content,
    /procedimientoOjo|cirugia\.ojo/,
    'cabecera compone procedimiento + ojo (DET-001)'
  );
  assertRegexMatches(
    content,
    /cirugia\.origen\??\.nombre/,
    'cabecera expone el origen / aseguradora (DET-001)'
  );
  assertRegexMatches(
    content,
    /cirugia\.fecha/,
    'cabecera expone la fecha (DET-001)'
  );
  assertRegexMatches(
    content,
    /cirugia\.hora/,
    'cabecera expone la hora (DET-001)'
  );
  assertRegexMatches(
    content,
    /StatusBadge[\s\S]*estado/,
    'cabecera incluye la insignia de estado (DET-001 / DET-002)'
  );

  // DET-002: 6 bloques en el orden definido. Localizamos la posición de
  // cada encabezado `<h3>` con su texto característico y verificamos
  // presencia + orden creciente.
  const bloques = [
    {
      label: '1. Información de la cirugía',
      re: />\s*Informaci(ó|o)n\s+de\s+la\s+cirug|Informaci(ó|o)n\s+de\s+la\s+cirug|1\.\s*Informaci(ó|o)n/,
    },
    {
      label: '2. Equipo médico',
      re: />\s*Equipo\s+m(é|e)dico|2\.\s*Equipo/,
    },
    {
      label: '3. LIO / Lente Intraocular',
      re: />\s*Lente\s+Intraocular|>LIO<|3\.\s*LIO|3\.\s*Lente/,
    },
    {
      label: '4. Archivos de apoyo',
      re: />\s*Archivos\s+de\s+apoyo|4\.\s*Archivos/,
    },
    {
      label: '5. Productividad',
      re: />\s*Productividad|5\.\s*Productividad/,
    },
    {
      label: '6. Historial',
      re: />\s*Historial|6\.\s*Historial/,
    },
  ];

  const positions = bloques.map(function (b) {
    return firstIndexOf(content, b.re);
  });
  bloques.forEach(function (b, i) {
    if (positions[i] === -1) {
      fail('presencia de bloque "' + b.label + '"', 'no se encontró el patrón');
    } else {
      ok('presencia de bloque "' + b.label + '"');
    }
  });
  let orderOk = true;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i - 1] === -1 || positions[i] === -1) continue;
    if (positions[i] <= positions[i - 1]) {
      orderOk = false;
      fail(
        'orden DET-002 (' + bloques[i].label + ' después de ' + bloques[i - 1].label + ')',
        'posición de "' +
          bloques[i - 1].label +
          '"=' +
          positions[i - 1] +
          ' >= "' +
          bloques[i].label +
          '"=' +
          positions[i]
      );
    }
  }
  if (orderOk) ok('orden secuencial 1→6 de los bloques del detalle (DET-002)');

  // Cada bloque expone lo prometido en la especificación.
  // Bloque 1 (Información de cirugía): procedimiento, ojo, estado + código,
  // paciente, recurso y notas. Los labels van como prop `label="..."` de
  // <Field>.
  assertContainsAll(
    content,
    [
      'label="Procedimiento"',
      'label="Ojo"',
      'label="Duración estimada"',
      'label="Notas"',
      'label="Código"',
      'label="Paciente"',
      'label="Origen"',
      'label="Fecha"',
      'label="Hora"',
      'label="Recurso / Quirófano"',
    ],
    'bloque 1 expone Procedimiento, Ojo, Duración estimada, Notas, Código, Paciente, Origen, Fecha y Hora'
  );
  // Bloque 2 (Equipo médico): itera sobre `participantes` y muestra rol +
  // nombre del médico.
  assertRegexMatches(
    content,
    /participantes\.map\s*\(/,
    'bloque 2 renderiza la lista de participantes'
  );
  assertRegexMatches(
    content,
    /doctores\??\.nombre_completo|roles\??\.nombre|roles\??\.clave/,
    'bloque 2 expone el nombre del médico y el rol (DET-002)'
  );
  // Bloque 3 (LIO): muestra marca, modelo, tipo, lote y caducidad (labels
  // pasados como prop `label="..."` de <Field>).
  const lioLabels = [
    'label="Marca"',
    'label="Modelo"',
    'label="Tipo"',
    'label="Lote"',
    'label="Caducidad"',
  ];
  assertContainsAll(
    content,
    lioLabels,
    'bloque 3 (LIO) expone Marca, Modelo, Tipo, Lote y Caducidad (DET-002)'
  );
  // Bloque 4 (Archivos de apoyo): itera sobre `archivos`.
  assertRegexMatches(
    content,
    /archivos\.map\s*\(/,
    'bloque 4 itera la lista de archivos (DET-002)'
  );
  // Bloque 4 también debe ofrecer Ver/Descargar (Download) y Eliminar
  // (Trash2) sobre cada archivo.
  assertRegexMatches(
    content,
    /downloadFile\(/,
    'bloque 4 expone acción "Descargar / Ver" por archivo'
  );
  assertRegexMatches(
    content,
    /deleteFile\(/,
    'bloque 4 expone acción "Eliminar" por archivo'
  );
  // Bloque 5 (Productividad): itera sobre `productividad` y muestra el
  // estado como insignia.
  assertRegexMatches(
    content,
    /productividad\.map\s*\(/,
    'bloque 5 itera la lista de productividad (DET-002)'
  );
  assertRegexMatches(
    content,
    /p\.estado|\{p\.estado\}/,
    'bloque 5 muestra el estado de la productividad (DET-002)'
  );
  // Bloque 6 (Historial): itera sobre `historial` y muestra la fecha.
  assertRegexMatches(
    content,
    /historial\.map\s*\(/,
    'bloque 6 itera la lista de historial (DET-002)'
  );
  assertRegexMatches(
    content,
    /new\s+Date\(\s*h\.created_at\s*\)/,
    'bloque 6 formatea la fecha del evento de historial'
  );

  // DET-003: botón "+ Agregar archivo" + POST a /api/cirugias/[id]/archivos.
  assertRegexMatches(
    content,
    /\+\s*Agregar\s+archivo/,
    'existe botón "+ Agregar archivo" en el detalle (DET-003)'
  );
  assertRegexMatches(
    content,
    /setShowUpload\s*\(/,
    'el botón abre un panel de subida (setShowUpload)'
  );
  assertRegexMatches(
    content,
    /fetch\(\s*[`'"]\/api\/cirugias\/`?\/?\$\{[^}]+\}\/archivos/,
    'la subida se hace a /api/cirugias/[id]/archivos (DET-003)'
  );
  assertRegexMatches(
    content,
    /formData\.append\(\s*['"]archivo['"]/,
    'FormData de subida adjunta el campo "archivo" (DET-003)'
  );
  assertRegexMatches(
    content,
    /formData\.append\(\s*['"]tipo_documento['"]/,
    'FormData de subida adjunta "tipo_documento" (DET-003 / ARC-007)'
  );

  // CON-002 (sentido Cirugía → Consulta): cuando hay consulta_id la página
  // expone un enlace "Ver consulta →" hacia /consultas/[id].
  assertRegexMatches(
    content,
    /cirugia\.consulta_id\s*&&/,
    'detalle muestra la consulta de origen solo si consulta_id existe'
  );
  assertRegexMatches(
    content,
    /\/consultas\/`?\/?\$\{[^}]+\}|router\.push\(\s*[`'"]\/consultas\/`?\/?\$\{[^}]+\}/,
    'detalle enlaza hacia /consultas/[id] (CON-002)'
  );
  assertRegexMatches(
    content,
    /Ver\s+consulta/i,
    'detalle muestra texto "Ver consulta" para volver a la consulta (CON-002)'
  );
}

// ---------------------------------------------------------------------------
// [2/6] Endpoint GET /api/cirugias/[id]
// ---------------------------------------------------------------------------

function checkCirugiaDetailEndpoint() {
  console.log(
    '\n[2/6] Endpoint GET /api/cirugias/[id]: ' +
      path.relative(REPO_ROOT, CIRUGIA_API_ID_ROUTE)
  );

  const content = fileExistsOrFail(
    CIRUGIA_API_ID_ROUTE,
    'archivo del endpoint /api/cirugias/[id] existe'
  );
  if (content === null) return;

  // 1. GET con params (Next.js App Router).
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );
  assertRegexMatches(
    content,
    /params\s*:\s*\{\s*id\s*:\s*string\s*\}/,
    'acepta params con id:string (Next.js App Router)'
  );

  // 2. requireAuth.
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar al usuario'
  );

  // 3. Lee de agenda_cirugias con joins.
  assertRegexMatches(
    content,
    /\.from\(\s*['"]agenda_cirugias['"]\s*\)/,
    "consulta la tabla 'agenda_cirugias'"
  );
  const joinsEsperados = [
    { needle: "pacientes:paciente_id", label: 'pacientes' },
    { needle: "origen:origen_id", label: 'origen' },
    { needle: "servicio:servicio_id", label: 'servicio' },
    { needle: "lio:inventario_item_id", label: 'LIO' },
  ];
  joinsEsperados.forEach(function (j) {
    assertRegexMatches(
      content,
      new RegExp(j.needle),
      "select incluye el join '" + j.label + "'"
    );
  });

  // 4. Carga relacionados: participantes, archivos, productividad, historial.
  const tablasRelacionadas = [
    { re: /\.from\(\s*['"]cirugia_participantes['"]\s*\)/, label: 'cirugia_participantes' },
    { re: /\.from\(\s*['"]cirugia_archivos['"]\s*\)/, label: 'cirugia_archivos' },
    { re: /\.from\(\s*['"]cirugia_productividad['"]\s*\)/, label: 'cirugia_productividad' },
    { re: /\.from\(\s*['"]cirugia_historial['"]\s*\)/, label: 'cirugia_historial' },
  ];
  tablasRelacionadas.forEach(function (t) {
    assertRegexMatches(
      content,
      t.re,
      'carga relacionados desde ' + t.label
    );
  });

  // 5. Archivos: filtra deleted_at IS NULL (borrado lógico).
  assertRegexMatches(
    content,
    /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/,
    'filtra archivos con deleted_at IS NULL (borrado lógico, ARC)'
  );

  // 6. Respuesta 404 cuando la cirugía no existe.
  assertRegexMatches(
    content,
    /status\s*:\s*404/,
    'responde 404 cuando la cirugía no existe'
  );
  assertRegexMatches(
    content,
    /Cirug[íi]a\s+no\s+encontrada/i,
    'mensaje claro en 404 ("Cirugía no encontrada")'
  );

// 7. Respuesta final incluye las 5 llaves: cirugia, participantes,
  //    archivos, productividad, historial. Localizamos el ÚLTIMO
  //    NextResponse.json({...}) del archivo (que es el happy-path con
  //    todas las llaves) porque el endpoint también emite json de error.
  const jsonMatches = content.match(
    /NextResponse\.json\s*\(\s*\{[\s\S]*?\}\s*\)/g
  );
  if (!jsonMatches || jsonMatches.length === 0) {
    fail(
      'respuesta NextResponse.json({...}) presente',
      'no se encontró ningún NextResponse.json({...})'
    );
  } else {
    const body = jsonMatches[jsonMatches.length - 1];
    ok(
      'respuesta NextResponse.json({...}) presente en /api/cirugias/[id]'
    );
    const llaves = [
      'cirugia',
      'participantes',
      'archivos',
      'productividad',
      'historial',
    ];
    llaves.forEach(function (k) {
      const re = new RegExp('\\b' + k + '\\b[\\s\\S]{0,40}');
      if (re.test(body)) {
        ok('respuesta incluye la llave "' + k + '"');
      } else {
        fail(
          'respuesta incluye la llave "' + k + '"',
          'no aparece en el cuerpo de NextResponse.json'
        );
      }
    });
  }
}

// ---------------------------------------------------------------------------
// [3/6] Endpoint GET /api/cirugias (listado + filtros consulta_id/paciente_id)
// ---------------------------------------------------------------------------

function checkCirugiasListEndpoint() {
  console.log(
    '\n[3/6] Endpoint GET /api/cirugias (CON-002): ' +
      path.relative(REPO_ROOT, CIRUGIA_API_LIST_ROUTE)
  );

  const content = fileExistsOrFail(
    CIRUGIA_API_LIST_ROUTE,
    'archivo del endpoint /api/cirugias existe'
  );
  if (content === null) return;

  // 1. GET exportado.
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );

  // 2. Lee searchParams.
  assertRegexMatches(
    content,
    /searchParams\.get\(\s*['"]consulta_id['"]\s*\)/,
    "lee searchParams.get('consulta_id') (CON-002)"
  );
  assertRegexMatches(
    content,
    /searchParams\.get\(\s*['"]paciente_id['"]\s*\)/,
    "lee searchParams.get('paciente_id') (CON-002)"
  );

  // 3. Filtros aplicados sobre agenda_cirugias.
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]consulta_id['"]\s*,\s*consultaId\s*\)/,
    "filtra .eq('consulta_id', consultaId) cuando viene en query (CON-002)"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]paciente_id['"]\s*,\s*pacienteId\s*\)/,
    "filtra .eq('paciente_id', pacienteId) cuando viene en query"
  );

  // 4. requireAuth presente (la navegación Consulta → Cirugía es segura).
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() en el GET de listado'
  );

  // 5. La respuesta envuelve los datos en { data: [...] }.
  assertRegexMatches(
    content,
    /\{\s*data:\s*data\s*\|\|\s*\[\s*\]\s*\}/,
    'respuesta del GET envuelve los resultados en { data: [...] }'
  );
}

// ---------------------------------------------------------------------------
// [4/6] CON-001: consulta_id nullable en migración, schema y POST
// ---------------------------------------------------------------------------

function checkConsultaIdColumn() {
  console.log('\n[4/6] CON-001: columna consulta_id (nullable) en agenda_cirugias');

  // 1. Columna creada por la migración 1800000000004-AddConsultaId...
  //    La migración es SQL crudo: usa REFERENCES + ON DELETE SET NULL,
  //    no .nullable() de TypeORM.
  const migDir = path.join(REPO_ROOT, 'src', 'migrations');
  const addConsultaMig = path.join(
    migDir,
    '1800000000004-AddConsultaIdToAgendaCirugias.ts'
  );

  if (fs.existsSync(addConsultaMig)) {
    const migContent = fs.readFileSync(addConsultaMig, 'utf8');
    assertRegexMatches(
      migContent,
      /\bconsulta_id\b/,
      'migración 1800000000004-AddConsultaId agrega columna consulta_id'
    );
    assertRegexMatches(
      migContent,
      /REFERENCES\s+consultas\s*\(\s*id\s*\)/i,
      'migración declara consulta_id como FK REFERENCES consultas(id) (CON-001)'
    );
    assertRegexMatches(
      migContent,
      /ON\s+DELETE\s+SET\s+NULL/i,
      'migración permite consulta_id NULL al borrar la consulta (CON-001)'
    );
    assertRegexMatches(
      migContent,
      /ADD\s+COLUMN[\s\S]{0,80}\bconsulta_id\b/i,
      'migración usa ADD COLUMN para consulta_id'
    );
  } else {
    fail(
      'migración 1800000000004-AddConsultaId existe',
      'no se encontró ' + addConsultaMig
    );
  }

  // 2. POST del endpoint /api/cirugias acepta consulta_id opcional.
  const postContent = fs.readFileSync(CIRUGIA_API_LIST_ROUTE, 'utf8');
  assertRegexMatches(
    postContent,
    /consulta_id\s*:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/,
    'POST /api/cirugias acepta consulta_id opcional/nullable (CON-001)'
  );
  // Y lo envía al RPC.
  assertRegexMatches(
    postContent,
    /p_consulta_id\s*:\s*data\.consulta_id/,
    'POST /api/cirugias propaga consulta_id al RPC crear_cirugia (CON-001)'
  );

  // 3. El GET /api/cirugias/[id] expone consulta_id en el payload.
  const getIdContent = fs.readFileSync(CIRUGIA_API_ID_ROUTE, 'utf8');
  assertRegexMatches(
    getIdContent,
    /\bconsulta_id\b/,
    'GET /api/cirugias/[id] expone el campo consulta_id (CON-001 / CON-002)'
  );
}

// ---------------------------------------------------------------------------
// [5/6] CON-002 + CON-003: navegación Consulta ↔ Cirugía y precarga
// ---------------------------------------------------------------------------

function checkConsultaDetallePage() {
  console.log(
    '\n[5/6] Navegación Consulta ↔ Cirugía (CON-002/003): ' +
      path.relative(REPO_ROOT, CONSULTA_DETALLE_PAGE)
  );

  const content = fileExistsOrFail(
    CONSULTA_DETALLE_PAGE,
    'archivo del detalle de consulta existe'
  );
  if (content === null) return;

  // CON-002 (sentido Consulta → Cirugía): bloque "Cirugías relacionadas"
  // que lista cirugías con links a /cirugias/[id].
  assertRegexMatches(
    content,
    /Cirug[íi]as\s+relacionadas/,
    'detalle de consulta muestra bloque "Cirugías relacionadas" (CON-002)'
  );
  assertRegexMatches(
    content,
    /router\.push\(\s*[`'"]\/cirugias\/`?\/?\$\{[^}]+\}/,
    'detalle de consulta navega a /cirugias/[id] al pulsar una relacionada (CON-002)'
  );
  // Consume el endpoint filtrado por consulta_id.
  assertRegexMatches(
    content,
    /\/api\/cirugias\?consulta_id=/,
    'detalle de consulta llama a /api/cirugias?consulta_id=... (CON-002)'
  );

  // CON-003: botón "Crear cirugía" desde el detalle de consulta.
  assertRegexMatches(
    content,
    /Crear\s+cirug[íi]a/i,
    'detalle de consulta tiene botón/acción "Crear cirugía" (CON-003)'
  );
  assertRegexMatches(
    content,
    /\/cirugias\/nueva\?consulta_id=/,
    'el botón apunta a /cirugias/nueva?consulta_id=... (CON-003)'
  );

  // El botón debe estar disponible para admin/recepcionista.
  assertRegexMatches(
    content,
    /user\??\.rol\s*===?\s*['"]admin['"]|user\??\.rol\s*===?\s*['"]recepcionista['"]/,
    'el botón "Crear cirugía" está habilitado según rol del usuario (admin/recepcionista)'
  );
}

// ---------------------------------------------------------------------------
// [6/6] Página /cirugias/nueva: precarga desde consulta
// ---------------------------------------------------------------------------

function checkNuevaPagePrecarga() {
  console.log(
    '\n[6/6] /cirugias/nueva: precarga desde consulta (CON-003): ' +
      path.relative(REPO_ROOT, CIRUGIA_NUEVA_PAGE)
  );

  const content = fileExistsOrFail(
    CIRUGIA_NUEVA_PAGE,
    'archivo de /cirugias/nueva existe'
  );
  if (content === null) return;

  // 1. Lee consulta_id de useSearchParams().
  assertRegexMatches(
    content,
    /useSearchParams\s*\(\s*\)/,
    'usa useSearchParams() para leer el query string'
  );
  assertRegexMatches(
    content,
    /searchParams\.get\(\s*['"]consulta_id['"]\s*\)/,
    "lee searchParams.get('consulta_id') (CON-003)"
  );

  // 2. Cuando hay consulta_id consulta /api/consultas/[id].
  assertRegexMatches(
    content,
    /\/api\/consultas\/`?\/?\$\{[^}]+\}|fetch\(\s*[`'"]\/api\/consultas\/`?\/?\$\{consultaPrecargaId[^}]*\}/,
    'cuando hay consulta_id consulta /api/consultas/[id] (CON-003)'
  );

  // 3. La precarga dispara setPacienteSeleccionado + setOrigenId y
  //    completa las notas con el diagnóstico.
  const marcadoresPrecarga = [
    { re: /seleccionarPaciente\s*\(/, label: 'selecciona el paciente' },
    { re: /setOrigenId\s*\(/, label: 'establece el origen/aseguradora' },
    {
      re: /setNotas\s*\(\s*[`'"][^`]*diagn[óo]stico[^`]*[`'"]/,
      label: 'precarga el diagnóstico de la consulta en notas',
    },
  ];
  marcadoresPrecarga.forEach(function (m) {
    assertRegexMatches(
      content,
      m.re,
      'precarga: ' + m.label + ' (CON-003)'
    );
  });

  // 4. En el POST envía el campo consulta_id.
  assertRegexMatches(
    content,
    /consulta_id\s*:\s*consultaPrecargaId/,
    'el POST a /api/cirugias incluye consulta_id desde la precarga (CON-001/CON-003)'
  );
}

// ---------------------------------------------------------------------------
// [extra] Script npm test:b10 + integridad de test:b1..b9
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[extra] Script npm test:b10 e integridad de test:b1..b9');

  const pkgContent = fileExistsOrFail(PACKAGE_JSON_FILE, 'package.json existe');
  if (pkgContent === null) return;

  let pkg = null;
  try {
    pkg = JSON.parse(pkgContent);
  } catch (e) {
    fail('package.json es JSON válido', e.message);
    return;
  }
  ok('package.json es JSON válido');

  const scripts = (pkg && pkg.scripts) || {};

  if (
    typeof scripts['test:b10'] === 'string' &&
    scripts['test:b10'].length > 0
  ) {
    ok(
      'script npm "test:b10" definido (' +
        JSON.stringify(scripts['test:b10']) +
        ')'
    );
  } else {
    fail('script npm "test:b10" definido', 'ausente o vacío en package.json');
  }

  [
    'test:b1',
    'test:b2',
    'test:b3',
    'test:b4',
    'test:b5',
    'test:b6',
    'test:b7',
    'test:b8',
    'test:b9',
  ].forEach(function (key) {
    if (typeof scripts[key] === 'string' && scripts[key].length > 0) {
      ok(
        'script npm "' + key + '" intacto (' + JSON.stringify(scripts[key]) + ')'
      );
    } else {
      fail(
        'script npm "' + key + '" intacto',
        'ausente o vacío en package.json'
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B10 - Detalle de cirugía + navegación (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkCirugiaDetallePage();
  checkCirugiaDetailEndpoint();
  checkCirugiasListEndpoint();
  checkConsultaIdColumn();
  checkConsultaDetallePage();
  checkNuevaPagePrecarga();
  checkPackageJson();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach(function (f, i) {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B10 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B10 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();
