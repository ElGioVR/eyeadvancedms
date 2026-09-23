#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B4 (Estados y transiciones de
 * cirugía + motivo obligatorio + historial ESTADO_CAMBIADO) de Fase 1
 * (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente. NO conecta a Supabase/PostgreSQL ni
 * ejecuta migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B4:
 *
 *   - Servicio src/lib/cirugia-estados.ts:
 *       * exporta `type CirugiaEstado`
 *       * exporta `TRANSICIONES_VALIDAS` (mapa con los 5 estados)
 *       * exporta `esTransicionValida(de, a)`
 *       * valida/agenda, reagendada, aplazada, cancelada, completada
 *
 *   - Endpoint src/app/api/agenda/[id]/route.ts (PATCH):
 *       * importa `esTransicionValida` desde `@/lib/cirugia-estados`
 *       * el enum Zod de `estado` incluye los 5 valores
 *       * incluye campo `motivo` en el esquema
 *       * llama a `esTransicionValida` para validar la transición
 *       * responde 400 si la transición no es válida
 *       * responde 400 si falta `motivo` al cambiar estado
 *       * tras actualizar inserta en `cirugia_historial` con
 *         `accion: 'ESTADO_CAMBIADO'` y `detalle: { de, a, motivo }`
 *
 *   - Script npm `test:b4` en package.json (sin tocar test:b1/b2/b3).
 *
 * Adicionalmente, el bloque [1/4] ejecuta un mini-runtime que carga
 * `cirugia-estados.ts` (transpilando tipos con regex + `vm.runInContext`)
 * para verificar el comportamiento real de `esTransicionValida` con los
 * casos de la especificación.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación falló (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SERVICE_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'cirugia-estados.ts'
);
const ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'agenda',
  '[id]',
  'route.ts'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1/b2/b3)
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
// Transpilador mínimo TS -> JS (sólo lo que usa cirugia-estados.ts)
// ---------------------------------------------------------------------------
//
// cirugia-estados.ts no importa nada externo; usa únicamente:
//   - `export type X = ...;` (borrar)
//   - `export const X: Type = {...};` (strip de la anotación de tipo)
//   - `export function f(p: T, q: U): R { ... }` (strip de tipos en args/return)
//
// La estrategia es regex-driven y limitada a ese patrón; si en el futuro el
// archivo agrega sintaxis TS más compleja (genéricos, tipos condicionales,
// etc.), este transpilador deberá extenderse. Ante cualquier fallo, el
// bloque [1/4] reportará la falla y continuará con aserciones estáticas.

function transpileCirugiaEstados(content) {
  let js = content;

  // 1. Borrar declaraciones `export type X = ...;` (la RHS es una union
  //    u otro type, así que termina en `;` y no contiene `=` después).
  js = js.replace(/export\s+type\s+[A-Za-z_$][\w$]*\s*=[^;]*;/g, '');

  // 2. Convertir `export const X: T = EXPR;` en `const X = EXPR;`.
  //    El tipo no contiene `=`, por eso `[^=]+` lo captura de forma segura.
  js = js.replace(
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*:[^=]+=\s*/g,
    'const $1 = '
  );

  // 3. Convertir `export function NAME(PARAMS): RETURNTYPE {` en
  //    `function NAME(CLEAN_PARAMS) {`.  Limpiamos las anotaciones de tipo
  //    de cada parámetro (cualquier cosa tras `:` hasta la próxima `,`).
  js = js.replace(
    /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*[^{]+\{/g,
    function (_match, name, params) {
      const cleaned = params
        .split(',')
        .map(function (p) {
          const idx = p.indexOf(':');
          return (idx === -1 ? p : p.substring(0, idx)).trim();
        })
        .filter(function (p) {
          return p.length > 0;
        })
        .join(', ');
      return 'function ' + name + '(' + cleaned + ') {';
    }
  );

  return js;
}

function loadCirugiaEstadosModule() {
  const content = fs.readFileSync(SERVICE_FILE, 'utf8');
  const js = transpileCirugiaEstados(content);

  const exportsObj = {};
  const sandbox = {
    module: { exports: exportsObj },
    exports: exportsObj,
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);

  const shim =
    '\nmodule.exports = {' +
    '  TRANSICIONES_VALIDAS: TRANSICIONES_VALIDAS,' +
    '  esTransicionValida: esTransicionValida,' +
    '  estadosValidos: typeof estadosValidos === \'function\' ? estadosValidos : null' +
    '};';

  vm.runInContext(js + shim, sandbox, { filename: 'cirugia-estados.transpiled.js' });
  return sandbox.module.exports;
}

// ---------------------------------------------------------------------------
// [1/4] Servicio src/lib/cirugia-estados.ts
// ---------------------------------------------------------------------------

function checkServiceFile() {
  console.log(
    '\n[1/4] Servicio de estados: ' +
      path.relative(REPO_ROOT, SERVICE_FILE)
  );

  // --- Aserciones estáticas ------------------------------------------------

  const content = fileExistsOrFail(SERVICE_FILE, 'archivo de servicio existe');
  if (content === null) return;

  // 1. Exporta type CirugiaEstado con los 5 valores
  assertRegexMatches(
    content,
    /export\s+type\s+CirugiaEstado\b/,
    'exporta type CirugiaEstado'
  );
  const expectedEstados = [
    "'agendada'",
    "'aplazada'",
    "'reagendada'",
    "'completada'",
    "'cancelada'",
  ];
  const missingEstados = expectedEstados.filter(function (e) {
    return !content.includes(e);
  });
  if (missingEstados.length === 0) {
    ok('CirugiaEstado enumera los 5 estados (' + expectedEstados.length + ')');
  } else {
    fail(
      'CirugiaEstado enumera los 5 estados',
      'faltan: ' + missingEstados.map(function (m) { return JSON.stringify(m); }).join(', ')
    );
  }

  // 2. Exporta TRANSICIONES_VALIDAS
  assertRegexMatches(
    content,
    /export\s+const\s+TRANSICIONES_VALIDAS\b/,
    'exporta const TRANSICIONES_VALIDAS'
  );

  // 3. Mapa contiene las 5 claves
  const expectedKeys = ['agendada:', 'reagendada:', 'aplazada:', 'cancelada:', 'completada:'];
  assertContainsAll(
    content,
    expectedKeys,
    'TRANSICIONES_VALIDAS contiene los 5 estados como clave'
  );

  // 4. agendada -> [reagendada, aplazada, cancelada, completada]
  assertRegexMatches(
    content,
    /agendada\s*:\s*\[\s*['"]reagendada['"]\s*,\s*['"]aplazada['"]\s*,\s*['"]cancelada['"]\s*,\s*['"]completada['"]\s*\]/,
    "agendada -> ['reagendada','aplazada','cancelada','completada']"
  );

  // 5. reagendada -> [agendada]
  assertRegexMatches(
    content,
    /reagendada\s*:\s*\[\s*['"]agendada['"]\s*\]/,
    "reagendada -> ['agendada']"
  );

  // 6. aplazada, cancelada, completada -> []  (estados terminales)
  assertRegexMatches(
    content,
    /aplazada\s*:\s*\[\s*\]/,
    'aplazada -> [] (estado terminal)'
  );
  assertRegexMatches(
    content,
    /cancelada\s*:\s*\[\s*\]/,
    'cancelada -> [] (estado terminal)'
  );
  assertRegexMatches(
    content,
    /completada\s*:\s*\[\s*\]/,
    'completada -> [] (estado terminal)'
  );

  // 7. Exporta la función esTransicionValida
  assertRegexMatches(
    content,
    /export\s+function\s+esTransicionValida\b/,
    'exporta function esTransicionValida'
  );

  // --- Aserciones de runtime (cargar y ejecutar) --------------------------

  let mod;
  try {
    mod = loadCirugiaEstadosModule();
  } catch (e) {
    fail(
      'cargar cirugia-estados en runtime',
      'transpile/eval falló: ' + e.message
    );
    return;
  }
  ok('cargar cirugia-estados en runtime');

  if (
    !mod ||
    typeof mod.TRANSICIONES_VALIDAS !== 'object' ||
    mod.TRANSICIONES_VALIDAS === null ||
    typeof mod.esTransicionValida !== 'function'
  ) {
    fail(
      'exports del módulo cargados',
      'TRANSICIONES_VALIDAS o esTransicionValida no están presentes'
    );
    return;
  }
  ok('exports del módulo cargados (TRANSICIONES_VALIDAS + esTransicionValida)');

  // Verificar que las 5 claves del mapa existen en runtime
  const runtimeKeys = Object.keys(mod.TRANSICIONES_VALIDAS);
  const allFive = ['agendada', 'reagendada', 'aplazada', 'cancelada', 'completada'];
  const missingKeys = allFive.filter(function (k) {
    return !Object.prototype.hasOwnProperty.call(mod.TRANSICIONES_VALIDAS, k);
  });
  if (missingKeys.length === 0) {
    ok(
      'TRANSICIONES_VALIDAS tiene las 5 claves en runtime (' +
        allFive.length +
        ')'
    );
  } else {
    fail(
      'TRANSICIONES_VALIDAS tiene las 5 claves en runtime',
      'faltan: ' + missingKeys.join(', ')
    );
  }

  // Verificar contenido de cada lista
  const expectedRuntime = {
    agendada: ['reagendada', 'aplazada', 'cancelada', 'completada'],
    reagendada: ['agendada'],
    aplazada: [],
    cancelada: [],
    completada: [],
  };
  Object.keys(expectedRuntime).forEach(function (k) {
    const got = mod.TRANSICIONES_VALIDAS[k];
    const want = expectedRuntime[k];
    const same =
      Array.isArray(got) &&
      got.length === want.length &&
      want.every(function (v, i) {
        return got[i] === v;
      });
    if (same) {
      ok('TRANSICIONES_VALIDAS[' + JSON.stringify(k) + '] = ' + JSON.stringify(got));
    } else {
      fail(
        'TRANSICIONES_VALIDAS[' + JSON.stringify(k) + '] correcto',
        'esperado ' + JSON.stringify(want) + ', obtuvo ' + JSON.stringify(got)
      );
    }
  });
}

// ---------------------------------------------------------------------------
// [2/4] Lógica de transiciones (runtime: esTransicionValida)
// ---------------------------------------------------------------------------

function checkTransitionLogic() {
  console.log('\n[2/4] Lógica de transiciones (runtime)');

  let mod;
  try {
    mod = loadCirugiaEstadosModule();
  } catch (e) {
    fail(
      'cargar cirugia-estados en runtime',
      'transpile/eval falló: ' + e.message
    );
    return;
  }
  if (
    !mod ||
    typeof mod.esTransicionValida !== 'function'
  ) {
    fail(
      'cargar cirugia-estados en runtime',
      'esTransicionValida no está disponible'
    );
    return;
  }

  // Casos válidos de la especificación (EST-002)
  const validCases = [
    ['agendada', 'reagendada'],
    ['reagendada', 'agendada'],
    ['agendada', 'aplazada'],
    ['agendada', 'cancelada'],
    ['agendada', 'completada'],
  ];
  validCases.forEach(function (c) {
    const de = c[0];
    const a = c[1];
    let result;
    try {
      result = mod.esTransicionValida(de, a);
    } catch (e) {
      fail(
        'esTransicionValida(' + JSON.stringify(de) + ', ' + JSON.stringify(a) + ') === true',
        'excepción: ' + e.message
      );
      return;
    }
    if (result === true) {
      ok(
        'esTransicionValida(' +
          JSON.stringify(de) +
          ', ' +
          JSON.stringify(a) +
          ') === true'
      );
    } else {
      fail(
        'esTransicionValida(' +
          JSON.stringify(de) +
          ', ' +
          JSON.stringify(a) +
          ') === true',
        'obtuvo ' + JSON.stringify(result)
      );
    }
  });

  // Casos inválidos de la especificación
  const invalidCases = [
    ['aplazada', 'agendada'],
    ['cancelada', 'agendada'],
    ['completada', 'cancelada'],
    ['cancelada', 'completada'],
    ['completada', 'agendada'],
    ['reagendada', 'cancelada'],
    ['aplazada', 'completada'],
  ];
  invalidCases.forEach(function (c) {
    const de = c[0];
    const a = c[1];
    let result;
    try {
      result = mod.esTransicionValida(de, a);
    } catch (e) {
      fail(
        'esTransicionValida(' + JSON.stringify(de) + ', ' + JSON.stringify(a) + ') === false',
        'excepción: ' + e.message
      );
      return;
    }
    if (result === false) {
      ok(
        'esTransicionValida(' +
          JSON.stringify(de) +
          ', ' +
          JSON.stringify(a) +
          ') === false'
      );
    } else {
      fail(
        'esTransicionValida(' +
          JSON.stringify(de) +
          ', ' +
          JSON.stringify(a) +
          ') === false',
        'obtuvo ' + JSON.stringify(result)
      );
    }
  });

  // Mismo estado -> sin cambio (no es una transición válida)
  let sameStateResult;
  try {
    sameStateResult = mod.esTransicionValida('agendada', 'agendada');
  } catch (e) {
    fail(
      "esTransicionValida('agendada', 'agendada') === false (mismo estado)",
      'excepción: ' + e.message
    );
    return;
  }
  if (sameStateResult === false) {
    ok("esTransicionValida('agendada', 'agendada') === false (mismo estado = sin cambio)");
  } else {
    fail(
      "esTransicionValida('agendada', 'agendada') === false (mismo estado)",
      'obtuvo ' + JSON.stringify(sameStateResult)
    );
  }

  // Caso borde: si el estado anterior es null/undefined (registro nuevo),
  // la especificación exige aceptar el estado inicial sin validar.
  let firstTimeResult;
  try {
    firstTimeResult = mod.esTransicionValida(null, 'agendada');
  } catch (e) {
    fail(
      "esTransicionValida(null, 'agendada') === true (primer estado)",
      'excepción: ' + e.message
    );
    return;
  }
  if (firstTimeResult === true) {
    ok("esTransicionValida(null, 'agendada') === true (creación inicial)");
  } else {
    fail(
      "esTransicionValida(null, 'agendada') === true (creación inicial)",
      'obtuvo ' + JSON.stringify(firstTimeResult)
    );
  }
}

// ---------------------------------------------------------------------------
// [3/4] Endpoint src/app/api/agenda/[id]/route.ts (PATCH)
// ---------------------------------------------------------------------------

function checkRouteFile() {
  console.log(
    '\n[3/4] Endpoint PATCH de agenda: ' +
      path.relative(REPO_ROOT, ROUTE_FILE)
  );

  const content = fileExistsOrFail(ROUTE_FILE, 'archivo de endpoint existe');
  if (content === null) return;

  // 1. Importa esTransicionValida desde @/lib/cirugia-estados
  assertRegexMatches(
    content,
    /from\s+['"]@\/lib\/cirugia-estados['"]/,
    "importa desde '@/lib/cirugia-estados'"
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\besTransicionValida\b[^}]*\}\s*from\s*['"]@\/lib\/cirugia-estados['"]/,
    'importa esTransicionValida (named import)'
  );

  // 2. Enum Zod de `estado` con los 5 valores
  const reEstadoEnum = /estado\s*:\s*z\s*\.\s*enum\s*\(\s*\[([^\]]+)\]\s*\)/;
  const m = content.match(reEstadoEnum);
  if (!m) {
    fail(
      'enum Zod de `estado` presente (z.enum([...]))',
      'no se encontró el patrón z.enum([...]) en el campo estado'
    );
  } else {
    const enumValues = m[1];
    const expected = ["'agendada'", "'aplazada'", "'reagendada'", "'completada'", "'cancelada'"];
    const missing = expected.filter(function (v) {
      return !enumValues.includes(v);
    });
    if (missing.length === 0) {
      ok(
        'enum Zod de `estado` incluye los 5 valores (' + expected.length + ')'
      );
    } else {
      fail(
        'enum Zod de `estado` incluye los 5 valores',
        'faltan en el array: ' + missing.map(function (m) { return JSON.stringify(m); }).join(', ')
      );
    }
  }

  // 3. Campo `motivo` presente en el esquema
  assertRegexMatches(
    content,
    /motivo\s*:\s*z\s*\.\s*string\b/,
    'campo `motivo` presente en el esquema (z.string...)'
  );

  // 4. Llama a esTransicionValida(estadoAnterior, nuevoEstado)
  assertRegexMatches(
    content,
    /esTransicionValida\s*\(/,
    'llama a esTransicionValida(...)'
  );

  // 5. Rechaza con 400 si la transición no es válida
  assertContainsAll(
    content,
    [
      'esTransicionValida(',
      'status: 400',
      'Transición de estado no permitida',
    ],
    'rechaza con 400 + "Transición de estado no permitida" cuando la transición es inválida'
  );

  // 6. Rechaza con 400 si falta motivo al cambiar estado
  assertContainsAll(
    content,
    [
      'data.motivo',
      'status: 400',
      'motivo',
    ],
    'rechaza con 400 cuando falta motivo al cambiar estado'
  );
  assertRegexMatches(
    content,
    /motivo.*obligatorio/i,
    "mensaje de motivo obligatorio al cambiar estado (regex /motivo.*obligatorio/i)"
  );

  // 7. Inserta en cirugia_historial con accion ESTADO_CAMBIADO y detalle {de, a, motivo}
  assertContainsAll(
    content,
    [
      ".from('cirugia_historial')",
      ".insert(",
      "'ESTADO_CAMBIADO'",
      'de:',
      'a:',
      'motivo:',
    ],
    "inserta en cirugia_historial con accion='ESTADO_CAMBIADO' y detalle {de, a, motivo}"
  );

  // 8. Verificación de orden: la validación con esTransicionValida debe
  //    aparecer ANTES de la actualización .update(...) y ANTES del insert
  //    en cirugia_historial. La lectura del estado anterior (prev) debe
  //    aparecer antes de la validación.
  const idxPrev = content.search(/\.select\(\s*['"][^'"]*\bestado\b/);
  const idxValidate = content.indexOf('esTransicionValida(');
  const idxInsertHistorial = content.indexOf(".from('cirugia_historial')");
  const idxMotivoCheck = content.indexOf('!data.motivo');
  const idxUpdate = content.search(/\.update\(/);

  function reportOrder(label, okCondition, detail) {
    if (okCondition) {
      ok(label);
    } else {
      fail(label, detail);
    }
  }

  reportOrder(
    "lee estado anterior (.select('estado')) ANTES de validar transición",
    idxPrev !== -1 && idxValidate !== -1 && idxPrev < idxValidate,
    idxPrev === -1
      ? "no se localizó .select('estado')"
      : idxValidate === -1
        ? 'no se localizó esTransicionValida(...)'
        : 'orden invertido: idxPrev=' + idxPrev + ' idxValidate=' + idxValidate
  );

  reportOrder(
    'valida transición ANTES de la actualización .update(...)',
    idxValidate !== -1 && idxUpdate !== -1 && idxValidate < idxUpdate,
    idxValidate === -1
      ? 'no se localizó esTransicionValida(...)'
      : idxUpdate === -1
        ? 'no se localizó .update(...)'
        : 'orden invertido: idxValidate=' + idxValidate + ' idxUpdate=' + idxUpdate
  );

  reportOrder(
    'chequeo de motivo ANTES de la actualización .update(...)',
    idxMotivoCheck !== -1 && idxUpdate !== -1 && idxMotivoCheck < idxUpdate,
    idxMotivoCheck === -1
      ? 'no se localizó !data.motivo'
      : idxUpdate === -1
        ? 'no se localizó .update(...)'
        : 'orden invertido: idxMotivoCheck=' + idxMotivoCheck + ' idxUpdate=' + idxUpdate
  );

  reportOrder(
    'insert en cirugia_historial DESPUÉS de la actualización .update(...)',
    idxInsertHistorial !== -1 && idxUpdate !== -1 && idxInsertHistorial > idxUpdate,
    idxInsertHistorial === -1
      ? "no se localizó .from('cirugia_historial')"
      : idxUpdate === -1
        ? 'no se localizó .update(...)'
        : 'orden invertido: idxInsertHistorial=' + idxInsertHistorial + ' idxUpdate=' + idxUpdate
  );
}

// ---------------------------------------------------------------------------
// [4/4] Script npm test:b4 en package.json (sin tocar test:b1/b2/b3)
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[4/4] Scripts npm y registro de test:b4');

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

  // 1. test:b4 definido
  if (
    typeof scripts['test:b4'] === 'string' &&
    scripts['test:b4'].length > 0
  ) {
    ok(
      'script npm "test:b4" definido (' +
        JSON.stringify(scripts['test:b4']) +
        ')'
    );
  } else {
    fail('script npm "test:b4" definido', 'ausente o vacío en package.json');
  }

  // 2. Garantía: test:b1, test:b2 y test:b3 intactos
  ['test:b1', 'test:b2', 'test:b3'].forEach(function (key) {
    if (typeof scripts[key] === 'string' && scripts[key].length > 0) {
      ok('script npm "' + key + '" intacto (' + JSON.stringify(scripts[key]) + ')');
    } else {
      fail('script npm "' + key + '" intacto', 'ausente o vacío en package.json');
    }
  });
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B4 - Estados y transiciones de cirugía (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkServiceFile();
  checkTransitionLogic();
  checkRouteFile();
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
      '\nLa prueba B4 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B4 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();
