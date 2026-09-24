#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B8 (Productividad base:
 * migración `reglas_productividad_cirugia`, helper `productividad-cirugia`
 * con cálculo de monto FIJO/PORCENTAJE por Origen+Servicio+Rol, endpoint
 * de listado) de Fase 1 (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * IDs cubiertos: PRD-001, PRD-002, PRD-003 (ver
 * `docs/cirugias/fase-1-creacion-cirugia.md`).
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con
 * aserciones textuales sobre los archivos fuente y un mini-runtime con
 * `vm.runInContext` para ejercitar
 * `obtenerReglaProductividad`, `calcularMontoProductividad`,
 * `calcularProductividadCirugia` y `listarProductividadCirugia` contra
 * una cadena Supabase stub. NO conecta a Supabase/PostgreSQL ni ejecuta
 * migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B8:
 *
 *   - Migración src/migrations/1800000000200-CreateReglasProductividadCirugia.ts:
 *       * CREATE TABLE reglas_productividad_cirugia
 *       * columnas origen_id, servicio_id, rol_id, tipo_calculo, valor,
 *         moneda, vigente_desde, vigente_hasta, activo
 *       * índice único parcial por (origen_id, servicio_id, rol_id)
 *         WHERE vigente_hasta IS NULL AND activo = true
 *       * ENABLE ROW LEVEL SECURITY + policies
 *       * registrada en scripts/run-migrations.js
 *
 *   - Helper src/lib/productividad-cirugia.ts:
 *       * exporta obtenerReglaProductividad, calcularMontoProductividad,
 *         calcularProductividadCirugia, listarProductividadCirugia
 *       * usa getSupabaseAdmin() (cliente servidor)
 *       * obtenerReglaProductividad: filtros eq(origen_id),
 *         eq(servicio_id), eq(rol_id), eq(activo true),
 *         lte(vigente_desde, hoy), or(vigente_hasta null OR gte hoy),
 *         order(vigente_desde desc), limit(1)
 *       * calcularMontoProductividad: FIJO -> devuelve valor;
 *         PORCENTAJE -> consulta aseguranza_servicios.costo y
 *         calcula porcentaje
 *       * calcularProductividadCirugia: lee agenda_cirugias, lista
 *         cirugia_productividad, resuelve regla por cada rol_id y
 *         hace update de monto + regla_id + estado PENDIENTE
 *
 *   - Endpoint src/app/api/cirugias/route.ts:
 *       * importa calcularProductividadCirugia
 *       * tras supabase.rpc('crear_cirugia', ...), llama a
 *         calcularProductividadCirugia(result.cirugia_id)
 *       * sigue respondiendo 201 con el resultado
 *
 *   - Endpoint src/app/api/cirugias/[id]/productividad/route.ts:
 *       * exporta GET
 *       * usa requireAuth()
 *       * usa listarProductividadCirugia(id)
 *
 *   - Migración 1800000000180 (RPC crear_cirugia):
 *       * inserta filas en cirugia_productividad con
 *         estado='PENDIENTE' y monto NULL por participante (PRD-001)
 *
 *   - Script npm `test:b8` en package.json (sin tocar test:b1..b7).
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
  '1800000000200-CreateReglasProductividadCirugia.ts'
);
const MIGRATION_FILENAME = '1800000000200-CreateReglasProductividadCirugia.ts';
const RUN_MIGRATIONS_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'run-migrations.js'
);
const HELPER_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'productividad-cirugia.ts'
);
const CIRUGIAS_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'route.ts'
);
const PRODUCTIVIDAD_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  '[id]',
  'productividad',
  'route.ts'
);
const CREAR_CIRUGIA_RPC_FILE = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000180-CreateCrearCirugiaRPC.ts'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1..b7)
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

// Extrae el cuerpo completo de una `function NAME(...)` top-level (con o
// sin `async`/`export`) contando llaves para encontrar el `}` de cierre
// real. Esto es necesario porque varias funciones del helper tienen `if`,
// `for` y otras llaves anidadas, y un match laxo con `[\s\S]*?\n\s*\}`
// cerraría en la primera llave interna.
function extractFunctionBody(content, fnName) {
  const re = new RegExp(
    '(?:export\\s+)?(?:async\\s+)?function\\s+' +
      fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\(',
    'g'
  );
  const match = re.exec(content);
  if (!match) return '';
  const startIdx = match.index;
  let k = match.index + match[0].length;
  // Avanzar hasta el `(` de los params ya fue consumido por match[0];
  // ahora estamos en el inicio del params body. Recorrer hasta la `)`
  // de cierre de params contando paréntesis (tolerando strings,
  // destructuring `{}` y genéricos `<>`).
  let pDepth = 1;
  while (k < content.length && pDepth > 0) {
    const c = content[k];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      k++;
      while (k < content.length) {
        if (content[k] === '\\') { k += 2; continue; }
        if (content[k] === quote) { k++; break; }
        k++;
      }
      continue;
    }
    if (c === '(') pDepth++;
    else if (c === ')') pDepth--;
    k++;
  }
  // Después de `)`, saltar espacios y, si aparece `:`, saltar el tipo de
  // retorno contando grupos (`{}`, `<>`, `[]`) hasta el `{` del cuerpo.
  while (k < content.length && /\s/.test(content[k])) k++;
  if (content[k] === ':') {
    let depth = 0;
    while (k < content.length) {
      const c = content[k];
      if (c === '(' || c === '[' || c === '<') {
        depth++; k++; continue;
      }
      if (c === ')' || c === ']' || c === '>') {
        // Un `)` antes del body significa que estamos en un call site
        // inesperado; defensivo.
        depth--;
        if (depth < 0) break;
        k++; continue;
      }
      if (c === '{') {
        // Cuerpo de la función (no avanzar k para que apunte al `{`).
        if (depth === 0) break;
        depth++; k++; continue;
      }
      if (c === '}') {
        if (depth === 0) break;
        depth--; k++; continue;
      }
      k++;
    }
  }
  if (content[k] !== '{') return '';
  // Ahora contar llaves desde el body.
  let bDepth = 1;
  let j = k + 1;
  while (j < content.length && bDepth > 0) {
    const c = content[j];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      j++;
      while (j < content.length) {
        if (content[j] === '\\') { j += 2; continue; }
        if (content[j] === quote) { j++; break; }
        j++;
      }
      continue;
    }
    if (c === '{') bDepth++;
    else if (c === '}') bDepth--;
    j++;
  }
  return content.substring(startIdx, j);
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
// Transpilador mínimo TS -> JS para `src/lib/productividad-cirugia.ts`
// ---------------------------------------------------------------------------
//
// El helper usa:
//   - `import { ... } from '...';`                                  -> eliminada
//   - `export interface ReglaProductividadCirugia { ... }`          -> eliminada
//   - `export interface ProductividadCirugiaRow { ... }`           -> eliminada
//   - `export async function obtenerReglaProductividad({...}: ...)` -> strip tipado
//   - `export async function calcularMontoProductividad(...)`       -> strip tipado
//   - `export async function calcularProductividadCirugia(...)`     -> strip tipado
//   - `export async function listarProductividadCirugia(...)`       -> strip tipado
//   - `aserciones` `as Type` y `as Type<X>`                          -> strip
//
// Estrategia regex-driven + escáner con conteo de paréntesis/llaves
// (mismo patrón que el transpilador de b5/b6/b7). Si en el futuro el helper
// agrega sintaxis TS más compleja (genéricos con varios parámetros, tipos
// condicionales, etc.) este transpilador deberá extenderse.

function transpileProductividadHelper(content) {
  let js = content;

  // 1. Eliminar líneas de import.
  js = js.replace(/^\s*import\s+[^;]+;\s*$/gm, '');

  // 2. Eliminar `export interface X { ... }` (interfaces planas).
  js = js.replace(/export\s+interface\s+\w+\s*\{[^}]*\}/g, '');

  // 3. Strip la palabra clave `export` antes de declaraciones top-level
  //    (const / function / async function).
  js = js.replace(
    /\bexport\s+(const|async\s+function|function)\b/g,
    '$1'
  );

  // 4. Convertir `const X: T = ...` -> `const X = ...`.
  js = js.replace(
    /(\bconst\s+[A-Za-z_$][\w$]*)\s*:\s*[^=]+=/g,
    '$1 ='
  );

  // 4b. Strip aserciones de tipo `expr as Type` y `expr as Type<X>`,
  //     `expr as Type[]` y `expr as Type | Other` (incluyendo
  //     combinaciones con genéricos y arrays en cada lado de la unión).
  js = js.replace(
    /\s+as\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\[\s*\])?(?:\s*\|\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\[\s*\])?)*/g,
    ''
  );

  // 5. Strip del tipo de retorno en funciones y de las anotaciones de tipo
  //    en cada parámetro (incluido el destructuring `{ ... }: { ... }`).
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
      // Saltar la lista de parámetros con conteo de paréntesis.
      let pDepth = 1;
      const paramsStart = i;
      while (i < source.length && pDepth > 0) {
        const c = source[i];
        if (c === '(') pDepth += 1;
        else if (c === ')') pDepth -= 1;
        i += 1;
      }
      const paramsRaw = source.substring(paramsStart, i - 1);
      // Limpiar anotaciones de tipo en cada parámetro (incluyendo un
      // parámetro de destructuring `{ origen_id, servicio_id, rol_id }: {...}`).
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

// Stub para `getSupabaseAdmin`. Devuelve una cadena fluida donde cada
// tabla registra los filtros aplicados y resuelve a `{ data, error }`
// configurable por tabla:
//   - `reglas_productividad_cirugia` (para `obtenerReglaProductividad`)
//   - `aseguranza_servicios` (para `calcularMontoProductividad`)
//   - `agenda_cirugias` (para `calcularProductividadCirugia`)
//   - `cirugia_productividad` (para `calcularProductividadCirugia` y
//     `listarProductividadCirugia`)
//
// Las llamadas se enrutan por tabla y, dentro de `cirugia_productividad`,
// `update` captura el body para que las pruebas puedan inspeccionar
// `monto`, `regla_id` y `estado`.
function makeProductividadStub(opts) {
  opts = opts || {};
  const reglasData = opts.reglasData !== undefined ? opts.reglasData : null;
  const reglasError = opts.reglasError || null;
  const servicioData = opts.servicioData !== undefined ? opts.servicioData : null;
  const servicioError = opts.servicioError || null;
  const cirugiaData = opts.cirugiaData !== undefined ? opts.cirugiaData : null;
  const cirugiaError = opts.cirugiaError || null;
  const rowsData = opts.rowsData !== undefined ? opts.rowsData : [];
  const rowsError = opts.rowsError || null;
  const updateError = opts.updateError || null;

  const updateCalls = [];
  const calls = [];

  function makeChain(tableName) {
    const captured = { table: tableName, filters: {} };
    let isUpdate = false;
    const chain = {};

    function snapshotCalls() {
      calls.push({
        table: tableName,
        filters: Object.assign({}, captured.filters),
        update: isUpdate ? Object.assign({}, updateBody) : null,
      });
    }

    let updateBody = null;

    chain.select = function () { return chain; };
    chain.insert = function () { return chain; };
    chain.update = function (body) {
      isUpdate = true;
      updateBody = body;
      return chain;
    };
    chain.eq = function (col, val) {
      captured.filters[col] = val;
      return chain;
    };
    chain.neq = function (col, val) {
      captured.filters['__neq_' + col] = val;
      return chain;
    };
    chain.gt = function (col, val) {
      captured.filters['__gt_' + col] = val;
      return chain;
    };
    chain.gte = function (col, val) {
      captured.filters['__gte_' + col] = val;
      return chain;
    };
    chain.lt = function (col, val) {
      captured.filters['__lt_' + col] = val;
      return chain;
    };
    chain.lte = function (col, val) {
      captured.filters['__lte_' + col] = val;
      return chain;
    };
    chain.is = function (col, val) {
      captured.filters['__is_' + col] = val;
      return chain;
    };
    chain.or = function (expr) {
      captured.filters['__or'] = expr;
      return chain;
    };
    chain.in = function (col, vals) {
      captured.filters['__in_' + col] = vals;
      return chain;
    };
    chain.order = function () { return chain; };
    chain.limit = function () { return chain; };
    chain.maybeSingle = async function () {
      snapshotCalls();
      return resolveMaybeSingle();
    };
    chain.single = async function () {
      snapshotCalls();
      return resolveSingle();
    };
    chain.then = function (resolve, reject) {
      try {
        snapshotCalls();
        if (isUpdate) {
          if (updateError) {
            return resolve({ data: null, error: updateError });
          }
          updateCalls.push({
            filters: Object.assign({}, captured.filters),
            body: Object.assign({}, updateBody),
          });
          return resolve({ data: null, error: null });
        }
        return resolve(resolveList());
      } catch (e) {
        if (reject) return reject(e);
        throw e;
      }
    };

    function resolveMaybeSingle() {
      if (tableName === 'reglas_productividad_cirugia') {
        if (reglasError) return { data: null, error: reglasError };
        return { data: reglasData, error: null };
      }
      if (tableName === 'aseguranza_servicios') {
        if (servicioError) return { data: null, error: servicioError };
        return { data: servicioData, error: null };
      }
      if (tableName === 'agenda_cirugias') {
        if (cirugiaError) return { data: null, error: cirugiaError };
        return { data: cirugiaData, error: null };
      }
      return { data: null, error: null };
    }

    function resolveSingle() {
      if (tableName === 'aseguranza_servicios') {
        if (servicioError) return { data: null, error: servicioError };
        return { data: servicioData, error: null };
      }
      if (tableName === 'agenda_cirugias') {
        if (cirugiaError) return { data: null, error: cirugiaError };
        return { data: cirugiaData, error: null };
      }
      return { data: null, error: null };
    }

    function resolveList() {
      if (tableName === 'cirugia_productividad') {
        if (rowsError) return { data: null, error: rowsError };
        return { data: rowsData, error: null };
      }
      return { data: [], error: null };
    }

    return chain;
  }

  return {
    stub: function getSupabaseAdminStub() {
      return {
        from: function (tableName) {
          return makeChain(tableName);
        },
      };
    },
    updateCalls: updateCalls,
    calls: calls,
  };
}

function loadProductividadHelperModule(stubFactory) {
  const content = fs.readFileSync(HELPER_FILE, 'utf8');
  const js = transpileProductividadHelper(content);

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: console,
    getSupabaseAdmin: stubFactory,
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);

  const shim =
    '\nmodule.exports = {' +
    '  obtenerReglaProductividad: typeof obtenerReglaProductividad === "function" ? obtenerReglaProductividad : null,' +
    '  calcularMontoProductividad: typeof calcularMontoProductividad === "function" ? calcularMontoProductividad : null,' +
    '  calcularProductividadCirugia: typeof calcularProductividadCirugia === "function" ? calcularProductividadCirugia : null,' +
    '  listarProductividadCirugia: typeof listarProductividadCirugia === "function" ? listarProductividadCirugia : null' +
    '};';

  vm.runInContext(js + shim, sandbox, {
    filename: 'productividad-cirugia.transpiled.js',
  });
  return sandbox.module.exports;
}

// ---------------------------------------------------------------------------
// [1/5] Migración src/migrations/1800000000200-CreateReglasProductividadCirugia.ts
// ---------------------------------------------------------------------------

function checkMigration() {
  console.log(
    '\n[1/5] Migración reglas_productividad_cirugia: ' +
      path.relative(REPO_ROOT, MIGRATION_FILE)
  );

  const content = fileExistsOrFail(
    MIGRATION_FILE,
    'archivo de la migración existe'
  );
  if (content === null) return;

  // 1. CREATE TABLE reglas_productividad_cirugia
  assertRegexMatches(
    content,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?reglas_productividad_cirugia\b/i,
    "crea la tabla 'reglas_productividad_cirugia'"
  );

  // 2. Columnas requeridas
  assertContainsAll(
    content,
    [
      'origen_id',
      'servicio_id',
      'rol_id',
      'tipo_calculo',
      'valor',
      'moneda',
      'vigente_desde',
      'vigente_hasta',
      'activo',
    ],
    'columnas origen_id, servicio_id, rol_id, tipo_calculo, valor, moneda, vigente_desde, vigente_hasta, activo'
  );

  // 3. Tipo ENUM 'FIJO','PORCENTAJE'
  assertRegexMatches(
    content,
    /CREATE\s+TYPE\s+tipo_calculo_productividad\s+AS\s+ENUM\s*\([^)]*'FIJO'[^)]*'PORCENTAJE'/i,
    "tipo ENUM con valores 'FIJO' y 'PORCENTAJE'"
  );

  // 4. Índice único parcial por (origen_id, servicio_id, rol_id)
  //    WHERE vigente_hasta IS NULL AND activo = true
  assertRegexMatches(
    content,
    /CREATE\s+UNIQUE\s+INDEX\b[\s\S]*?\bON\s+reglas_productividad_cirugia\s*\(\s*origen_id\s*,\s*servicio_id\s*,\s*rol_id\s*\)/i,
    "índice único por (origen_id, servicio_id, rol_id)"
  );
  assertRegexMatches(
    content,
    /WHERE\s+vigente_hasta\s+IS\s+NULL\s+AND\s+activo\s*=\s*true/i,
    'índice único parcial WHERE vigente_hasta IS NULL AND activo = true'
  );

  // 5. RLS habilitado
  assertRegexMatches(
    content,
    /ALTER\s+TABLE\s+reglas_productividad_cirugia\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    'ALTER TABLE reglas_productividad_cirugia ENABLE ROW LEVEL SECURITY'
  );

  // 6. Policies presentes (al menos una)
  const policyMatches = content.match(/CREATE\s+POLICY\b/gi) || [];
  if (policyMatches.length >= 1) {
    ok(
      'CREATE POLICY presente (' + policyMatches.length + ' policies)'
    );
  } else {
    fail(
      'CREATE POLICY presente (al menos una)',
      'no se encontraron CREATE POLICY en la migración'
    );
  }

  // 7. Registrada en scripts/run-migrations.js
  if (!fs.existsSync(RUN_MIGRATIONS_FILE)) {
    fail(
      'scripts/run-migrations.js existe',
      RUN_MIGRATIONS_FILE
    );
    return;
  }
  ok('scripts/run-migrations.js existe');
  const runContent = fs.readFileSync(RUN_MIGRATIONS_FILE, 'utf8');
  assertRegexMatches(
    runContent,
    new RegExp(
      "['\"]" + MIGRATION_FILENAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]"
    ),
    'migración registrada en scripts/run-migrations.js (MIGRATION_ORDER)'
  );
}

// ---------------------------------------------------------------------------
// [2/5] Helper src/lib/productividad-cirugia.ts (estático + runtime)
// ---------------------------------------------------------------------------

async function checkHelper() {
  console.log(
    '\n[2/5] Helper de productividad: ' +
      path.relative(REPO_ROOT, HELPER_FILE)
  );

  const content = fileExistsOrFail(HELPER_FILE, 'archivo del helper existe');
  if (content === null) return;

  // --- Aserciones estáticas -----------------------------------------------

  // 1. Exporta las funciones requeridas.
  [
    'obtenerReglaProductividad',
    'calcularMontoProductividad',
    'calcularProductividadCirugia',
    'listarProductividadCirugia',
  ].forEach(function (fnName) {
    assertRegexMatches(
      content,
      new RegExp(
        'export\\s+async\\s+function\\s+' + fnName + '\\b'
      ),
      'exporta async function ' + fnName
    );
  });

  // 2. Interfaces ReglaProductividadCirugia y ProductividadCirugiaRow.
  assertRegexMatches(
    content,
    /export\s+interface\s+ReglaProductividadCirugia\b/,
    'define export interface ReglaProductividadCirugia'
  );
  assertRegexMatches(
    content,
    /export\s+interface\s+ProductividadCirugiaRow\b/,
    'define export interface ProductividadCirugiaRow'
  );

  // 3. obtenerReglaProductividad: filtros esperados.
  assertRegexMatches(
    content,
    /\.from\(\s*['"]reglas_productividad_cirugia['"]\s*\)/,
    "obtenerReglaProductividad consulta 'reglas_productividad_cirugia'"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]origen_id['"]\s*,\s*origen_id\s*\)/,
    "obtenerReglaProductividad filtra .eq('origen_id', origen_id)"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]servicio_id['"]\s*,\s*servicio_id\s*\)/,
    "obtenerReglaProductividad filtra .eq('servicio_id', servicio_id)"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]rol_id['"]\s*,\s*rol_id\s*\)/,
    "obtenerReglaProductividad filtra .eq('rol_id', rol_id)"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]activo['"]\s*,\s*true\s*\)/,
    "obtenerReglaProductividad filtra .eq('activo', true)"
  );
  assertRegexMatches(
    content,
    /\.lte\(\s*['"]vigente_desde['"]\s*,\s*hoy\s*\)/,
    "obtenerReglaProductividad filtra .lte('vigente_desde', hoy)"
  );
  assertRegexMatches(
    content,
    /\.or\(\s*[`'"]vigente_hasta\.is\.null,vigente_hasta\.gt/,
    "obtenerReglaProductividad filtra .or(vigente_hasta.is.null, vigente_hasta.gt.HOY)"
  );
  assertRegexMatches(
    content,
    /vigente_hasta\.gte\.\$\{hoy\}/,
    "obtenerReglaProductividad usa vigente_hasta.gte.${hoy} en .or()"
  );
  assertRegexMatches(
    content,
    /\.order\(\s*['"]vigente_desde['"]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    "obtenerReglaProductividad ordena por vigente_desde desc"
  );
  assertRegexMatches(
    content,
    /\.limit\(\s*1\s*\)/,
    "obtenerReglaProductividad limita a 1 fila"
  );
  assertRegexMatches(
    content,
    /\.maybeSingle\(\s*\)/,
    "obtenerReglaProductividad termina con .maybeSingle()"
  );

  // 4. calcularMontoProductividad: FIJO devuelve valor; PORCENTAJE consulta
  //    aseguranza_servicios.costo y calcula porcentaje.
  const calcFnBlock = extractFunctionBody(content, 'calcularMontoProductividad');
  if (!calcFnBlock) {
    fail(
      'función calcularMontoProductividad presente',
      'no se encontró el cuerpo de la función'
    );
  } else {
    assertRegexMatches(
      calcFnBlock,
      /regla\.tipo_calculo\s*===\s*['"]FIJO['"]/,
      "calcularMontoProductividad distingue tipo_calculo === 'FIJO'"
    );
    assertRegexMatches(
      calcFnBlock,
      /return\s+Number\(\s*regla\.valor\s*\)/,
      "calcularMontoProductividad retorna Number(regla.valor) para FIJO"
    );
    assertRegexMatches(
      calcFnBlock,
      /regla\.tipo_calculo\s*===\s*['"]PORCENTAJE['"]/,
      "calcularMontoProductividad distingue tipo_calculo === 'PORCENTAJE'"
    );
    assertRegexMatches(
      calcFnBlock,
      /\.from\(\s*['"]aseguranza_servicios['"]\s*\)/,
      "calcularMontoProductividad consulta 'aseguranza_servicios'"
    );
    assertRegexMatches(
      calcFnBlock,
      /\.select\(\s*[`'"`]costo[`'"`]\s*\)/,
      "calcularMontoProductividad selecciona 'costo' del servicio"
    );
    assertRegexMatches(
      calcFnBlock,
      /\.eq\(\s*['"]id['"]\s*,\s*servicio_id\s*\)/,
      "calcularMontoProductividad filtra .eq('id', servicio_id)"
    );
    assertRegexMatches(
      calcFnBlock,
      /costo\s*\*\s*\(?\s*Number\(\s*regla\.valor\s*\)/,
      'calcularMontoProductividad calcula costo * (valor/100) en PORCENTAJE'
    );
  }

  // 5. calcularProductividadCirugia: orquesta obtenerReglaProductividad +
  //    update de cirugia_productividad con monto y regla_id.
  const calcCirFnBlock = extractFunctionBody(content, 'calcularProductividadCirugia');
  if (!calcCirFnBlock) {
    fail(
      'función calcularProductividadCirugia presente',
      'no se encontró el cuerpo de la función'
    );
  } else {
    assertRegexMatches(
      calcCirFnBlock,
      /\.from\(\s*['"]agenda_cirugias['"]\s*\)/,
      "calcularProductividadCirugia consulta 'agenda_cirugias'"
    );
    assertRegexMatches(
      calcCirFnBlock,
      /\.from\(\s*['"]cirugia_productividad['"]\s*\)/,
      "calcularProductividadCirugia consulta 'cirugia_productividad'"
    );
    assertRegexMatches(
      calcCirFnBlock,
      /\.eq\(\s*['"]cirugia_id['"]\s*,\s*cirugia_id\s*\)/,
      "calcularProductividadCirugia filtra .eq('cirugia_id', cirugia_id)"
    );
    assertRegexMatches(
      calcCirFnBlock,
      /obtenerReglaProductividad\s*\(/,
      'calcularProductividadCirugia invoca obtenerReglaProductividad'
    );
    assertRegexMatches(
      calcCirFnBlock,
      /calcularMontoProductividad\s*\(/,
      'calcularProductividadCirugia invoca calcularMontoProductividad'
    );
    assertRegexMatches(
      calcCirFnBlock,
      /\.update\s*\(/,
      'calcularProductividadCirugia hace update de cirugia_productividad'
    );
    assertRegexMatches(
      calcCirFnBlock,
      /\bmonto\s*[:,]/,
      "calcularProductividadCirugia actualiza campo 'monto'"
    );
    assertRegexMatches(
      calcCirFnBlock,
      /regla_id\s*:/,
      "calcularProductividadCirugia actualiza campo 'regla_id'"
    );
    assertRegexMatches(
      calcCirFnBlock,
      /estado\s*:\s*['"]PENDIENTE['"]/,
      "calcularProductividadCirugia mantiene estado = 'PENDIENTE'"
    );
  }

  // 6. listarProductividadCirugia: consulta cirugia_productividad.
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+listarProductividadCirugia\b/,
    'exporta async function listarProductividadCirugia'
  );
  const listFnBlock = extractFunctionBody(content, 'listarProductividadCirugia');
  if (listFnBlock) {
    assertRegexMatches(
      listFnBlock,
      /\.from\(\s*['"]cirugia_productividad['"]\s*\)/,
      "listarProductividadCirugia consulta 'cirugia_productividad'"
    );
    assertRegexMatches(
      listFnBlock,
      /\.eq\(\s*['"]cirugia_id['"]\s*,\s*cirugia_id\s*\)/,
      "listarProductividadCirugia filtra .eq('cirugia_id', cirugia_id)"
    );
    assertRegexMatches(
      listFnBlock,
      /\.order\(\s*['"]created_at['"]\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/,
      "listarProductividadCirugia ordena por created_at ascendente"
    );
  }

  // 7. Usa getSupabaseAdmin() (cliente servidor).
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );

  // --- Aserciones de runtime (async) --------------------------------------

  let mod;
  try {
    const helper = makeProductividadStub({ reglasData: null });
    mod = loadProductividadHelperModule(helper.stub);
  } catch (e) {
    fail(
      'cargar productividad-cirugia en runtime',
      'transpile/eval falló: ' + e.message
    );
    return;
  }
  ok('cargar productividad-cirugia en runtime');

  if (!mod || typeof mod.obtenerReglaProductividad !== 'function') {
    fail('exports del módulo cargados', 'obtenerReglaProductividad no está disponible');
    return;
  }
  if (typeof mod.calcularMontoProductividad !== 'function') {
    fail('exports del módulo cargados', 'calcularMontoProductividad no está disponible');
    return;
  }
  if (typeof mod.calcularProductividadCirugia !== 'function') {
    fail('exports del módulo cargados', 'calcularProductividadCirugia no está disponible');
    return;
  }
  if (typeof mod.listarProductividadCirugia !== 'function') {
    fail('exports del módulo cargados', 'listarProductividadCirugia no está disponible');
    return;
  }
  ok(
    'exports del módulo cargados (obtenerReglaProductividad, calcularMontoProductividad, calcularProductividadCirugia, listarProductividadCirugia)'
  );

  const runtimeChecks = [];

  // ---- obtenerReglaProductividad: aplica filtros eq + lte + or + order ---
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({
        reglasData: {
          id: 'regla-1',
          origen_id: 'orig-1',
          servicio_id: 'srv-1',
          rol_id: 'rol-1',
          tipo_calculo: 'FIJO',
          valor: 250,
          moneda: 'PESOS',
        },
      });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .obtenerReglaProductividad({
          origen_id: 'orig-1',
          servicio_id: 'srv-1',
          rol_id: 'rol-1',
        })
        .then(function (res) {
          if (!res || res.id !== 'regla-1') {
            fail(
              'obtenerReglaProductividad retorna la regla stub',
              'obtuvo ' + JSON.stringify(res)
            );
            return;
          }
          ok('obtenerReglaProductividad retorna la regla stub');

          // Verificar que los filtros eq() estén aplicados (origen, servicio, rol, activo).
          const reglasCalls = helper.calls.filter(function (c) {
            return c.table === 'reglas_productividad_cirugia';
          });
          if (reglasCalls.length === 0) {
            fail(
              'obtenerReglaProductividad consulta reglas_productividad_cirugia',
              'no se registró ninguna llamada'
            );
            return;
          }
          const filt = reglasCalls[0].filters;
          const expectedFilt = {
            origen_id: 'orig-1',
            servicio_id: 'srv-1',
            rol_id: 'rol-1',
            activo: true,
          };
          const missingFilt = [];
          Object.keys(expectedFilt).forEach(function (k) {
            if (filt[k] !== expectedFilt[k]) missingFilt.push(k);
          });
          if (missingFilt.length === 0) {
            ok(
              "obtenerReglaProductividad aplica eq(origen_id, servicio_id, rol_id, activo=true) (4 filtros)"
            );
          } else {
            fail(
              'obtenerReglaProductividad aplica eq(origen_id, servicio_id, rol_id, activo=true)',
              'faltan o son incorrectos: ' + missingFilt.join(', ')
            );
          }
          if (filt['__lte_vigente_desde']) {
            ok(
              "obtenerReglaProductividad aplica lte(vigente_desde, hoy)"
            );
          } else {
            fail(
              'obtenerReglaProductividad aplica lte(vigente_desde, hoy)',
              'no se encontró __lte_vigente_desde en filtros'
            );
          }
          if (typeof filt['__or'] === 'string' &&
              filt['__or'].includes('vigente_hasta.is.null') &&
              filt['__or'].includes('vigente_hasta.gte.')) {
            ok(
              'obtenerReglaProductividad aplica or(vigente_hasta.is.null, vigente_hasta.gte.HOY)'
            );
          } else {
            fail(
              'obtenerReglaProductividad aplica or(vigente_hasta.is.null, vigente_hasta.gte.HOY)',
              'obtuvo __or=' + JSON.stringify(filt['__or'])
            );
          }
        })
        .catch(function (e) {
          fail('obtenerReglaProductividad()', 'excepción: ' + e.message);
        });
    })()
  );

  // ---- obtenerReglaProductividad sin resultado -> null --------------------
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({ reglasData: null });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .obtenerReglaProductividad({
          origen_id: 'orig-x',
          servicio_id: 'srv-x',
          rol_id: 'rol-x',
        })
        .then(function (res) {
          if (res === null || res === undefined) {
            ok('obtenerReglaProductividad sin match -> null/undefined');
          } else {
            fail(
              'obtenerReglaProductividad sin match -> null',
              'obtuvo ' + JSON.stringify(res)
            );
          }
        })
        .catch(function (e) {
          fail(
            'obtenerReglaProductividad sin match',
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- obtenerReglaProductividad con error -> throw ------------------------
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({
        reglasError: { message: 'PGRST116 no rows' },
      });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .obtenerReglaProductividad({
          origen_id: 'orig-e',
          servicio_id: 'srv-e',
          rol_id: 'rol-e',
        })
        .then(
          function () {
            fail(
              'obtenerReglaProductividad con error -> throw',
              'resolvió sin lanzar'
            );
          },
          function (err) {
            if (err && /regla de productividad/i.test(err.message)) {
              ok(
                'obtenerReglaProductividad con error -> throw con mensaje "regla de productividad"'
              );
            } else {
              fail(
                'obtenerReglaProductividad con error -> throw con mensaje',
                'obtuvo: ' + (err && err.message)
              );
            }
          }
        );
    })()
  );

  // ---- calcularMontoProductividad FIJO -> valor ----------------------------
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({});
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .calcularMontoProductividad(
          {
            id: 'r1',
            origen_id: 'o',
            servicio_id: 's',
            rol_id: 'r',
            tipo_calculo: 'FIJO',
            valor: 750.5,
            moneda: 'PESOS',
          },
          'srv-1'
        )
        .then(function (res) {
          if (res === 750.5) {
            ok(
              "calcularMontoProductividad tipo='FIJO' retorna valor (750.5)"
            );
          } else {
            fail(
              "calcularMontoProductividad tipo='FIJO' retorna valor",
              'obtuvo ' + JSON.stringify(res)
            );
          }
        })
        .catch(function (e) {
          fail(
            "calcularMontoProductividad tipo='FIJO'",
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- calcularMontoProductividad PORCENTAJE -> costo * valor/100 ----------
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({
        servicioData: { id: 'srv-1', costo: 1000 },
      });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .calcularMontoProductividad(
          {
            id: 'r2',
            origen_id: 'o',
            servicio_id: 's',
            rol_id: 'r',
            tipo_calculo: 'PORCENTAJE',
            valor: 15,
            moneda: 'PESOS',
          },
          'srv-1'
        )
        .then(function (res) {
          if (res === 150) {
            ok(
              "calcularMontoProductividad tipo='PORCENTAJE' 15% de 1000 -> 150"
            );
          } else {
            fail(
              "calcularMontoProductividad tipo='PORCENTAJE' 15% de 1000 -> 150",
              'obtuvo ' + JSON.stringify(res)
            );
          }
          // Verificar que la consulta a aseguranza_servicios se hizo.
          const srvCalls = helper.calls.filter(function (c) {
            return c.table === 'aseguranza_servicios';
          });
          if (srvCalls.length === 1 && srvCalls[0].filters.id === 'srv-1') {
            ok(
              "calcularMontoProductividad PORCENTAJE consulta aseguranza_servicios.id = 'srv-1'"
            );
          } else {
            fail(
              "calcularMontoProductividad PORCENTAJE consulta aseguranza_servicios.id = servicio_id",
              'calls=' + JSON.stringify(srvCalls)
            );
          }
        })
        .catch(function (e) {
          fail(
            "calcularMontoProductividad tipo='PORCENTAJE'",
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- calcularMontoProductividad PORCENTAJE sin servicio -> 0 -------------
  runtimeChecks.push(
    (function () {
      const helper = makeProductividadStub({
        servicioData: null,
        servicioError: { message: 'not found' },
      });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .calcularMontoProductividad(
          {
            id: 'r3',
            origen_id: 'o',
            servicio_id: 's',
            rol_id: 'r',
            tipo_calculo: 'PORCENTAJE',
            valor: 10,
            moneda: 'PESOS',
          },
          'srv-x'
        )
        .then(function (res) {
          if (res === 0) {
            ok(
              "calcularMontoProductividad PORCENTAJE sin costo -> 0"
            );
          } else {
            fail(
              "calcularMontoProductividad PORCENTAJE sin costo -> 0",
              'obtuvo ' + JSON.stringify(res)
            );
          }
        })
        .catch(function (e) {
          fail(
            'calcularMontoProductividad PORCENTAJE sin costo',
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- listarProductividadCirugia: propaga filas --------------------------
  runtimeChecks.push(
    (function () {
      const sample = [
        { id: 'cp-1', cirugia_id: 'cir-1', rol_id: 'rol-1', monto: 250 },
        { id: 'cp-2', cirugia_id: 'cir-1', rol_id: 'rol-2', monto: null },
      ];
      const helper = makeProductividadStub({ rowsData: sample });
      const m = loadProductividadHelperModule(helper.stub);
      return m
        .listarProductividadCirugia('cir-1')
        .then(function (res) {
          if (Array.isArray(res) && res.length === 2 &&
              res[0].id === 'cp-1' && res[1].id === 'cp-2') {
            ok(
              'listarProductividadCirugia retorna 2 filas en orden created_at asc (' +
                JSON.stringify(res.map(function (r) { return r.id; })) +
                ')'
            );
          } else {
            fail(
              'listarProductividadCirugia retorna filas en orden',
              'obtuvo ' + JSON.stringify(res)
            );
          }
        })
        .catch(function (e) {
          fail('listarProductividadCirugia()', 'excepción: ' + e.message);
        });
    })()
  );

  // ---- calcularProductividadCirugia: 2 filas -> 2 updates con regla ------
  runtimeChecks.push(
    (function () {
      // agenda_cirugias stub + 2 filas en cirugia_productividad; las dos
      // resuelven a una regla FIJO con valor 100/200 respectivamente.
      const cirugia = {
        id: 'cir-x',
        origen_id: 'orig-x',
        servicio_id: 'srv-x',
      };
      const rows = [
        { id: 'cp-1', cirugia_id: 'cir-x', rol_id: 'rol-a' },
        { id: 'cp-2', cirugia_id: 'cir-x', rol_id: 'rol-b' },
      ];
      let reglaCallIdx = 0;
      const reglas = [
        { id: 'regla-a', origen_id: 'orig-x', servicio_id: 'srv-x', rol_id: 'rol-a',
          tipo_calculo: 'FIJO', valor: 100, moneda: 'PESOS' },
        { id: 'regla-b', origen_id: 'orig-x', servicio_id: 'srv-x', rol_id: 'rol-b',
          tipo_calculo: 'FIJO', valor: 200, moneda: 'PESOS' },
      ];
      const updateCalls = [];

      function makeGated() {
        return function () {
          return {
            from: function (tableName) {
              const captured = { table: tableName, filters: {}, isUpdate: false };
              let updateBody = null;
              const chain = {};
              function snapshot() {
                if (tableName === 'reglas_productividad_cirugia') {
                  // Forzar filtrado eq(activo=true) y eq(rol_id) que el
                  // helper debe aplicar.
                  const last = captured.filters;
                  return {
                    table: tableName,
                    filters: Object.assign({}, last),
                    isUpdate: false,
                  };
                }
                return {
                  table: tableName,
                  filters: Object.assign({}, captured.filters),
                  isUpdate: captured.isUpdate,
                };
              }
              chain.select = function () { return chain; };
              chain.insert = function () { return chain; };
              chain.update = function (body) {
                captured.isUpdate = true;
                updateBody = body;
                return chain;
              };
              chain.eq = function (col, val) {
                captured.filters[col] = val;
                return chain;
              };
              chain.lte = function (col, val) {
                captured.filters['__lte_' + col] = val;
                return chain;
              };
              chain.is = function (col, val) {
                captured.filters['__is_' + col] = val;
                return chain;
              };
              chain.or = function (expr) {
                captured.filters['__or'] = expr;
                return chain;
              };
              chain.order = function () { return chain; };
              chain.limit = function () { return chain; };
              chain.maybeSingle = async function () {
                const snap = snapshot();
                if (tableName === 'reglas_productividad_cirugia') {
                  return {
                    data: reglas[reglaCallIdx++] || null,
                    error: null,
                  };
                }
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugia, error: null };
                }
                return { data: null, error: null };
              };
              chain.single = async function () {
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugia, error: null };
                }
                return { data: null, error: null };
              };
              chain.then = function (resolve, reject) {
                try {
                  if (captured.isUpdate) {
                    updateCalls.push({
                      filters: Object.assign({}, captured.filters),
                      body: updateBody,
                    });
                    return resolve({ data: null, error: null });
                  }
                  if (tableName === 'cirugia_productividad') {
                    return resolve({ data: rows, error: null });
                  }
                  return resolve({ data: null, error: null });
                } catch (e) {
                  if (reject) return reject(e);
                  throw e;
                }
              };
              return chain;
            },
          };
        };
      }
      const m = loadProductividadHelperModule(makeGated());
      return m
        .calcularProductividadCirugia('cir-x')
        .then(function (res) {
          if (res && res.actualizados === 2 && res.sin_regla === 0) {
            ok(
              'calcularProductividadCirugia devuelve { actualizados: 2, sin_regla: 0 }'
            );
          } else {
            fail(
              'calcularProductividadCirugia devuelve contadores',
              'obtuvo ' + JSON.stringify(res)
            );
          }
          if (updateCalls.length !== 2) {
            fail(
              'calcularProductividadCirugia hace 2 updates en cirugia_productividad',
              'realizó ' + updateCalls.length
            );
            return;
          }
          ok(
            'calcularProductividadCirugia hace 2 updates en cirugia_productividad'
          );

          // Cada update debe llevar monto + regla_id + estado PENDIENTE
          // y filtrar por id de la fila correspondiente.
          const expectedRows = [
            { id: 'cp-1', reglaId: 'regla-a', monto: 100 },
            { id: 'cp-2', reglaId: 'regla-b', monto: 200 },
          ];
          let allOk = true;
          for (let i = 0; i < expectedRows.length; i++) {
            const upd = updateCalls[i];
            const exp = expectedRows[i];
            if (!upd.body ||
                upd.body.monto !== exp.monto ||
                upd.body.regla_id !== exp.reglaId ||
                upd.body.estado !== 'PENDIENTE') {
              allOk = false;
              fail(
                'update[' + i + '] lleva { monto, regla_id, estado: PENDIENTE }',
                'body=' + JSON.stringify(upd.body)
              );
            }
            if (!upd.filters || upd.filters.id !== exp.id) {
              allOk = false;
              fail(
                'update[' + i + '] filtra por id de la fila de productividad',
                'filters=' + JSON.stringify(upd.filters)
              );
            }
          }
          if (allOk) {
            ok(
              'updates llevan { monto, regla_id, estado: PENDIENTE } y filtran por id de la fila (2)'
            );
          }
        })
        .catch(function (e) {
          fail(
            'calcularProductividadCirugia()',
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- calcularProductividadCirugia: fila sin rol_id -> sin_regla += 1 ----
  runtimeChecks.push(
    (function () {
      const cirugia = {
        id: 'cir-y',
        origen_id: 'orig-y',
        servicio_id: 'srv-y',
      };
      const rows = [
        { id: 'cp-1', cirugia_id: 'cir-y', rol_id: null },
      ];
      const updateCalls = [];
      function makeStub() {
        return function () {
          return {
            from: function (tableName) {
              const chain = {};
              chain.select = function () { return chain; };
              chain.insert = function () { return chain; };
              chain.update = function (body) {
                chain.__updateBody = body;
                return chain;
              };
              chain.eq = function () { return chain; };
              chain.lte = function () { return chain; };
              chain.is = function () { return chain; };
              chain.or = function () { return chain; };
              chain.order = function () { return chain; };
              chain.limit = function () { return chain; };
              chain.maybeSingle = async function () {
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugia, error: null };
                }
                return { data: null, error: null };
              };
              chain.single = async function () {
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugia, error: null };
                }
                return { data: null, error: null };
              };
              chain.then = function (resolve, reject) {
                try {
                  if (chain.__updateBody) {
                    updateCalls.push(chain.__updateBody);
                    return resolve({ data: null, error: null });
                  }
                  if (tableName === 'cirugia_productividad') {
                    return resolve({ data: rows, error: null });
                  }
                  return resolve({ data: null, error: null });
                } catch (e) {
                  if (reject) return reject(e);
                  throw e;
                }
              };
              return chain;
            },
          };
        };
      }
      const m = loadProductividadHelperModule(makeStub());
      return m
        .calcularProductividadCirugia('cir-y')
        .then(function (res) {
          if (res && res.actualizados === 0 && res.sin_regla === 1) {
            ok(
              'calcularProductividadCirugia cuenta sin_regla cuando rol_id es null'
            );
          } else {
            fail(
              'calcularProductividadCirugia cuenta sin_regla cuando rol_id es null',
              'obtuvo ' + JSON.stringify(res)
            );
          }
          if (updateCalls.length === 0) {
            ok(
              'calcularProductividadCirugia no llama .update() cuando no hay rol_id'
            );
          } else {
            fail(
              'calcularProductividadCirugia no llama .update() cuando no hay rol_id',
              'realizó ' + updateCalls.length + ' update(s)'
            );
          }
        })
        .catch(function (e) {
          fail(
            'calcularProductividadCirugia() sin rol_id',
            'excepción: ' + e.message
          );
        });
    })()
  );

  // ---- calcularProductividadCirugia: cirugía sin origen -> throw ----------
  runtimeChecks.push(
    (function () {
      const cirugiaIncompleta = {
        id: 'cir-z',
        origen_id: null,
        servicio_id: 'srv-z',
      };
      function makeStub() {
        return function () {
          return {
            from: function (tableName) {
              const chain = {};
              chain.select = function () { return chain; };
              chain.insert = function () { return chain; };
              chain.update = function () { return chain; };
              chain.eq = function () { return chain; };
              chain.lte = function () { return chain; };
              chain.is = function () { return chain; };
              chain.or = function () { return chain; };
              chain.order = function () { return chain; };
              chain.limit = function () { return chain; };
              chain.maybeSingle = async function () {
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugiaIncompleta, error: null };
                }
                return { data: null, error: null };
              };
              chain.single = async function () {
                if (tableName === 'agenda_cirugias') {
                  return { data: cirugiaIncompleta, error: null };
                }
                return { data: null, error: null };
              };
              chain.then = function (resolve) {
                return resolve({ data: null, error: null });
              };
              return chain;
            },
          };
        };
      }
      const m = loadProductividadHelperModule(makeStub());
      return m
        .calcularProductividadCirugia('cir-z')
        .then(
          function () {
            fail(
              'calcularProductividadCirugia sin origen/servicio -> throw',
              'resolvió sin lanzar'
            );
          },
          function (err) {
            if (err && /origen|servicio/i.test(err.message)) {
              ok(
                'calcularProductividadCirugia sin origen/servicio -> throw con mensaje claro'
              );
            } else {
              fail(
                'calcularProductividadCirugia sin origen/servicio -> throw',
                'obtuvo: ' + (err && err.message)
              );
            }
          }
        );
    })()
  );

  await Promise.all(runtimeChecks);
}

// ---------------------------------------------------------------------------
// [3/5] Endpoint src/app/api/cirugias/route.ts: invoca calcularProductividadCirugia
// ---------------------------------------------------------------------------

function checkCirugiasRoute() {
  console.log(
    '\n[3/5] Endpoint POST /api/cirugias: integración con productividad'
  );

  const content = fileExistsOrFail(
    CIRUGIAS_ROUTE_FILE,
    'archivo del endpoint /api/cirugias existe'
  );
  if (content === null) return;

  // 1. Importa calcularProductividadCirugia desde @/lib/productividad.
  assertRegexMatches(
    content,
    /import\s+\{[^}]*\bcalcularProductividadCirugia\b[^}]*\}\s*from\s*['"]@\/lib\/productividad['"]/,
    "importa calcularProductividadCirugia desde '@/lib/productividad'"
  );

  // 2. Tras crear la cirugía vía RPC, llama a calcularProductividadCirugia.
  //    Comprobamos que el archivo llame al RPC y luego al helper con
  //    result.cirugia_id.
  assertRegexMatches(
    content,
    /supabase\s*\.\s*rpc\s*\(\s*['"]crear_cirugia['"]/,
    "llama a supabase.rpc('crear_cirugia', ...)"
  );
  assertRegexMatches(
    content,
    /calcularProductividadCirugia\s*\(\s*cirugiaId\s*\)/,
    'llama a calcularProductividadCirugia(cirugiaId)'
  );
  assertRegexMatches(
    content,
    /cirugiaId\s*=\s*\(\s*result\s+(?:as\s+any\s*)?\)\s*\?\s*\.\s*cirugia_id/,
    'deriva cirugiaId desde (result as any)?.cirugia_id antes de invocar el helper'
  );

  // 3. Lo envuelve en try/catch para no interrumpir la creación si falla.
  assertRegexMatches(
    content,
    /try\s*\{[\s\S]*?calcularProductividadCirugia[\s\S]*?\}\s*catch/,
    'envuelve la llamada al helper en try/catch (no interrumpe creación)'
  );

  // 4. Sigue devolviendo 201 con el resultado.
  assertRegexMatches(
    content,
    /NextResponse\s*\.\s*json\s*\(\s*result\s*,\s*\{\s*status\s*:\s*201\s*\}\s*\)/,
    'responde 201 con el resultado de la creación'
  );
}

// ---------------------------------------------------------------------------
// [4/5] Endpoint src/app/api/cirugias/[id]/productividad/route.ts + RPC PENDIENTE
// ---------------------------------------------------------------------------

function checkProductividadEndpointAndRPC() {
  console.log(
    '\n[4/5] Endpoint GET /api/cirugias/[id]/productividad y RPC crear_cirugia'
  );

  // ---- Endpoint GET productividad -----------------------------------------
  const content = fileExistsOrFail(
    PRODUCTIVIDAD_ROUTE_FILE,
    'archivo del endpoint /api/cirugias/[id]/productividad existe'
  );
  if (content === null) return;

  // 1. Exporta GET
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );

  // 2. Usa requireAuth()
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar'
  );

  // 3. Usa listarProductividadCirugia(id)
  assertRegexMatches(
    content,
    /import\s+\{[^}]*\blistarProductividadCirugia\b[^}]*\}\s*from\s*['"]@\/lib\/productividad['"]/,
    "importa listarProductividadCirugia desde '@/lib/productividad'"
  );
  assertRegexMatches(
    content,
    /listarProductividadCirugia\s*\(\s*id\s*\)/,
    'invoca listarProductividadCirugia(id)'
  );

  // 4. Maneja error con 500
  assertRegexMatches(
    content,
    /status\s*:\s*500/,
    'responde 500 ante error interno'
  );

  // ---- RPC crear_cirugia: inserta filas PENDIENTE (PRD-001) ---------------
  const migContent = fileExistsOrFail(
    CREAR_CIRUGIA_RPC_FILE,
    'archivo de migración RPC crear_cirugia existe'
  );
  if (migContent === null) return;

  // 1. Inserta en cirugia_productividad con estado='PENDIENTE' y monto NULL
  //    por participante.
  const insertBlock = (migContent.match(
    /INSERT\s+INTO\s+cirugia_productividad[\s\S]*?\)\s*;/i
  ) || [''])[0];
  if (!insertBlock) {
    fail(
      'INSERT INTO cirugia_productividad con estado PENDIENTE / monto NULL',
      'no se encontró el bloque INSERT'
    );
  } else {
    assertContainsAll(
      insertBlock,
      ['estado', 'monto'],
      "PRD-001 INSERT en cirugia_productividad referencia estado y monto"
    );
    assertRegexMatches(
      insertBlock,
      /'PENDIENTE'/,
      "PRD-001 INSERT usa estado = 'PENDIENTE'"
    );
    assertRegexMatches(
      insertBlock,
      /monto\s*[,)]|monto\s*\)|\bNULL\b/,
      'PRD-001 INSERT usa monto NULL'
    );
  }
}

// ---------------------------------------------------------------------------
// [5/5] Script npm test:b8 + integridad de test:b1..b7
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[5/5] Script npm test:b8 e integridad de test:b1..b7');

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
    typeof scripts['test:b8'] === 'string' &&
    scripts['test:b8'].length > 0
  ) {
    ok(
      'script npm "test:b8" definido (' +
        JSON.stringify(scripts['test:b8']) +
        ')'
    );
  } else {
    fail('script npm "test:b8" definido', 'ausente o vacío en package.json');
  }

  ['test:b1', 'test:b2', 'test:b3', 'test:b4', 'test:b5', 'test:b6', 'test:b7'].forEach(function (key) {
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
  console.log(' Pruebas B8 - Productividad base (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkMigration();
  await checkHelper();
  checkCirugiasRoute();
  checkProductividadEndpointAndRPC();
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
      '\nLa prueba B8 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B8 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main().catch(function (e) {
  console.error('ERROR inesperado en B8: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
