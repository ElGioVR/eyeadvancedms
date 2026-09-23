#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B3 (Conflictos de agenda) de Fase 1
 * (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente. NO conecta a Supabase/PostgreSQL ni
 * ejecuta migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B3:
 *   - Servicio src/lib/agenda-conflictos.ts con la función
 *     detectarConflictosAgenda y la interfaz ConflictoAgenda, que consulta
 *     las 4 fuentes de agenda (consultas, consulta_conceptos,
 *     agenda_cirugias y cirugia_participantes, más cruce por recurso_id).
 *   - Integración en src/app/api/cirugias/route.ts: importa el servicio,
 *     invoca la detección con los argumentos correctos, responde HTTP 409
 *     con { error: 'Conflicto de agenda', conflictos } y sólo después
 *     llama a supabase.rpc('crear_cirugia', ...).
 *   - Tipo ConflictoAgenda exportado (en el servicio o en src/types/cirugia.ts).
 *   - Script npm "test:b3" en package.json (sin tocar test:b1 ni test:b2).
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación fallió (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SERVICE_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'agenda-conflictos.ts'
);
const ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'route.ts'
);
const TYPES_FILE = path.join(REPO_ROOT, 'src', 'types', 'cirugia.ts');
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1/b2)
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
// [1/4] Servicio src/lib/agenda-conflictos.ts
// ---------------------------------------------------------------------------

function checkServiceFile() {
  console.log(
    '\n[1/4] Servicio de conflictos: ' +
      path.relative(REPO_ROOT, SERVICE_FILE)
  );

  const content = fileExistsOrFail(SERVICE_FILE, 'archivo de servicio existe');
  if (content === null) return;

  // 1. Exporta la función detectarConflictosAgenda
  assertRegexMatches(
    content,
    /export\s+(?:async\s+)?function\s+detectarConflictosAgenda\b/,
    'exporta function detectarConflictosAgenda'
  );

  // 2. Exporta la interfaz/tipo ConflictoAgenda
  assertRegexMatches(
    content,
    /export\s+interface\s+ConflictoAgenda\b/,
    'exporta interface ConflictoAgenda'
  );

  // 3. Consulta tabla `consultas` por doctor_id, fecha, hora_inicio/hora_fin
  assertContainsAll(
    content,
    [
      ".from('consultas')",
      ".eq('fecha'",
      ".in('doctor_id'",
      'hora_inicio',
      'hora_fin',
    ],
    'consulta tabla consultas (doctor_id, fecha, hora_inicio, hora_fin)'
  );

  // 4. Consulta `consulta_conceptos` con join a `consultas!inner` y
  //    tipo_concepto IN ('ESTUDIO','PROCEDIMIENTO')
  assertContainsAll(
    content,
    [
      ".from('consulta_conceptos')",
      'consultas!inner',
      ".in('tipo_concepto'",
      "'ESTUDIO'",
      "'PROCEDIMIENTO'",
    ],
    "consulta consulta_conceptos con join consultas!inner y filtro tipo_concepto IN ('ESTUDIO','PROCEDIMIENTO')"
  );

  // 5. Consulta `agenda_cirugias` por doctor_id excluyendo estado='cancelada'
  assertContainsAll(
    content,
    [
      ".from('agenda_cirugias')",
      ".eq('fecha'",
      ".in('doctor_id'",
      ".neq('estado', 'cancelada')",
    ],
    "consulta agenda_cirugias por doctor_id excluyendo estado='cancelada' (cirujano principal legacy)"
  );

  // 6. Consulta `cirugia_participantes` con join agenda_cirugias!inner y
  //    filtro por medico_id
  assertContainsAll(
    content,
    [
      ".from('cirugia_participantes')",
      ".in('medico_id'",
      'agenda_cirugias!inner',
    ],
    'consulta cirugia_participantes con join agenda_cirugias!inner por medico_id'
  );

  // 7. Consulta `agenda_cirugias` por recurso_id (AGE-002)
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]recurso_id['"]\s*,\s*recurso_id\s*\)/,
    'consulta agenda_cirugias por recurso_id (AGE-002)'
  );
}

// ---------------------------------------------------------------------------
// [2/4] Endpoint src/app/api/cirugias/route.ts
// ---------------------------------------------------------------------------

function checkRouteFile() {
  console.log(
    '\n[2/4] Endpoint de creación: ' + path.relative(REPO_ROOT, ROUTE_FILE)
  );

  const content = fileExistsOrFail(ROUTE_FILE, 'archivo de endpoint existe');
  if (content === null) return;

  // 1. Importa detectarConflictosAgenda desde @/lib/agenda-conflictos
  assertRegexMatches(
    content,
    /from\s+['"]@\/lib\/agenda-conflictos['"]/,
    "importa desde '@/lib/agenda-conflictos'"
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bdetectarConflictosAgenda\b[^}]*\}\s*from\s*['"]@\/lib\/agenda-conflictos['"]/,
    'importa detectarConflictosAgenda (named import)'
  );

  // 2. Llama a la función con fecha, hora, duracion_min, medicos y recurso_id.
  //    Se acepta tanto la sintaxis `clave: valor` como la shorthand ES6
  //    `clave,` (e.g. `medicos,` cuando la clave coincide con la variable).
  assertRegexMatches(
    content,
    /detectarConflictosAgenda\s*\(\s*\{[\s\S]*?\bfecha\s*[:,\n]/,
    'llamada incluye campo fecha'
  );
  assertRegexMatches(
    content,
    /detectarConflictosAgenda\s*\(\s*\{[\s\S]*?\bhora\s*[:,\n]/,
    'llamada incluye campo hora'
  );
  assertRegexMatches(
    content,
    /detectarConflictosAgenda\s*\(\s*\{[\s\S]*?\bduracion_min\s*[:,\n]/,
    'llamada incluye campo duracion_min'
  );
  assertRegexMatches(
    content,
    /detectarConflictosAgenda\s*\(\s*\{[\s\S]*?\bmedicos\s*[:,\n]/,
    'llamada incluye campo medicos'
  );
  assertRegexMatches(
    content,
    /detectarConflictosAgenda\s*\(\s*\{[\s\S]*?\brecurso_id\s*[:,\n]/,
    'llamada incluye campo recurso_id'
  );

  // 3. Retorna HTTP 409 con { error: 'Conflicto de agenda', conflictos }
  assertRegexMatches(
    content,
    /status\s*:\s*409/,
    'respuesta con status 409'
  );
  assertRegexMatches(
    content,
    /\{\s*error\s*:\s*['"]Conflicto de agenda['"]\s*,\s*conflictos\s*\}/,
    "cuerpo { error: 'Conflicto de agenda', conflictos }"
  );

  // 4. Sigue llamando a supabase.rpc('crear_cirugia', ...) después del chequeo
  assertRegexMatches(
    content,
    /supabase\s*\.\s*rpc\s*\(\s*['"]crear_cirugia['"]/,
    "llama a supabase.rpc('crear_cirugia', ...)"
  );

  // Verificación de orden: la llamada a detectarConflictosAgenda debe
  // aparecer ANTES que la llamada al RPC crear_cirugia.
  const idxConflictCall = content.indexOf('detectarConflictosAgenda(');
  const idxRpcCall = content.indexOf("rpc('crear_cirugia'");
  if (idxConflictCall === -1 || idxRpcCall === -1) {
    fail(
      "detectarConflictosAgenda() se invoca ANTES de rpc('crear_cirugia')",
      'no se localizaron ambas llamadas en el archivo'
    );
  } else if (idxConflictCall < idxRpcCall) {
    ok("detectarConflictosAgenda() se invoca ANTES de rpc('crear_cirugia')");
  } else {
    fail(
      "detectarConflictosAgenda() se invoca ANTES de rpc('crear_cirugia')",
      'orden invertido: idxConflict=' +
        idxConflictCall +
        ' idxRpc=' +
        idxRpcCall
    );
  }
}

// ---------------------------------------------------------------------------
// [3/4] Tipo ConflictoAgenda exportado (servicio o types/cirugia.ts)
// ---------------------------------------------------------------------------

function checkConflictoAgendaType() {
  console.log('\n[3/4] Tipo ConflictoAgenda exportado');

  let exportedFrom = null;

  // Buscar en el servicio (camino principal verificado en B3)
  if (fs.existsSync(SERVICE_FILE)) {
    const svc = fs.readFileSync(SERVICE_FILE, 'utf8');
    if (/export\s+interface\s+ConflictoAgenda\b/.test(svc)) {
      exportedFrom = path.relative(REPO_ROOT, SERVICE_FILE);
    }
  }

  // Buscar en src/types/cirugia.ts (alternativa aceptada por requisito 4)
  if (!exportedFrom && fs.existsSync(TYPES_FILE)) {
    const typesContent = fs.readFileSync(TYPES_FILE, 'utf8');
    const re = new RegExp(
      'export\\s+(?:type|interface)\\s+ConflictoAgenda\\b'
    );
    const reExport = new RegExp(
      'export\\s*\\{[^}]*\\bConflictoAgenda\\b[^}]*\\}'
    );
    if (re.test(typesContent) || reExport.test(typesContent)) {
      exportedFrom = path.relative(REPO_ROOT, TYPES_FILE);
    }
  }

  if (exportedFrom) {
    ok('ConflictoAgenda exportado (' + exportedFrom + ')');
  } else {
    fail(
      'ConflictoAgenda exportado',
      'no se halló export interface/type ConflictoAgenda en src/lib/agenda-conflictos.ts ni en src/types/cirugia.ts'
    );
  }
}

// ---------------------------------------------------------------------------
// [4/4] Script npm test:b3 en package.json (sin tocar test:b1 ni test:b2)
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[4/4] Scripts npm y registro de test:b3');

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

  // 1. test:b3 definido
  if (
    typeof scripts['test:b3'] === 'string' &&
    scripts['test:b3'].length > 0
  ) {
    ok(
      'script npm "test:b3" definido (' +
        JSON.stringify(scripts['test:b3']) +
        ')'
    );
  } else {
    fail('script npm "test:b3" definido', 'ausente o vacío en package.json');
  }

  // 2. Garantía: test:b1 y test:b2 intactos (presentes y no vacíos)
  if (typeof scripts['test:b1'] === 'string' && scripts['test:b1'].length > 0) {
    ok(
      'script npm "test:b1" intacto (' +
        JSON.stringify(scripts['test:b1']) +
        ')'
    );
  } else {
    fail('script npm "test:b1" intacto', 'ausente o vacío en package.json');
  }

  if (typeof scripts['test:b2'] === 'string' && scripts['test:b2'].length > 0) {
    ok(
      'script npm "test:b2" intacto (' +
        JSON.stringify(scripts['test:b2']) +
        ')'
    );
  } else {
    fail('script npm "test:b2" intacto', 'ausente o vacío en package.json');
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B3 - Conflictos de agenda (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkServiceFile();
  checkRouteFile();
  checkConflictoAgendaType();
  checkPackageJson();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach((f, i) => {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B3 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B3 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();