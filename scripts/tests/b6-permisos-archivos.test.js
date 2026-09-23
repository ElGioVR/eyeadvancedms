#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B6 (Permisos granulares de archivos
 * de cirugía: migración `permisos_archivo` + helper `permisos-archivo` +
 * endpoints `archivos` y `archivos/[archivoId]` usando
 * `verificarPermisoArchivo` en lugar de `requireRole`) de Fase 1
 * (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente y un mini-runtime con `vm.runInContext`
 * para ejercitar `verificarPermisoArchivo` contra una cadena Supabase
 * stub. NO conecta a Supabase/PostgreSQL ni ejecuta migraciones; sólo lee el
 * contenido del repo y verifica que estén los elementos obligatorios del
 * bloque B6:
 *
 *   - Migración src/migrations/1800000000190-CreatePermisosArchivo.ts:
 *       * CREATE TABLE permisos_archivo
 *       * columnas usuario_id, accion, permitido
 *       * CHECK (accion IN ('ver','subir','descargar','eliminar'))
 *       * registrada en scripts/run-migrations.js
 *
 *   - Helper src/lib/permisos-archivo.ts:
 *       * exporta `verificarPermisoArchivo`
 *       * exporta type `AccionArchivo` con 'ver','subir','descargar','eliminar'
 *       * matriz por rol: admin todo true; doctor true ver/subir/descargar
 *         y false eliminar; recepcionista true subir y false resto
 *       * consulta tabla permisos_archivo para overrides
 *
 *   - Endpoint src/app/api/cirugias/[id]/archivos/route.ts (GET, POST):
 *       * GET llama a verificarPermisoArchivo(..., 'ver')
 *       * POST llama a verificarPermisoArchivo(..., 'subir')
 *       * ambos responden 403 cuando no permitido
 *       * sólo usan requireAuth (no requireRole)
 *
 *   - Endpoint src/app/api/cirugias/[id]/archivos/[archivoId]/route.ts
 *     (GET, DELETE):
 *       * GET llama a verificarPermisoArchivo(..., 'descargar')
 *       * DELETE llama a verificarPermisoArchivo(..., 'eliminar')
 *       * ambos responden 403 cuando no permitido
 *       * sólo usan requireAuth (no requireRole)
 *
 *   - Script npm `test:b6` en package.json (sin tocar test:b1..b5).
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

const MIGRATION_FILE = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000190-CreatePermisosArchivo.ts'
);
const MIGRATION_FILENAME = '1800000000190-CreatePermisosArchivo.ts';
const RUN_MIGRATIONS_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'run-migrations.js'
);
const HELPER_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'permisos-archivo.ts'
);
const ARCHIVOS_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  '[id]',
  'archivos',
  'route.ts'
);
const ARCHIVO_DETAIL_ROUTE_FILE = path.join(
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
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1..b5)
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
    'faltan: ' + missing.map(function (m) {
      return JSON.stringify(m);
    }).join(', ')
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
// Transpilador mínimo TS -> JS para permisos-archivo.ts
// ---------------------------------------------------------------------------
//
// `permisos-archivo.ts` usa:
//   - `import { ... } from '...';`                         -> eliminadas
//   - `export type AccionArchivo = ...;`                   -> eliminada
//   - `const PERMISOS_POR_ROL: Record<...> = { ... };`     -> `const PERMISOS_POR_ROL = { ... };`
//   - `export async function verificarPermisoArchivo(
//        usuarioId: string,
//        accion: AccionArchivo,
//      ): Promise<{ permitido: boolean; rol: string }> { ... }`
//     -> `async function verificarPermisoArchivo(usuarioId, accion) { ... }`
//
// La estrategia es regex-driven + un escáner manual de funciones con
// conteo de paréntesis/llaves. Si en el futuro el helper agrega sintaxis TS
// más compleja (genéricos con varios parámetros, tipos condicionales, etc.)
// este transpilador deberá extenderse.

function transpilePermisosArchivo(content) {
  let js = content;

  // 1. Eliminar líneas de import.
  js = js.replace(/^\s*import\s+[^;]+;\s*$/gm, '');

  // 2. Eliminar `export type X = ...;` (la RHS es union, no contiene `=`).
  js = js.replace(/export\s+type\s+[A-Za-z_$][\w$]*\s*=[^;]*;/g, '');

  // 3. Strip la palabra clave `export` antes de declaraciones top-level.
  js = js.replace(
    /\bexport\s+(const|async\s+function|function)\b/g,
    '$1'
  );

  // 4. Convertir `const X: T = ...` -> `const X = ...` (strip de anotación
  //    de tipo en const).
  js = js.replace(
    /(\bconst\s+[A-Za-z_$][\w$]*)\s*:\s*[^=;]+=/g,
    '$1 ='
  );

  // 5. Strip aserciones `expr as Type` y `expr as Type<X>`.
  js = js.replace(
    /\s+as\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?/g,
    ''
  );

  // 6. Para funciones (incluyendo async), recorremos el código con un
  //    escáner manual que cuenta paréntesis y llaves para localizar el
  //    inicio del cuerpo `{`, limpiando las anotaciones de tipo en cada
  //    parámetro y quitando la anotación de tipo de retorno.
  function stripFunction(source) {
    let out = '';
    let i = 0;
    while (i < source.length) {
      const tail = source.substring(i);
      const m = tail.match(
        /^(\basync\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/
      );
      if (!m) {
        out += source[i];
        i += 1;
        continue;
      }
      out += m[0];
      i += m[0].length;
      // Saltar la lista de parámetros contando paréntesis.
      let pDepth = 1;
      const paramsStart = i;
      while (i < source.length && pDepth > 0) {
        const c = source[i];
        if (c === '(') pDepth += 1;
        else if (c === ')') pDepth -= 1;
        i += 1;
      }
      const paramsRaw = source.substring(paramsStart, i - 1);
      // Limpiar anotaciones de tipo en cada parámetro.
      let cleanedParams = '';
      {
        let j = 0;
        while (j < paramsRaw.length) {
          const c = paramsRaw[j];
          if (c === ':') {
            let depth = 0;
            let inS = null;
            while (j < paramsRaw.length) {
              const cc = paramsRaw[j];
              if (inS) {
                if (cc === '\\') { j += 2; continue; }
                if (cc === inS) inS = null;
                j += 1;
                continue;
              }
              if (cc === "'" || cc === '"') { inS = cc; j += 1; continue; }
              if (cc === '(' || cc === '[' || cc === '<') {
                depth += 1; j += 1; continue;
              }
              if (cc === ')' || cc === ']' || cc === '>') {
                depth -= 1; j += 1; continue;
              }
              if (depth === 0 && (cc === ',' || cc === '=')) break;
              j += 1;
            }
            while (
              j < paramsRaw.length &&
              (paramsRaw[j] === ' ' || paramsRaw[j] === '\t')
            ) {
              j += 1;
            }
          } else {
            cleanedParams += c;
            j += 1;
          }
        }
        cleanedParams = cleanedParams.replace(/\s+/g, ' ').trim();
      }
      out += cleanedParams;
      out += ')';
      // Saltar espacios después de `)` y comprobar `:` para return type.
      while (i < source.length && /\s/.test(source[i])) {
        out += source[i];
        i += 1;
      }
      if (source[i] === ':') {
        // Saltar el tipo de retorno hasta el `{` del cuerpo. Contamos
        // profundidad sobre () {} [] <> para que tipos como
        // `Promise<{ permitido: boolean; rol: string }>` queden bien
        // balanceados. Heurística para distinguir `{` body vs type literal:
        // si el carácter previo (no-whitespace) es `:`, `|`, `&`, `(`,
        // `[`, `<` o `,`, es un type literal.
        let depth = 0;
        let inStr = null;
        while (i < source.length) {
          const c = source[i];
          if (inStr) {
            if (c === '\\') { i += 2; continue; }
            if (c === inStr) inStr = null;
            i += 1;
            continue;
          }
          if (c === "'" || c === '"') { inStr = c; i += 1; continue; }
          if (c === '(' || c === '{' || c === '[' || c === '<') {
            if (c === '{' && depth === 0) {
              let k = i - 1;
              while (k >= 0 && /\s/.test(source[k])) k -= 1;
              const prev = k >= 0 ? source[k] : '';
              if (
                prev === ':' || prev === '|' || prev === '&' ||
                prev === '(' || prev === '[' || prev === '<' || prev === ','
              ) {
                depth += 1;
              } else {
                out += ' {';
                i += 1;
                break;
              }
            } else {
              depth += 1;
            }
          } else if (c === ')' || c === '}' || c === ']' || c === '>') {
            depth -= 1;
          }
          i += 1;
        }
      }
    }
    return out;
  }

  js = stripFunction(js);
  return js;
}

// Stubs para `getSupabaseAdmin`. La estrategia: el stub devuelve un cliente
// cuya cadena `.from(TABLE)` recuerda la tabla consultada y responde en
// `maybeSingle()` con datos configurables por tabla. Esto permite simular
// el flujo real de `verificarPermisoArchivo`:
//   1) getSupabaseAdmin() -> supabase
//   2) supabase.from('usuarios').select('rol').eq('id', u).maybeSingle()
//   3) supabase.from('permisos_archivo').select('permitido')
//        .eq('usuario_id', u).eq('accion', a).maybeSingle()
function makePermisosStub(opts) {
  const rol = opts && opts.rol ? opts.rol : '';
  const override = opts && opts.override ? opts.override : null;

  function makeChain(tableName) {
    const captured = { table: tableName, filters: {} };
    const chain = {};
    chain.select = function () { return chain; };
    chain.insert = function () { return chain; };
    chain.update = function () { return chain; };
    chain.eq = function (col, val) {
      captured.filters[col] = val;
      return chain;
    };
    chain.is = function () { return chain; };
    chain.order = function () { return chain; };
    chain.maybeSingle = async function () {
      if (captured.table === 'usuarios') {
        return { data: { rol: rol }, error: null };
      }
      if (captured.table === 'permisos_archivo') {
        return override
          ? { data: { permitido: override.permitido }, error: null }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    };
    chain.single = async function () {
      return { data: null, error: null };
    };
    return chain;
  }

  return function getSupabaseAdminStub() {
    return {
      from: function (tableName) {
        return makeChain(tableName);
      },
    };
  };
}

function loadPermisosArchivoModule(stubFactory) {
  const content = fs.readFileSync(HELPER_FILE, 'utf8');
  const js = transpilePermisosArchivo(content);

  const exportsObj = {};
  const sandbox = {
    module: { exports: exportsObj },
    exports: exportsObj,
    console: console,
    getSupabaseAdmin: stubFactory,
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);

  const shim =
    '\nmodule.exports = {' +
    '  verificarPermisoArchivo: typeof verificarPermisoArchivo === "function" ? verificarPermisoArchivo : null' +
    '};';

  vm.runInContext(js + shim, sandbox, {
    filename: 'permisos-archivo.transpiled.js',
  });
  return sandbox.module.exports;
}

// ---------------------------------------------------------------------------
// [1/5] Migración src/migrations/1800000000190-CreatePermisosArchivo.ts
// ---------------------------------------------------------------------------

function checkMigration() {
  console.log(
    '\n[1/5] Migración: ' +
      path.relative(REPO_ROOT, MIGRATION_FILE)
  );

  const content = fileExistsOrFail(MIGRATION_FILE, 'archivo de migración existe');
  if (content === null) return;

  // 1. CREATE TABLE permisos_archivo
  assertRegexMatches(
    content,
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+permisos_archivo\b|CREATE\s+TABLE\s+permisos_archivo\b/,
    'CREATE TABLE permisos_archivo'
  );

  // 2. Columnas usuario_id, accion, permitido
  assertContainsAll(
    content,
    ['usuario_id', 'accion', 'permitido'],
    'columnas usuario_id, accion, permitido'
  );

  // 3. CHECK accion IN ('ver','subir','descargar','eliminar')
  assertRegexMatches(
    content,
    /CHECK\s*\(\s*accion\s+IN\s*\(\s*'ver'\s*,\s*'subir'\s*,\s*'descargar'\s*,\s*'eliminar'\s*\)\s*\)/,
    "CHECK (accion IN ('ver','subir','descargar','eliminar'))"
  );

  // 4. Registrada en scripts/run-migrations.js
  const rmContent = fileExistsOrFail(
    RUN_MIGRATIONS_FILE,
    'scripts/run-migrations.js existe'
  );
  if (rmContent === null) return;
  if (rmContent.includes("'" + MIGRATION_FILENAME + "'")) {
    ok(
      "MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'"
    );
  } else {
    fail(
      "MIGRATION_ORDER contiene '" + MIGRATION_FILENAME + "'",
      'no se encontró la entrada exacta en el array'
    );
  }

  // 5. La migración también implementa `down` con DROP TABLE (saneamiento).
  assertRegexMatches(
    content,
    /DROP\s+TABLE\s+IF\s+EXISTS\s+permisos_archivo\b/,
    'down() incluye DROP TABLE IF EXISTS permisos_archivo'
  );

  // 6. Habilita RLS en la tabla (consistente con el resto del repo).
  assertRegexMatches(
    content,
    /ALTER\s+TABLE\s+permisos_archivo\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    'permisos_archivo habilita RLS'
  );
}

// ---------------------------------------------------------------------------
// [2/5] Helper src/lib/permisos-archivo.ts (estático + runtime)
// ---------------------------------------------------------------------------

async function checkHelper() {
  console.log(
    '\n[2/5] Helper de permisos: ' +
      path.relative(REPO_ROOT, HELPER_FILE)
  );

  const content = fileExistsOrFail(HELPER_FILE, 'archivo del helper existe');
  if (content === null) return;

  // --- Aserciones estáticas -------------------------------------------------

  // 1. Exporta `verificarPermisoArchivo`
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+verificarPermisoArchivo\b/,
    'exporta async function verificarPermisoArchivo'
  );

  // 2. Exporta `AccionArchivo` con los 4 valores
  assertRegexMatches(
    content,
    /export\s+type\s+AccionArchivo\b/,
    'exporta type AccionArchivo'
  );
  const expectedAcciones = ["'ver'", "'subir'", "'descargar'", "'eliminar'"];
  const missingAcciones = expectedAcciones.filter(function (a) {
    return !content.includes(a);
  });
  if (missingAcciones.length === 0) {
    ok(
      "AccionArchivo enumera 'ver','subir','descargar','eliminar' (" +
        expectedAcciones.length +
        ')'
    );
  } else {
    fail(
      "AccionArchivo enumera 'ver','subir','descargar','eliminar'",
      'faltan: ' + missingAcciones.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 3. Consulta la tabla permisos_archivo para overrides
  assertRegexMatches(
    content,
    /\.from\(\s*['"]permisos_archivo['"]\s*\)/,
    "consulta tabla 'permisos_archivo' para overrides"
  );
  assertRegexMatches(
    content,
    /if\s*\(\s*override\s*\)[\s\S]{0,200}?override\.permitido/i,
    'el helper prioriza el override sobre la matriz (if (override) -> return override.permitido)'
  );

  // 4. Matriz por rol: claves admin / doctor / recepcionista presentes
  assertContainsAll(
    content,
    ['admin:', 'doctor:', 'recepcionista:'],
    'matriz por rol contiene admin, doctor, recepcionista'
  );

  // 5. Cada rol tiene los 4 booleanos para las 4 acciones (12 entradas).
  const matrizEsperada = {
    admin: { ver: true, subir: true, descargar: true, eliminar: true },
    doctor: { ver: true, subir: true, descargar: true, eliminar: false },
    recepcionista: { ver: false, subir: true, descargar: false, eliminar: false },
  };
  Object.keys(matrizEsperada).forEach(function (rol) {
    Object.keys(matrizEsperada[rol]).forEach(function (accion) {
      const esperado = matrizEsperada[rol][accion];
      const idxRol = content.indexOf(rol + ':');
      if (idxRol === -1) {
        fail(
          'matriz [' + rol + '.' + accion + ']',
          'no se encontró la clave ' + rol + ':'
        );
        return;
      }
      let depth = 0;
      let i = idxRol;
      while (i < content.length) {
        const c = content[i];
        if (c === '{') depth += 1;
        else if (c === '}') {
          if (depth === 1) break;
          depth -= 1;
        }
        i += 1;
      }
      const bloqueRol = content.substring(idxRol, i + 1);
      const re = new RegExp(
        accion + "\\s*:\\s*" + (esperado ? 'true' : 'false')
      );
      if (re.test(bloqueRol)) {
        ok(
          'matriz [' + rol + '.' + accion + '] = ' + esperado
        );
      } else {
        fail(
          'matriz [' + rol + '.' + accion + '] = ' + esperado,
          'no se encontró la entrada esperada'
        );
      }
    });
  });

  // 6. La firma acepta (usuarioId, accion)
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*usuarioId\s*:\s*string\s*,\s*accion\s*:\s*AccionArchivo\s*\)/,
    'firma verificarPermisoArchivo(usuarioId: string, accion: AccionArchivo)'
  );

  // 7. Usa getSupabaseAdmin (consistente con el resto del repo).
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );

  // --- Aserciones de runtime (async) ---------------------------------------

  let mod;
  try {
    mod = loadPermisosArchivoModule(
      makePermisosStub({ rol: 'admin', override: null })
    );
  } catch (e) {
    fail(
      'cargar permisos-archivo en runtime',
      'transpile/eval falló: ' + e.message
    );
    return;
  }
  ok('cargar permisos-archivo en runtime');

  if (!mod || typeof mod.verificarPermisoArchivo !== 'function') {
    fail(
      'exports del módulo cargados',
      'verificarPermisoArchivo no está disponible'
    );
    return;
  }
  ok('exports del módulo cargados (verificarPermisoArchivo)');

  async function runCase(rol, override, accion) {
    const factory = makePermisosStub({ rol: rol, override: override });
    const m = loadPermisosArchivoModule(factory);
    if (!m || typeof m.verificarPermisoArchivo !== 'function') {
      throw new Error('verificarPermisoArchivo no disponible');
    }
    return m.verificarPermisoArchivo('user-test', accion);
  }

  // Casos por rol con todas las acciones (matriz).
  const allAcciones = ['ver', 'subir', 'descargar', 'eliminar'];
  const expectedMatriz = {
    admin: { ver: true, subir: true, descargar: true, eliminar: true },
    doctor: { ver: true, subir: true, descargar: true, eliminar: false },
    recepcionista: { ver: false, subir: true, descargar: false, eliminar: false },
  };

  const runtimeChecks = [];

  Object.keys(expectedMatriz).forEach(function (rol) {
    allAcciones.forEach(function (accion) {
      runtimeChecks.push(
        runCase(rol, null, accion).then(function (res) {
          const esperado = expectedMatriz[rol][accion];
          if (
            res &&
            typeof res.permitido === 'boolean' &&
            res.permitido === esperado &&
            res.rol === rol
          ) {
            ok(
              'runtime [' + rol + '.' + accion + '] -> permitido=' +
                esperado + ' (sin override)'
            );
          } else {
            fail(
              'runtime [' + rol + '.' + accion + '] -> permitido=' +
                esperado,
              'obtuvo ' + JSON.stringify(res)
            );
          }
        }).catch(function (e) {
          fail(
            'runtime [' + rol + '.' + accion + ']',
            'excepción: ' + e.message
          );
        })
      );
    });
  });

  // Rol desconocido -> false en todas las acciones.
  allAcciones.forEach(function (accion) {
    runtimeChecks.push(
      runCase('otro-rol-no-mapeado', null, accion).then(function (res) {
        if (res && res.permitido === false) {
          ok(
            "runtime [rol-desconocido." + accion + '] -> permitido=false'
          );
        } else {
          fail(
            "runtime [rol-desconocido." + accion + '] -> permitido=false',
            'obtuvo ' + JSON.stringify(res)
          );
        }
      }).catch(function (e) {
        fail(
          'runtime [rol-desconocido.' + accion + ']',
          'excepción: ' + e.message
        );
      })
    );
  });

  // Override tiene prioridad sobre la matriz:
  //   doctor sin override -> eliminar=false; CON override permitido=true
  //     -> eliminar=true (override gana).
  runtimeChecks.push(
    runCase('doctor', { permitido: true }, 'eliminar').then(function (res) {
      if (res && res.permitido === true && res.rol === 'doctor') {
        ok(
          "override permitido=true sobre 'doctor.eliminar' -> permitido=true (override gana)"
        );
      } else {
        fail(
          "override permitido=true sobre 'doctor.eliminar'",
          'obtuvo ' + JSON.stringify(res)
        );
      }
    }).catch(function (e) {
      fail(
        "override permitido=true sobre 'doctor.eliminar'",
        'excepción: ' + e.message
      );
    })
  );

  //   recepcionista con override permitido=false en 'subir' -> false
  //     (override niega aunque la matriz diga true).
  runtimeChecks.push(
    runCase('recepcionista', { permitido: false }, 'subir').then(function (res) {
      if (res && res.permitido === false && res.rol === 'recepcionista') {
        ok(
          "override permitido=false sobre 'recepcionista.subir' -> permitido=false (override gana)"
        );
      } else {
        fail(
          "override permitido=false sobre 'recepcionista.subir'",
          'obtuvo ' + JSON.stringify(res)
        );
      }
    }).catch(function (e) {
      fail(
        "override permitido=false sobre 'recepcionista.subir'",
        'excepción: ' + e.message
      );
    })
  );

  await Promise.all(runtimeChecks);
}

// ---------------------------------------------------------------------------
// [3/5] Endpoint src/app/api/cirugias/[id]/archivos/route.ts
// ---------------------------------------------------------------------------

function checkArchivosRoute() {
  console.log(
    '\n[3/5] Endpoint archivos: ' +
      path.relative(REPO_ROOT, ARCHIVOS_ROUTE_FILE)
  );

  const content = fileExistsOrFail(ARCHIVOS_ROUTE_FILE, 'archivo del endpoint existe');
  if (content === null) return;

  // 1. Exporta GET y POST
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\b/,
    'exporta async function GET'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+POST\b/,
    'exporta async function POST'
  );

  // 2. Importa verificarPermisoArchivo y requireAuth
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bverificarPermisoArchivo\b[^}]*\}\s*from\s*['"]@\/lib\/permisos-archivo['"]/,
    'importa verificarPermisoArchivo desde @/lib/permisos-archivo'
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\brequireAuth\b[^}]*\}\s*from\s*['"]@\/lib\/supabase\/server['"]/,
    'importa requireAuth desde @/lib/supabase/server'
  );

  // 3. GET usa verificarPermisoArchivo(..., 'ver')
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*[^,]+,\s*['"]ver['"]\s*\)/,
    "GET llama a verificarPermisoArchivo(..., 'ver')"
  );

  // 4. POST usa verificarPermisoArchivo(..., 'subir')
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*[^,]+,\s*['"]subir['"]\s*\)/,
    "POST llama a verificarPermisoArchivo(..., 'subir')"
  );

  // 5. Ambos responden 403 cuando no permitido
  assertContainsAll(
    content,
    [
      'status: 403',
      'No tienes permiso para ver archivos',
      'No tienes permiso para subir archivos',
    ],
    'GET y POST devuelven HTTP 403 con mensaje específico por acción'
  );
  assertRegexMatches(
    content,
    /permisoListar\s*\.\s*permitido[\s\S]{0,200}status:\s*403/,
    'GET corta con 403 si permiso.ver === false'
  );
  assertRegexMatches(
    content,
    /permisoSubir\s*\.\s*permitido[\s\S]{0,200}status:\s*403/,
    'POST corta con 403 si permiso.subir === false'
  );

  // 6. Usa requireAuth y NO usa requireRole (B6 sustituye requireRole por
  //    verificarPermisoArchivo).
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar'
  );
  assertNotContains(
    content,
    'requireRole',
    'NO usa requireRole (autorización por permisos de archivo)'
  );

  // 7. Continúa usando getSupabaseAdmin (servidor) y los helpers de storage.
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );
}

// ---------------------------------------------------------------------------
// [4/5] Endpoint src/app/api/cirugias/[id]/archivos/[archivoId]/route.ts
// ---------------------------------------------------------------------------

function checkArchivoDetailRoute() {
  console.log(
    '\n[4/5] Endpoint archivo individual: ' +
      path.relative(REPO_ROOT, ARCHIVO_DETAIL_ROUTE_FILE)
  );

  const content = fileExistsOrFail(
    ARCHIVO_DETAIL_ROUTE_FILE,
    'archivo del endpoint existe'
  );
  if (content === null) return;

  // 1. Exporta GET y DELETE
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\b/,
    'exporta async function GET'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+DELETE\b/,
    'exporta async function DELETE'
  );

  // 2. Importa verificarPermisoArchivo y requireAuth
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bverificarPermisoArchivo\b[^}]*\}\s*from\s*['"]@\/lib\/permisos-archivo['"]/,
    'importa verificarPermisoArchivo desde @/lib/permisos-archivo'
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\brequireAuth\b[^}]*\}\s*from\s*['"]@\/lib\/supabase\/server['"]/,
    'importa requireAuth desde @/lib/supabase/server'
  );

  // 3. GET usa verificarPermisoArchivo(..., 'descargar')
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*[^,]+,\s*['"]descargar['"]\s*\)/,
    "GET llama a verificarPermisoArchivo(..., 'descargar')"
  );

  // 4. DELETE usa verificarPermisoArchivo(..., 'eliminar')
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*[^,]+,\s*['"]eliminar['"]\s*\)/,
    "DELETE llama a verificarPermisoArchivo(..., 'eliminar')"
  );

  // 5. Ambos responden 403 cuando no permitido
  assertContainsAll(
    content,
    [
      'status: 403',
      'No tienes permiso para descargar archivos',
      'No tienes permiso para eliminar archivos',
    ],
    'GET y DELETE devuelven HTTP 403 con mensaje específico por acción'
  );
  assertRegexMatches(
    content,
    /permisoDescargar\s*\.\s*permitido[\s\S]{0,200}status:\s*403/,
    'GET corta con 403 si permiso.descargar === false'
  );
  assertRegexMatches(
    content,
    /permisoEliminar\s*\.\s*permitido[\s\S]{0,200}status:\s*403/,
    'DELETE corta con 403 si permiso.eliminar === false'
  );

  // 6. Usa requireAuth y NO usa requireRole.
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar'
  );
  assertNotContains(
    content,
    'requireRole',
    'NO usa requireRole (autorización por permisos de archivo)'
  );

  // 7. Usa getSupabaseAdmin (servidor) y generarUrlFirmada.
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );
  assertRegexMatches(
    content,
    /generarUrlFirmada\s*\(/,
    'GET sigue llamando a generarUrlFirmada()'
  );
}

// ---------------------------------------------------------------------------
// [5/5] Script npm test:b6 + integridad de test:b1..b5
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[5/5] Script npm test:b6 e integridad de test:b1..b5');

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

  if (
    typeof scripts['test:b6'] === 'string' &&
    scripts['test:b6'].length > 0
  ) {
    ok(
      'script npm "test:b6" definido (' +
        JSON.stringify(scripts['test:b6']) +
        ')'
    );
  } else {
    fail('script npm "test:b6" definido', 'ausente o vacío en package.json');
  }

  ['test:b1', 'test:b2', 'test:b3', 'test:b4', 'test:b5'].forEach(function (key) {
    if (typeof scripts[key] === 'string' && scripts[key].length > 0) {
      ok(
        'script npm "' + key + '" intacto (' +
          JSON.stringify(scripts[key]) +
          ')'
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

async function main() {
  console.log('========================================================');
  console.log(' Pruebas B6 - Permisos de archivos de cirugía (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkMigration();
  await checkHelper();
  checkArchivosRoute();
  checkArchivoDetailRoute();
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
      '\nLa prueba B6 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B6 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main().catch(function (e) {
  console.error('ERROR inesperado en B6: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
