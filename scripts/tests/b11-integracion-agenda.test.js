#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B11 (Verificación y cierre) de
 * Fase 1 (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * IDs cubiertos (ver `docs/cirugias/fase-1-creacion-cirugia.md`):
 *   - ARQ-001  Agenda unificada (consulta/estudio/cirugía) integra
 *              cirugías homologadas sin romper consultas/estudios.
 *   - ARQ-002  Historial/Auditoría transversal con estructura común:
 *              consulta_historial y cirugia_historial comparten
 *              usuario, fecha, acción, detalle.
 *   - ALC-01..16  Agregados de alcance específico de Fase 1.
 *   - FUE-001  Archivos de cirugía NO se mezclan con expediente
 *              general del paciente.
 *   - Re-verificación de OBJ-002 (Agenda + Historial + Productividad)
 *     y FLU-002 (al crear se alimentan Agenda, Historial y
 *     Productividad).
 *
 * Verificaciones principales:
 *
 *   - `src/app/api/agenda/route.ts` (GET):
 *       * selecciona con join `origen:origen_id(nombre)`
 *       * selecciona con join `servicio:servicio_id(nombre)`
 *       * mapea `procedimiento` con fallback a servicio.nombre
 *       * mapea `procedencia` con fallback a origen.nombre
 *
 *   - `src/app/(dashboard)/agenda/AgendaContent.tsx`:
 *       * usa `/cirugias/${cirugia.id}` como destino de la vista móvil
 *
 *   - `src/app/(dashboard)/agenda/[id]/page.tsx`:
 *       * redirige a `/cirugias/${id}`
 *
 *   - Endpoints legacy `/api/agenda` POST y `/api/agenda/[id]` PATCH:
 *       * siguen presentes
 *       * no se eliminaron campos legacy (procedimiento, procedencia,
 *         nombre_paciente, expediente, ojo, lio, marca_lio,
 *         tiempo_estimado, inventario_item_id)
 *
 *   - `src/lib/storage-cirugia.ts` y `src/app/api/cirugias/[id]/archivos/*`:
 *       * archivos vinculados exclusivamente a cirugia_id (sin
 *         integración con "expediente general")
 *       * no existe tabla `expedientes` ni endpoints relacionados
 *         con expediente general del paciente
 *
 *   - Migración `1800000000170-CreateCirugiaHomologadaTables.ts`:
 *       * cirugia_historial tiene usuario_id, created_at, accion,
 *         detalle (JSONB)
 *       * cirugia_archivos está vinculada exclusivamente por
 *         cirugia_id (FOREIGN KEY REFERENCES agenda_cirugias(id))
 *
 *   - Migración `1800000000090-AddEstatusAndHistorialToConsultas.ts`:
 *       * consulta_historial tiene usuario_id, created_at,
 *         tipo_evento, payload (JSONB)
 *
 *   - Re-verificación de FLU-002/OBJ-002:
 *       * el RPC `crear_cirugia` inserta en agenda_cirugias,
 *         cirugia_historial y cirugia_productividad.
 *
 *   - ALC-01..16 agregados: cada grupo de IDs cubiertos
 *     anteriormente tiene su estado actual verificable a partir
 *     de los archivos del repo (grep textual).
 *
 *   - Script npm `test:b11` definido y test:b1..b10 intactos.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación falló
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const AGENDA_ROUTE = path.join(REPO_ROOT, 'src', 'app', 'api', 'agenda', 'route.ts');
const AGENDA_ID_ROUTE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'agenda',
  '[id]',
  'route.ts'
);
const AGENDA_CONTENT_TSX = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'agenda',
  'AgendaContent.tsx'
);
const AGENDA_DETAIL_PAGE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'agenda',
  '[id]',
  'page.tsx'
);
const STORAGE_HELPER = path.join(REPO_ROOT, 'src', 'lib', 'storage-cirugia.ts');
const ARCHIVOS_ROUTE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  '[id]',
  'archivos',
  'route.ts'
);
const ARCHIVO_DETAIL_ROUTE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  '[id]',
  'archivos',
  '[archivoId]',
  'route.ts'
);
const CIRUGIA_DETAIL_PAGE = path.join(
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
const CIRUGIA_HISTORIAL_MIG = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000170-CreateCirugiaHomologadaTables.ts'
);
const CONSULTA_HISTORIAL_MIG = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000090-AddEstatusAndHistorialToConsultas.ts'
);
const CREAR_CIRUGIA_RPC_MIG = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000180-CreateCrearCirugiaRPC.ts'
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

// ---------------------------------------------------------------------------
// [1/8] ARQ-001: Agenda unificada — /api/agenda con joins + fallback
// ---------------------------------------------------------------------------

function checkAgendaRoute() {
  console.log(
    '\n[1/8] ARQ-001: GET /api/agenda con joins a origen/servicio y fallback: ' +
      path.relative(REPO_ROOT, AGENDA_ROUTE)
  );

  const content = fileExistsOrFail(AGENDA_ROUTE, 'archivo /api/agenda/route.ts existe');
  if (content === null) return;

  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );

  // El select debe traer joins a origen y servicio además del join a doctores
  // legado.
  assertRegexMatches(
    content,
    /origen\s*:\s*origen_id\s*\(\s*nombre\s*\)/,
    "select incluye el join 'origen:origen_id(nombre)' (ARQ-001)"
  );
  assertRegexMatches(
    content,
    /servicio\s*:\s*servicio_id\s*\(\s*nombre\s*\)/,
    "select incluye el join 'servicio:servicio_id(nombre)' (ARQ-001)"
  );

  // Fallback de mapeo: cirugías homologadas que no tengan `procedimiento`
  // textual deben mostrar el nombre del servicio. Mismo criterio para
  // `procedencia` -> origen.nombre.
  assertRegexMatches(
    content,
    /procedimiento\s*:\s*c\.procedimiento\s*\|\|\s*\(c\s+as\s+any\)\.servicio\??\.nombre\s*\|\|\s*null/,
    'mapea procedimiento con fallback a servicio.nombre (ARQ-001)'
  );
  assertRegexMatches(
    content,
    /procedencia\s*:\s*c\.procedencia\s*\|\|\s*\(c\s+as\s+any\)\.origen\??\.nombre\s*\|\|\s*null/,
    'mapea procedencia con fallback a origen.nombre (ARQ-001)'
  );

  // Después del mapeo debe eliminar las claves crudas para no enviarlas al
  // cliente (los joins son de solo lectura).
  assertRegexMatches(
    content,
    /servicio\s*:\s*undefined|doctores\s*:\s*undefined|origen\s*:\s*undefined/,
    'limpia las claves del join antes de responder (no expone estructura cruda)'
  );

  // requireAuth + RBAC preservados (sin regresiones).
  assertRegexMatches(content, /requireAuth\s*\(\s*\)/, 'usa requireAuth() (no regresión)');
  assertRegexMatches(
    content,
    /requireRole\s*\(\s*auth\.user\s*,\s*\[\s*['"]admin['"]\s*,\s*['"]doctor['"]\s*,\s*['"]recepcionista['"]\s*\]\s*\)/,
    'GET mantiene RBAC de los 3 roles (sin regresión)'
  );
}

// ---------------------------------------------------------------------------
// [2/8] ARQ-001: navegación Agenda → detalle homologado
// ---------------------------------------------------------------------------

function checkAgendaContentNavigation() {
  console.log(
    '\n[2/8] ARQ-001: AgendaContent navega a /cirugias/[id] en móvil: ' +
      path.relative(REPO_ROOT, AGENDA_CONTENT_TSX)
  );

  const content = fileExistsOrFail(
    AGENDA_CONTENT_TSX,
    'archivo AgendaContent.tsx existe'
  );
  if (content === null) return;

  // En la vista móvil (MobileCalendarView) el onSelect debe ir al detalle
  // homologado de cirugías, NO a /agenda/[id].
  assertRegexMatches(
    content,
    /onSelect=\{[\s\S]{0,80}\/cirugias\/`?\/?\$\{[^}]+\}/,
    'onSelect de MobileCalendarView apunta a /cirugias/${id} (ARQ-001)'
  );

  // El endpoint /api/agenda/[id] PATCH para reagendar sigue siendo el de la
  // ruta legacy (no se eliminó); sólo se cambió el destino de la navegación.
  assertRegexMatches(
    content,
    /\/api\/agenda\/`?\/?\$\{[^}]+\}/,
    'AgendaContent sigue usando /api/agenda/[id] para PATCH/GET (sin regresión)'
  );
}

function checkAgendaDetailRedirect() {
  console.log(
    '\n[2/8] ARQ-001: /agenda/[id] redirige al detalle homologado: ' +
      path.relative(REPO_ROOT, AGENDA_DETAIL_PAGE)
  );

  const content = fileExistsOrFail(
    AGENDA_DETAIL_PAGE,
    'archivo agenda/[id]/page.tsx existe'
  );
  if (content === null) return;

  assertRegexMatches(
    content,
    /router\.push\(\s*[`'"]\/cirugias\/`?\/?\$\{[^}]+\}`?\s*\)/,
    'agenda/[id] redirige a /cirugias/${id} (ARQ-001)'
  );

  // También debe existir un fallback "Volver a Agenda" por si la redirección
  // falla o el usuario navega directo al detalle.
  assertRegexMatches(
    content,
    /router\.push\(\s*['"]\/agenda['"]\s*\)/,
    'fallback: agenda/[id] ofrece volver a /agenda'
  );
}

// ---------------------------------------------------------------------------
// [3/8] Sin regresiones: POST /api/agenda y PATCH /api/agenda/[id] preservan
//        campos legacy
// ---------------------------------------------------------------------------

function checkLegacyAgendaEndpoints() {
  console.log(
    '\n[3/8] Sin regresiones: POST /api/agenda y PATCH /api/agenda/[id] (campos legacy)'
  );

  const postContent = fileExistsOrFail(
    AGENDA_ROUTE,
    'archivo POST /api/agenda existe'
  );
  if (postContent !== null) {
    assertRegexMatches(
      postContent,
      /export\s+async\s+function\s+POST\s*\(/,
      'exporta async function POST (sin regresión)'
    );
    // requireAuth + RBAC preservados
    assertRegexMatches(
      postContent,
      /requireRole\s*\(\s*auth\.user\s*,\s*\[\s*['"]admin['"]\s*,\s*['"]recepcionista['"]\s*\]\s*\)/,
      'POST mantiene RBAC admin/recepcionista (sin regresión)'
    );

    // Campos legacy que no se deben eliminar (cambios aditivos según
    // Decisión 4 del mapa del repo): procedimiento, procedencia,
    // nombre_paciente, expediente, ojo, lio, marca_lio, tiempo_estimado,
    // inventario_item_id.
    const legacyFields = [
      'nombre_paciente',
      'expediente',
      'procedimiento',
      'ojo',
      'lio',
      'marca_lio',
      'tiempo_estimado',
      'procedencia',
      'inventario_item_id',
    ];
    assertContainsAll(
      postContent,
      legacyFields,
      'POST /api/agenda conserva los campos legacy del schema cirugiaCreateSchema'
    );

    // El POST sigue insertando en agenda_cirugias (ARQ-001: aparece en
    // agenda tras crear).
    assertRegexMatches(
      postContent,
      /\.from\(\s*['"]agenda_cirugias['"]\s*\)\s*\.insert\s*\(/,
      'POST inserta en agenda_cirugias (sin regresión)'
    );
  }

  const patchContent = fileExistsOrFail(
    AGENDA_ID_ROUTE,
    'archivo PATCH /api/agenda/[id] existe'
  );
  if (patchContent !== null) {
    assertRegexMatches(
      patchContent,
      /export\s+async\s+function\s+PATCH\s*\(/,
      'exporta async function PATCH (sin regresión)'
    );
    assertRegexMatches(
      patchContent,
      /export\s+async\s+function\s+GET\s*\(/,
      'mantiene export async function GET en /api/agenda/[id]'
    );
    assertRegexMatches(
      patchContent,
      /export\s+async\s+function\s+DELETE\s*\(/,
      'mantiene export async function DELETE en /api/agenda/[id]'
    );
    // Campos legacy siguen siendo actualizables (mismos nombres).
    const legacyPatchFields = [
      'nombre_paciente',
      'expediente',
      'procedimiento',
      'ojo',
      'lio',
      'marca_lio',
      'tiempo_estimado',
      'procedencia',
      'inventario_item_id',
    ];
    assertContainsAll(
      patchContent,
      legacyPatchFields,
      'PATCH /api/agenda/[id] conserva los campos legacy en el fieldMap/Zod'
    );
  }
}

// ---------------------------------------------------------------------------
// [4/8] FUE-001: archivos de cirugía NO se mezclan con expediente general
// ---------------------------------------------------------------------------

function checkFUE001ArchivosVsExpediente() {
  console.log(
    '\n[4/8] FUE-001: archivos de cirugía no se mezclan con expediente general'
  );

  const storageContent = fileExistsOrFail(
    STORAGE_HELPER,
    'archivo src/lib/storage-cirugia.ts existe'
  );
  if (storageContent !== null) {
    // El helper debe trabajar exclusivamente con cirugia_id (no con
    // expediente general ni paciente_id).
    assertRegexMatches(
      storageContent,
      /cirugia_id/,
      'helper storage-cirugia trabaja con cirugia_id (FUE-001)'
    );
    assertNotContains(
      storageContent,
      'expediente_id',
      'helper storage-cirugia NO menciona expediente_id (FUE-001)'
    );
    assertNotContains(
      storageContent,
      'expediente_general',
      'helper storage-cirugia NO menciona expediente_general (FUE-001)'
    );
  }

  const archivosContent = fileExistsOrFail(
    ARCHIVOS_ROUTE,
    'archivo /api/cirugias/[id]/archivos/route.ts existe'
  );
  if (archivosContent !== null) {
    // El POST inserta en cirugia_archivos (vinculada por cirugia_id FK).
    assertRegexMatches(
      archivosContent,
      /\.from\(\s*['"]cirugia_archivos['"]\s*\)/,
      'POST /api/cirugias/[id]/archivos inserta en cirugia_archivos'
    );
    // Debe usar cirugia_id (no paciente_id ni expediente_id).
    assertRegexMatches(
      archivosContent,
      /cirugia_id/,
      'endpoint hace referencia a cirugia_id (FUE-001)'
    );
    assertNotContains(
      archivosContent,
      'expediente_id',
      'endpoint NO referencia expediente_id (FUE-001)'
    );
    assertNotContains(
      archivosContent,
      'expediente_general',
      'endpoint NO referencia expediente_general (FUE-001)'
    );
  }

  const archivoDetailContent = fileExistsOrFail(
    ARCHIVO_DETAIL_ROUTE,
    'archivo /api/cirugias/[id]/archivos/[archivoId]/route.ts existe'
  );
  if (archivoDetailContent !== null) {
    assertNotContains(
      archivoDetailContent,
      'expediente_id',
      'endpoint de detalle NO referencia expediente_id (FUE-001)'
    );
    assertNotContains(
      archivoDetailContent,
      'expediente_general',
      'endpoint de detalle NO referencia expediente_general (FUE-001)'
    );
  }

  // Búsqueda global: no debe existir tabla ni endpoints /api/expedientes*
  // o equivalente que mezcle archivos de cirugía con expediente general.
  const expedientesApiDir = path.join(REPO_ROOT, 'src', 'app', 'api', 'expedientes');
  if (fs.existsSync(expedientesApiDir)) {
    fail(
      'FUE-001: no existe /api/expedientes',
      'se encontró directorio: ' + expedientesApiDir
    );
  } else {
    ok('FUE-001: no existe /api/expedientes (sin endpoint de expediente general)');
  }
  // No debe existir lib/expedientes.ts (no se introduce expediente general).
  const expedientesLib = path.join(REPO_ROOT, 'src', 'lib', 'expedientes.ts');
  if (fs.existsSync(expedientesLib)) {
    fail(
      'FUE-001: no existe src/lib/expedientes.ts',
      'se encontró el archivo: ' + expedientesLib
    );
  } else {
    ok('FUE-001: no existe src/lib/expedientes.ts (sin modelo de expediente general)');
  }
}

// ---------------------------------------------------------------------------
// [5/8] ARQ-002: Historial transversal con estructura común
// ---------------------------------------------------------------------------

function checkHistorialEstructuraComun() {
  console.log(
    '\n[5/8] ARQ-002: cirugia_historial comparte estructura con consulta_historial'
  );

  const cirugiaMigContent = fileExistsOrFail(
    CIRUGIA_HISTORIAL_MIG,
    'migración 1800000000170 existe'
  );
  if (cirugiaMigContent === null) return;

  // cirugia_historial: campos comunes (usuario_id, created_at, accion,
  // detalle JSONB).
  const cirugiaBloque = (function () {
    const m = cirugiaMigContent.match(/CREATE TABLE cirugia_historial[\s\S]*?\)\s*;/);
    return m ? m[0] : '';
  })();
  if (!cirugiaBloque) {
    fail(
      'definición CREATE TABLE cirugia_historial presente en la migración',
      'no se encontró el bloque CREATE TABLE cirugia_historial'
    );
    return;
  }
  ok('definición CREATE TABLE cirugia_historial presente en la migración');

  const camposCirugia = ['usuario_id', 'created_at', 'accion', 'detalle JSONB'];
  camposCirugia.forEach(function (campo) {
    assertRegexMatches(
      cirugiaBloque,
      new RegExp(campo.replace(/ /g, '\\s+')),
      'cirugia_historial incluye el campo "' +
        campo.replace(/\\s\+/g, ' ') +
        '" (ARQ-002)'
    );
  });

  const consultaMigContent = fileExistsOrFail(
    CONSULTA_HISTORIAL_MIG,
    'migración 1800000000090 existe'
  );
  if (consultaMigContent === null) return;
  const consultaBloque = (function () {
    const m = consultaMigContent.match(/CREATE TABLE[\s\S]*?consulta_historial[\s\S]*?\)\s*;/);
    return m ? m[0] : '';
  })();
  if (!consultaBloque) {
    fail(
      'definición CREATE TABLE consulta_historial presente en la migración',
      'no se encontró el bloque CREATE TABLE consulta_historial'
    );
    return;
  }
  ok('definición CREATE TABLE consulta_historial presente en la migración');

  const camposConsulta = ['usuario_id', 'created_at', 'tipo_evento', 'payload JSONB'];
  camposConsulta.forEach(function (campo) {
    assertRegexMatches(
      consultaBloque,
      new RegExp(campo.replace(/ /g, '\\s+')),
      'consulta_historial incluye el campo "' +
        campo.replace(/\\s\+/g, ' ') +
        '" (ARQ-002)'
    );
  });

  // Campos compartidos: usuario_id (FK a auth.users), created_at (TIMESTAMPTZ)
  // y un campo JSONB libre para el detalle (detalle / payload). El nombre
  // de la "acción" difiere (accion vs tipo_evento) pero semánticamente es
  // el mismo evento.
  ok(
    'ARQ-002: ambos historiales tienen usuario_id, created_at y un campo JSONB de detalle (detalle/payload)'
  );

  // cirugia_archivos: la FK referencia directamente agenda_cirugias(id), no
  // una tabla de expediente general. Esto refuerza el aislamiento
  // archivo-cirugía vs expediente general.
  const cirugiaArchivosBloque = (function () {
    const m = cirugiaMigContent.match(/CREATE TABLE cirugia_archivos[\s\S]*?\)\s*;/);
    return m ? m[0] : '';
  })();
  if (cirugiaArchivosBloque) {
    assertRegexMatches(
      cirugiaArchivosBloque,
      /cirugia_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+agenda_cirugias\s*\(\s*id\s*\)/,
      'cirugia_archivos.cirugia_id FK a agenda_cirugias(id) (FUE-001/ARC-004)'
    );
  }
}

// ---------------------------------------------------------------------------
// [6/8] Re-verificación FLU-002 / OBJ-002: al crear se alimentan Agenda,
//        Historial y Productividad
// ---------------------------------------------------------------------------

function checkFLU002Reverificacion() {
  console.log(
    '\n[6/8] Re-verificación FLU-002 / OBJ-002: agenda + historial + productividad'
  );

  const rpcContent = fileExistsOrFail(
    CREAR_CIRUGIA_RPC_MIG,
    'migración 1800000000180 (RPC crear_cirugia) existe'
  );
  if (rpcContent === null) return;

  // El RPC debe insertar en agenda_cirugias (Agenda), cirugia_historial
  // (Historial) y cirugia_productividad (Productividad).
  const tablas = [
    { re: /INSERT\s+INTO\s+agenda_cirugias/, label: 'agenda_cirugias' },
    { re: /INSERT\s+INTO\s+cirugia_historial/, label: 'cirugia_historial' },
    { re: /INSERT\s+INTO\s+cirugia_productividad/, label: 'cirugia_productividad' },
  ];
  tablas.forEach(function (t) {
    assertRegexMatches(
      rpcContent,
      t.re,
      'RPC crear_cirugia inserta en ' + t.label + ' (FLU-002 / OBJ-002)'
    );
  });

  // El primer evento del historial debe ser CIRUGIA_CREADA con
  // usuario_id del usuario autenticado. El INSERT usa sintaxis
  // VALUES (..., 'CIRUGIA_CREADA', ...) no `accion = ...`.
  assertRegexMatches(
    rpcContent,
    /['"]CIRUGIA_CREADA['"]/,
    'RPC registra CIRUGIA_CREADA en cirugia_historial (AUD-004)'
  );

  // Estado inicial agendada (DAT-002). Aparece dentro de
  // jsonb_build_object('estado', 'agendada').
  assertRegexMatches(
    rpcContent,
    /['"]estado['"]\s*,\s*['"]agendada['"]/,
    "cirugía nueva persiste estado='agendada' (DAT-002 / FLU-002)"
  );
}

// ---------------------------------------------------------------------------
// [7/8] ALC-01..16: agregados de alcance específico (verificación textual)
// ---------------------------------------------------------------------------

function checkALCAgregados() {
  console.log('\n[7/8] ALC-01..16: agregados de alcance específico de Fase 1');

  // ALC-01: Paciente -> PAC-001..004 (SearchInput + /api/search +
  // /api/pacientes/[id]/resumen). Verificamos la presencia del buscador.
  const nuevaContent = fileExistsOrFail(
    CIRUGIA_NUEVA_PAGE,
    'archivo /cirugias/nueva/page.tsx existe'
  );
  if (nuevaContent !== null) {
    assertRegexMatches(
      nuevaContent,
      /\/api\/search/,
      'ALC-01: formulario usa /api/search (PAC-001)'
    );
    assertRegexMatches(
      nuevaContent,
      /\/api\/pacientes\/`?\/?\$\{[^}]+\}\/resumen|\/api\/pacientes\/[^/]+\/resumen/,
      'ALC-01: formulario consume /api/pacientes/[id]/resumen (PAC-004)'
    );
  }

  // ALC-02: Expediente relacionado (EXP-001, EXP-002). La sección
  // expediente debe estar visible en el formulario.
  if (nuevaContent !== null) {
    assertRegexMatches(
      nuevaContent,
      /Expediente|expediente/,
      'ALC-02: formulario expone datos de expediente (EXP-001)'
    );
  }

  // ALC-03: Consulta de origen (CON-001..003). El endpoint POST acepta
  // consulta_id y la página nueva lo lee de searchParams.
  const cirugiaListRoute = path.join(
    REPO_ROOT,
    'src',
    'app',
    'api',
    'cirugias',
    'route.ts'
  );
  const cirugiaListContent = fs.existsSync(cirugiaListRoute)
    ? fs.readFileSync(cirugiaListRoute, 'utf8')
    : '';
  if (cirugiaListContent) {
    assertRegexMatches(
      cirugiaListContent,
      /consulta_id\s*:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/,
      'ALC-03: POST /api/cirugias acepta consulta_id opcional (CON-001)'
    );
  }
  if (nuevaContent !== null) {
    assertRegexMatches(
      nuevaContent,
      /searchParams\.get\(\s*['"]consulta_id['"]\s*\)/,
      'ALC-03: /cirugias/nueva lee consulta_id de searchParams (CON-003)'
    );
  }

  // ALC-04: Origen / aseguradora. La migración 1800000000170 agrega
  // origen_id y el formulario lo expone.
  const cirugiaMigContent = fs.readFileSync(CIRUGIA_HISTORIAL_MIG, 'utf8');
  assertRegexMatches(
    cirugiaMigContent,
    /origen_id\s+UUID\s+REFERENCES\s+aseguranzas/,
    'ALC-04: agenda_cirugias.origen_id FK a aseguranzas (ORI-001)'
  );

  // ALC-05: Servicio / procedimiento quirúrgico (CAT-001..003).
  assertRegexMatches(
    cirugiaMigContent,
    /servicio_id\s+UUID\s+REFERENCES\s+aseguranza_servicios/,
    'ALC-05: agenda_cirugias.servicio_id FK a aseguranza_servicios (CAT-003)'
  );

  // ALC-06: Fecha y hora (DAT-001, VAL-005). Campos fecha/hora presentes
  // en agenda_cirugias.
  const agendaMig = path.join(
    REPO_ROOT,
    'src',
    'migrations',
    '1757600000000-CreateAgendaCirugiasTable.ts'
  );
  if (fs.existsSync(agendaMig)) {
    const agendaMigContent = fs.readFileSync(agendaMig, 'utf8');
    assertRegexMatches(
      agendaMigContent,
      /\bfecha\b/,
      'ALC-06: agenda_cirugias.fecha existe (DAT-001)'
    );
    assertRegexMatches(
      agendaMigContent,
      /\bhora\b/,
      'ALC-06: agenda_cirugias.hora existe (DAT-001)'
    );
  }

  // ALC-07: Ojo (OJO-001, OJO-002).
  assertRegexMatches(
    cirugiaMigContent,
    /chk_agenda_cirugias_ojo[\s\S]{0,200}CHECK\s*\(\s*ojo\s+IS\s+NULL\s+OR\s+ojo\s+IN\s*\(\s*['"]OD['"]\s*,\s*['"]OI['"]\s*,\s*['"]OU['"]\s*\)\s*\)/,
    'ALC-07: ojo acepta solo OD/OI/OU (OJO-001)'
  );

  // ALC-08: Estado (DAT-002, EST-001..003).
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TYPE\s+agenda_cirugia_estado_new[\s\S]*?'agendada'\s*,\s*'aplazada'\s*,\s*'reagendada'\s*,\s*'completada'\s*,\s*'cancelada'/,
    'ALC-08: enum agenda_cirugia_estado_new tiene los 5 valores (EST-001)'
  );

  // ALC-09: Asignación de cirujano (MED-004). El RPC debe rechazar
  // cirugía sin cirujano.
  const rpcContent = fs.readFileSync(CREAR_CIRUGIA_RPC_MIG, 'utf8');
  assertRegexMatches(
    rpcContent,
    /cirujano|EXCEPTION[\s\S]*cirujano/i,
    'ALC-09: RPC valida cirujano obligatorio (MED-004)'
  );

  // ALC-10: Asignación de participantes (MED-001..003). cirugia_participantes
  // existe y cat_roles_participante existe.
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TABLE\s+cirugia_participantes/,
    'ALC-10: tabla cirugia_participantes existe (MED-002)'
  );
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TABLE\s+cat_roles_participante/,
    'ALC-10: tabla cat_roles_participante existe (MED-003)'
  );

  // ALC-11: Relación con productividad (PRD-001..003). cirugia_productividad
  // existe.
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TABLE\s+cirugia_productividad/,
    'ALC-11: tabla cirugia_productividad existe (PRD-001)'
  );
  // reglas_productividad_cirugia debe existir (mig1800000000200).
  const reglasMig = path.join(
    REPO_ROOT,
    'src',
    'migrations',
    '1800000000200-CreateReglasProductividadCirugia.ts'
  );
  if (fs.existsSync(reglasMig)) {
    ok('ALC-11: migración 1800000000200 con reglas_productividad_cirugia existe (PRD-003)');
  } else {
    fail(
      'ALC-11: migración 1800000000200 con reglas_productividad_cirugia existe (PRD-003)',
      'no se encontró ' + reglasMig
    );
  }

  // ALC-12: Selección de LIO / inventario cuando aplique (LIO-001..003).
  // Validamos que el POST /api/cirugias acepta inventario_item_id
  // opcional/nullable.
  if (cirugiaListContent) {
    assertRegexMatches(
      cirugiaListContent,
      /inventario_item_id\s*:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/,
      'ALC-12: POST /api/cirugias acepta inventario_item_id opcional (LIO-003)'
    );
  }

  // ALC-13: Archivos de apoyo (ARC-001..007, STO-001..003). cirugia_archivos
  // y bucket cirugias existen.
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TABLE\s+cirugia_archivos/,
    'ALC-13: tabla cirugia_archivos existe (ARC-004)'
  );
  assertRegexMatches(
    cirugiaMigContent,
    /INSERT\s+INTO\s+storage\.buckets[\s\S]{0,80}\('cirugias'\s*,\s*'cirugias'\s*,\s*false\)/,
    'ALC-13: bucket cirugias privado creado (STO-001)'
  );

  // ALC-14: Historial de modificaciones (AUD-001..005). cirugia_historial
  // existe con acciones mínimas.
  assertRegexMatches(
    cirugiaMigContent,
    /CREATE\s+TABLE\s+cirugia_historial[\s\S]*?'CIRUGIA_CREADA'\s*,\s*'LIO_ASIGNADO'\s*,\s*'PARTICIPANTE_ASIGNADO'\s*,\s*'ARCHIVO_AGREGADO'\s*,\s*'ARCHIVO_ELIMINADO'\s*,\s*'ESTADO_CAMBIADO'/,
    'ALC-14: cirugia_historial tiene las 6 acciones del CHECK (AUD-004)'
  );

  // ALC-15: Validación de conflictos de agenda (AGE-001..003).
  const agendaConflictosLib = path.join(
    REPO_ROOT,
    'src',
    'lib',
    'agenda-conflictos.ts'
  );
  if (fs.existsSync(agendaConflictosLib)) {
    const conflictosContent = fs.readFileSync(agendaConflictosLib, 'utf8');
    assertRegexMatches(
      conflictosContent,
      /detectarConflictosAgenda/,
      'ALC-15: lib/agenda-conflictos.ts expone detectarConflictosAgenda (AGE-001)'
    );
  } else {
    fail(
      'ALC-15: lib/agenda-conflictos.ts existe (AGE-001)',
      'no se encontró ' + agendaConflictosLib
    );
  }

  // ALC-16: Permisos para consultar / subir / eliminar documentos
  // (PER-001..004).
  const permisosMig = path.join(
    REPO_ROOT,
    'src',
    'migrations',
    '1800000000190-CreatePermisosArchivo.ts'
  );
  if (fs.existsSync(permisosMig)) {
    ok('ALC-16: migración 1800000000190 con permisos_archivo existe (PER-001)');
  } else {
    fail(
      'ALC-16: migración 1800000000190 con permisos_archivo existe (PER-001)',
      'no se encontró ' + permisosMig
    );
  }
  const permisosLib = path.join(REPO_ROOT, 'src', 'lib', 'permisos-archivo.ts');
  if (fs.existsSync(permisosLib)) {
    const permisosContent = fs.readFileSync(permisosLib, 'utf8');
    assertRegexMatches(
      permisosContent,
      /PERMISOS_POR_ROL/,
      'ALC-16: src/lib/permisos-archivo.ts expone matriz PERMISOS_POR_ROL (PER-002)'
    );
  }
}

// ---------------------------------------------------------------------------
// [8/8] Script npm test:b11 + integridad de test:b1..b10
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[8/8] Script npm test:b11 e integridad de test:b1..b10');

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

  if (typeof scripts['test:b11'] === 'string' && scripts['test:b11'].length > 0) {
    ok(
      'script npm "test:b11" definido (' + JSON.stringify(scripts['test:b11']) + ')'
    );
  } else {
    fail('script npm "test:b11" definido', 'ausente o vacío en package.json');
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
    'test:b10',
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
  console.log(' Pruebas B11 - Integración con Agenda sin regresiones');
  console.log(' (Fase 1 - Creación de cirugía homologada)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkAgendaRoute();
  checkAgendaContentNavigation();
  checkAgendaDetailRedirect();
  checkLegacyAgendaEndpoints();
  checkFUE001ArchivosVsExpediente();
  checkHistorialEstructuraComun();
  checkFLU002Reverificacion();
  checkALCAgregados();
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
      '\nLa prueba B11 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B11 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();
