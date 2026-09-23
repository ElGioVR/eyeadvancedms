#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B2 (Helpers y servicios backend +
 * RPC `crear_cirugia` para Fase 1 de EyeAdvancedMS).
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente. NO conecta a Supabase/PostgreSQL ni
 * ejecuta migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B2:
 *   - Endpoint POST de cirugías (RBAC + Zod + RPC).
 *   - Migración del RPC `crear_cirugia` (validaciones + inserciones).
 *   - Traducciones de errores del RPC en `src/lib/supabase/errors.ts`.
 *   - Tipos `CirugiaCreateInput` y `CirugiaParticipanteInput`.
 *   - Registro de la migración en `scripts/run-migrations.js`.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación fallió (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'route.ts'
);
const MIGRATION_FILE = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000180-CreateCrearCirugiaRPC.ts'
);
const ERRORS_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'supabase',
  'errors.ts'
);
const TYPES_FILE = path.join(REPO_ROOT, 'src', 'types', 'cirugia.ts');
const RUN_MIGRATIONS_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'run-migrations.js'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

const MIGRATION_FILENAME = '1800000000180-CreateCrearCirugiaRPC.ts';

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1-migraciones.test.js)
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
  const missing = needles.filter((needle) => !content.includes(needle));
  if (missing.length === 0) {
    ok(groupLabel + ' (' + needles.length + ' elementos)');
    return true;
  }
  fail(
    groupLabel,
    'faltan: ' + missing.map((m) => JSON.stringify(m)).join(', ')
  );
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
// [1/5] Endpoint POST src/app/api/cirugias/route.ts
// ---------------------------------------------------------------------------

function checkRouteFile() {
  console.log(
    '\n[1/5] Endpoint POST: ' + path.relative(REPO_ROOT, ROUTE_FILE)
  );

  const content = fileExistsOrFail(ROUTE_FILE, 'archivo de endpoint existe');
  if (content === null) return;

  // 1. RBAC: requireAuth + requireRole con roles admin y recepcionista
  assertContainsAll(
    content,
    ['requireAuth', 'requireRole'],
    'importa y usa requireAuth + requireRole'
  );
  assertRegexMatches(
    content,
    /requireRole\s*\(\s*[^,]+,\s*\[\s*['"]admin['"]\s*,\s*['"]recepcionista['"]\s*\]\s*\)/,
    "requireRole llamado con ['admin', 'recepcionista']"
  );

  // 2. Esquema Zod: campos obligatorios del cuerpo
  const requiredFields = [
    'paciente_id',
    'origen_id',
    'servicio_id',
    'fecha',
    'hora',
    'duracion_min',
    'ojo',
    'participantes',
  ];
  assertContainsAll(
    content,
    requiredFields,
    'esquema Zod contiene los campos obligatorios (paciente_id, origen_id, servicio_id, fecha, hora, duracion_min, ojo, participantes)'
  );

  // 3. Validación de ojo como enum OD/OI/OU
  assertRegexMatches(
    content,
    /ojo\s*:\s*z\s*\.\s*enum\s*\(\s*\[\s*['"]OD['"]\s*,\s*['"]OI['"]\s*,\s*['"]OU['"]\s*\]\s*\)/,
    "ojo validado con z.enum(['OD', 'OI', 'OU'])"
  );

  // 4. participantes es array con mínimo 1
  assertRegexMatches(
    content,
    /participantes\s*:\s*z\s*\.\s*array\s*\([^)]+\)\s*\.min\s*\(\s*1\b/,
    'participantes es z.array(...).min(1, ...)'
  );

  // 5. Llamada al RPC crear_cirugia
  assertRegexMatches(
    content,
    /supabase\s*\.\s*rpc\s*\(\s*['"]crear_cirugia['"]/,
    "llama a supabase.rpc('crear_cirugia', ...)"
  );
}

// ---------------------------------------------------------------------------
// [2/5] Migración RPC src/migrations/1800000000180-CreateCrearCirugiaRPC.ts
// ---------------------------------------------------------------------------

function checkMigrationFile() {
  console.log(
    '\n[2/5] Migración RPC: ' + path.relative(REPO_ROOT, MIGRATION_FILE)
  );

  const content = fileExistsOrFail(MIGRATION_FILE, 'archivo de migración existe');
  if (content === null) return;

  // 1. Definición de la función
  assertContainsAll(
    content,
    ['CREATE OR REPLACE FUNCTION', 'crear_cirugia('],
    'define CREATE OR REPLACE FUNCTION crear_cirugia(...)'
  );

  // 2. Validaciones de paciente / origen / servicio / correspondencia
  assertContainsAll(
    content,
    [
      // Paciente existe
      'FROM pacientes',
      'El paciente seleccionado no existe',
    ],
    'validación de paciente (existe)'
  );
  assertContainsAll(
    content,
    [
      'FROM aseguranzas',
      'activo = true',
      'El origen seleccionado no existe o no está activo',
    ],
    'validación de origen (existe y activo)'
  );
  assertContainsAll(
    content,
    [
      'FROM aseguranza_servicios',
      'El servicio seleccionado no existe o no está activo',
    ],
    'validación de servicio (existe y activo)'
  );
  assertContainsAll(
    content,
    [
      "'PROCEDIMIENTO'",
      'El servicio seleccionado no es un procedimiento quirúrgico',
    ],
    'validación de servicio (es de tipo PROCEDIMIENTO)'
  );
  assertContainsAll(
    content,
    [
      "v_servicio_origen_id IS DISTINCT FROM p_origen_id",
      'El servicio no corresponde al origen seleccionado',
    ],
    'validación de correspondencia origen <-> servicio'
  );

  // 3. Validaciones de participantes (médico activo, rol activo, cirujano obligatorio)
  assertContainsAll(
    content,
    [
      "FROM doctores",
      'activo = true',
      'El médico seleccionado no existe o no está activo',
    ],
    'validación de médico (existe y activo)'
  );
  assertContainsAll(
    content,
    [
      'FROM cat_roles_participante',
      'El rol seleccionado no existe o no está activo',
    ],
    'validación de rol (existe y activo)'
  );
  assertContainsAll(
    content,
    [
      "clave = 'cirujano'",
      'Debe asignar al menos un cirujano',
    ],
    "validación de cirujano obligatorio (clave = 'cirujano')"
  );

  // 4. Validación de LIO disponible / no caducado
  assertContainsAll(
    content,
    [
      'FROM inventario_items',
      "'LENTE_INTRAOCULAR'",
      "'DISPONIBLE'",
      'fecha_caducidad',
      'CURRENT_DATE',
    ],
    "validación de LIO (tipo='LENTE_INTRAOCULAR', estado='DISPONIBLE', fecha_caducidad > CURRENT_DATE)"
  );

  // 5. Generación de código CIR-NNNNN
  assertRegexMatches(
    content,
    /'CIR-'\s*\|\|\s*LPAD\s*\(\s*v_seq\s*::\s*TEXT\s*,\s*5\s*,\s*'0'\s*\)/,
    "genera código 'CIR-' || LPAD(v_seq::TEXT, 5, '0')"
  );

  // 6. Inserción en agenda_cirugias con estado 'agendada'
  assertContainsAll(
    content,
    ['INSERT INTO agenda_cirugias', "'agendada'"],
    "INSERT en agenda_cirugias con estado 'agendada'"
  );

  // 7. Inserción en cirugia_participantes
  assertContainsAll(
    content,
    ['INSERT INTO cirugia_participantes'],
    'INSERT en cirugia_participantes'
  );

  // 8. Inserción en cirugia_productividad con estado PENDIENTE y monto NULL
  assertContainsAll(
    content,
    [
      'INSERT INTO cirugia_productividad',
      "'PENDIENTE'",
      'NULL',
    ],
    "INSERT en cirugia_productividad con estado 'PENDIENTE' y monto NULL"
  );

  // 9. Inserciones en cirugia_historial (CIRUGIA_CREADA, PARTICIPANTE_ASIGNADO, LIO_ASIGNADO)
  assertContainsAll(
    content,
    [
      'INSERT INTO cirugia_historial',
      "'CIRUGIA_CREADA'",
      "'PARTICIPANTE_ASIGNADO'",
      "'LIO_ASIGNADO'",
    ],
    "INSERT en cirugia_historial con CIRUGIA_CREADA, PARTICIPANTE_ASIGNADO y LIO_ASIGNADO"
  );
}

// ---------------------------------------------------------------------------
// [3/5] Traducciones de errores en src/lib/supabase/errors.ts
// ---------------------------------------------------------------------------

function checkErrorTranslations() {
  console.log(
    '\n[3/5] Traducciones de errores: ' +
      path.relative(REPO_ROOT, ERRORS_FILE)
  );

  const content = fileExistsOrFail(
    ERRORS_FILE,
    'archivo de traducciones existe'
  );
  if (content === null) return;

  // Mensajes del RPC que deben aparecer en el mapa errorTranslations.
  const requiredMessages = [
    'El paciente seleccionado no existe',
    'El origen seleccionado no existe o no está activo',
    'El servicio seleccionado no es un procedimiento quirúrgico',
    'El servicio no corresponde al origen seleccionado',
    'Debe asignar al menos un cirujano',
    'El LIO seleccionado no existe, no está disponible, está caducado o no tiene stock',
  ];

  const missing = requiredMessages.filter((msg) => !content.includes(msg));
  if (missing.length === 0) {
    ok(
      'errorTranslations contiene los mensajes clave del RPC (' +
        requiredMessages.length +
        ')'
    );
  } else {
    fail(
      'errorTranslations contiene los mensajes clave del RPC',
      'faltan: ' + missing.map((m) => JSON.stringify(m)).join(', ')
    );
  }
}

// ---------------------------------------------------------------------------
// [4/5] Tipos en src/types/cirugia.ts
// ---------------------------------------------------------------------------

function checkTypesFile() {
  console.log('\n[4/5] Tipos: ' + path.relative(REPO_ROOT, TYPES_FILE));

  const content = fileExistsOrFail(TYPES_FILE, 'archivo de tipos existe');
  if (content === null) return;

  // CirugiaCreateInput y CirugiaParticipanteInput exportados como interface
  // o re-exportados. Se acepta `export interface X`, `export type X` o
  // `export { X }`.
  const expectedSymbols = ['CirugiaCreateInput', 'CirugiaParticipanteInput'];
  const stillMissing = expectedSymbols.filter((symbol) => {
    const re = new RegExp(
      'export\\s+(?:type|interface)\\s+' + symbol + '\\b'
    );
    if (re.test(content)) return false;
    // también aceptar re-export `export { ..., Nombre, ... }`
    const reExport = new RegExp('export\\s*\\{[^}]*\\b' + symbol + '\\b[^}]*\\}');
    return !reExport.test(content);
  });

  if (stillMissing.length === 0) {
    ok(
      'CirugiaCreateInput y CirugiaParticipanteInput exportados (' +
        expectedSymbols.length +
        ' símbolos)'
    );
  } else {
    fail(
      'CirugiaCreateInput y CirugiaParticipanteInput exportados',
      'faltan: ' + stillMissing.map((s) => JSON.stringify(s)).join(', ')
    );
  }
}

// ---------------------------------------------------------------------------
// [5/5] Registro en scripts/run-migrations.js + package.json test:b2
// ---------------------------------------------------------------------------

function checkRunMigrationsAndPackageJson() {
  console.log(
    '\n[5/5] Registro de migración y scripts npm'
  );

  // 1. scripts/run-migrations.js contiene la migración
  const runContent = fileExistsOrFail(
    RUN_MIGRATIONS_FILE,
    'run-migrations.js existe'
  );
  if (runContent !== null) {
    if (runContent.includes("'" + MIGRATION_FILENAME + "'")) {
      ok("MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'");
    } else {
      fail(
        "MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'",
        'no se encontró la entrada exacta en el array'
      );
    }
  }

  // 2. package.json tiene el script test:b2 y NO se ha tocado test:b1
  const pkgContent = fileExistsOrFail(
    PACKAGE_JSON_FILE,
    'package.json existe'
  );
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

  if (typeof scripts['test:b2'] === 'string' && scripts['test:b2'].length > 0) {
    ok('script npm "test:b2" definido (' + JSON.stringify(scripts['test:b2']) + ')');
  } else {
    fail('script npm "test:b2" definido', 'ausente o vacío en package.json');
  }

  // Garantía: no se ha tocado test:b1
  if (typeof scripts['test:b1'] === 'string') {
    ok('script npm "test:b1" intacto (' + JSON.stringify(scripts['test:b1']) + ')');
  } else {
    fail('script npm "test:b1" intacto', 'ausente en package.json');
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B2 - Creación de cirugía homologada (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkRouteFile();
  checkMigrationFile();
  checkErrorTranslations();
  checkTypesFile();
  checkRunMigrationsAndPackageJson();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach((f, i) => {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B2 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log('\nLa prueba B2 PASÓ. Todos los elementos obligatorios están presentes.');
  process.exit(0);
}

main();
