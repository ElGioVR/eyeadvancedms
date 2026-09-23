#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B1 (Creación de cirugía homologada).
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente. NO conecta a Supabase/PostgreSQL ni
 * ejecuta migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B1.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación falló (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_FILE = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000170-CreateCirugiaHomologadaTables.ts'
);
const TYPES_FILE = path.join(REPO_ROOT, 'src', 'types', 'cirugia.ts');
const RUN_MIGRATIONS_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'run-migrations.js'
);
const MIGRATION_FILENAME = '1800000000170-CreateCirugiaHomologadaTables.ts';

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

/**
 * Verifica que `content` contenga TODOS los `needles` (búsqueda textual).
 * Si alguno falta, marca la verificación como fallida y devuelve false.
 */
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

/**
 * Verifica que `content` contenga AL MENOS UNO de los `needles`.
 */
function assertContainsAny(content, needles, groupLabel) {
  const present = needles.filter((needle) => content.includes(needle));
  if (present.length > 0) {
    ok(
      groupLabel +
        ' (encontrado: ' +
        present.map((p) => JSON.stringify(p)).join(', ') +
        ')'
    );
    return true;
  }
  fail(
    groupLabel,
    'ninguno presente, se esperaba uno de: ' +
      needles.map((n) => JSON.stringify(n)).join(', ')
  );
  return false;
}

// ---------------------------------------------------------------------------
// Verificaciones
// ---------------------------------------------------------------------------

function checkMigrationFile() {
  console.log('\n[1/4] Migración B1: ' + path.relative(REPO_ROOT, MIGRATION_FILE));

  if (!fs.existsSync(MIGRATION_FILE)) {
    fail('archivo de migración existe', MIGRATION_FILE);
    return null;
  }
  ok('archivo de migración existe');

  const content = fs.readFileSync(MIGRATION_FILE, 'utf8');

  // 1. Enum de estado con 'reagendada' (extensión o creación con ese valor)
  assertContainsAll(
    content,
    ["'reagendada'"],
    "enum agenda_cirugia_estado contiene 'reagendada'"
  );

  // 2. Tabla cat_ojos con códigos OD/OI/OU
  assertContainsAll(
    content,
    ['CREATE TABLE cat_ojos', "'OD'", "'OI'", "'OU'"],
    'tabla cat_ojos con códigos OD/OI/OU'
  );

  // 3. Tabla cat_roles_participante con claves requeridas
  assertContainsAll(
    content,
    [
      'CREATE TABLE cat_roles_participante',
      "'cirujano'",
      "'ayudante'",
      "'anestesiologo'",
    ],
    "tabla cat_roles_participante con claves cirujano/ayudante/anestesiologo"
  );

  // 4. Tabla cat_recursos con tipo QUIROFANO
  assertContainsAll(
    content,
    ['CREATE TABLE cat_recursos', "'QUIROFANO'"],
    'tabla cat_recursos con tipo QUIROFANO'
  );

  // 5. Columnas añadidas a agenda_cirugias
  assertContainsAll(
    content,
    [
      'ADD COLUMN IF NOT EXISTS origen_id',
      'ADD COLUMN IF NOT EXISTS servicio_id',
      'ADD COLUMN IF NOT EXISTS codigo',
      'ADD COLUMN IF NOT EXISTS duracion_min',
      'ADD COLUMN IF NOT EXISTS recurso_id',
      'ADD COLUMN IF NOT EXISTS created_by',
    ],
    'columnas extendidas en agenda_cirugias (origen_id, servicio_id, codigo, duracion_min, recurso_id, created_by)'
  );

  // 6. Tabla cirugia_participantes
  assertContainsAll(
    content,
    ['CREATE TABLE cirugia_participantes'],
    'tabla cirugia_participantes'
  );

  // 7. Tabla cirugia_productividad con PENDIENTE por defecto
  assertContainsAll(
    content,
    [
      'CREATE TABLE cirugia_productividad',
      "DEFAULT 'PENDIENTE'",
    ],
    'tabla cirugia_productividad con estado PENDIENTE por defecto'
  );

  // 8. Tabla cirugia_archivos con deleted_at y deleted_by
  assertContainsAll(
    content,
    [
      'CREATE TABLE cirugia_archivos',
      'deleted_at TIMESTAMPTZ',
      'deleted_by UUID',
    ],
    'tabla cirugia_archivos con deleted_at y deleted_by'
  );

  // 9. Tabla cirugia_historial con acciones requeridas
  assertContainsAll(
    content,
    [
      'CREATE TABLE cirugia_historial',
      "'CIRUGIA_CREADA'",
      "'LIO_ASIGNADO'",
      "'PARTICIPANTE_ASIGNADO'",
      "'ARCHIVO_AGREGADO'",
      "'ARCHIVO_ELIMINADO'",
      "'ESTADO_CAMBIADO'",
    ],
    'tabla cirugia_historial con acciones requeridas'
  );

  // 10. Bucket 'cirugias' en storage.buckets
  assertContainsAll(
    content,
    ['INSERT INTO storage.buckets', "'cirugias'"],
    "bucket 'cirugias' en storage.buckets"
  );

  return content;
}

function checkTypesFile() {
  console.log('\n[2/4] Tipos: ' + path.relative(REPO_ROOT, TYPES_FILE));

  if (!fs.existsSync(TYPES_FILE)) {
    fail('archivo de tipos existe', TYPES_FILE);
    return;
  }
  ok('archivo de tipos existe');

  const content = fs.readFileSync(TYPES_FILE, 'utf8');

  // Debe exportar al menos las interfaces/tipos esperados.
  // TypeScript admite `export type X`, `export interface X` o `export { X }`.
  const expectedSymbols = [
    'CodigoOjo',
    'CatOjo',
    'CatRolParticipante',
    'CatRecurso',
    'CirugiaParticipante',
    'CirugiaProductividad',
    'CirugiaArchivo',
    'CirugiaHistorial',
    'CirugiaHistorialAccion',
    'CirugiaProductividadEstado',
  ];

  const stillMissing = expectedSymbols.filter((symbol) => {
    const re = new RegExp(
      'export\\s+(?:type|interface)\\s+' + symbol + '\\b'
    );
    return !re.test(content);
  });

  if (stillMissing.length === 0) {
    ok(
      'tipos/interfaces exportados en cirugia.ts (' +
        expectedSymbols.length +
        ' símbolos)'
    );
  } else {
    fail(
      'tipos/interfaces exportados en cirugia.ts',
      'faltan: ' + stillMissing.map((s) => JSON.stringify(s)).join(', ')
    );
  }

  // Además, los valores del enum de acciones y estados deben estar reflejados.
  assertContainsAll(
    content,
    [
      "'PENDIENTE'",
      "'CIRUGIA_CREADA'",
      "'LIO_ASIGNADO'",
      "'PARTICIPANTE_ASIGNADO'",
      "'ARCHIVO_AGREGADO'",
      "'ARCHIVO_ELIMINADO'",
      "'ESTADO_CAMBIADO'",
      "'OD'",
      "'OI'",
      "'OU'",
    ],
    'valores de literales exportados en cirugia.ts'
  );
}

function checkRunMigrationsScript() {
  console.log(
    '\n[3/4] Registro de migración en scripts/run-migrations.js'
  );

  if (!fs.existsSync(RUN_MIGRATIONS_FILE)) {
    fail('run-migrations.js existe', RUN_MIGRATIONS_FILE);
    return;
  }
  ok('run-migrations.js existe');

  const content = fs.readFileSync(RUN_MIGRATIONS_FILE, 'utf8');

  // La migración debe aparecer dentro del array MIGRATION_ORDER.
  if (content.includes("'" + MIGRATION_FILENAME + "'")) {
    ok(
      "MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'"
    );
  } else {
    fail(
      "MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'",
      'no se encontró la entrada exacta en el array'
    );
  }
}

function checkOptionalImportInTypesIndex() {
  console.log('\n[4/4] Re-export opcional desde src/types/index.ts');

  const typesIndex = path.join(REPO_ROOT, 'src', 'types', 'index.ts');
  if (!fs.existsSync(typesIndex)) {
    fail('src/types/index.ts existe', typesIndex);
    return;
  }
  ok('src/types/index.ts existe');

  const content = fs.readFileSync(typesIndex, 'utf8');

  // No es estrictamente obligatorio re-exportar desde index.ts, pero
  // documentamos el estado. Consideramos PASS si el archivo existe; WARN
  // si no hay ninguna referencia a los símbolos de cirugia.
  const symbolsToLookFor = ['CatOjo', 'CirugiaArchivo', 'reagendada'];
  const present = symbolsToLookFor.filter((s) => content.includes(s));
  if (present.length === 0) {
    console.log(
      '  · nota: src/types/index.ts no referencia símbolos de cirugia.ts (no obligatorio)'
    );
  } else {
    ok(
      'src/types/index.ts referencia símbolos de cirugia (' +
        present.join(', ') +
        ')'
    );
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B1 - Creación de cirugía homologada (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkMigrationFile();
  checkTypesFile();
  checkRunMigrationsScript();
  checkOptionalImportInTypesIndex();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach((f, i) => {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B1 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log('\nLa prueba B1 PASÓ. Todos los elementos obligatorios están presentes.');
  process.exit(0);
}

main();
