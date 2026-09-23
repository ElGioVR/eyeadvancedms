#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B7 (LIO: inventario → cirugía
 * homologada, con relación por FK `inventario_item_id` sin copiar
 * marca/modelo/lote a columnas de texto) de Fase 1
 * (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * IDs cubiertos: LIO-001, LIO-002, LIO-003 (ver
 * `docs/cirugias/fase-1-creacion-cirugia.md`).
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente y un mini-runtime con `vm.runInContext`
 * para ejercitar `listarLIOsDisponibles` y `validarLIO` contra una cadena
 * Supabase stub. NO conecta a Supabase/PostgreSQL ni ejecuta migraciones;
 * sólo lee el contenido del repo y verifica que estén los elementos
 * obligatorios del bloque B7:
 *
 *   - Endpoint `src/app/api/inventario/disponible/route.ts`:
 *       * consulta `inventario_items`
 *       * filtra `estado = 'DISPONIBLE'` y `stock > 0`
 *       * filtra caducidad (`fecha_caducidad.is.null` o `fecha_caducidad.gt.HOY`)
 *       * el `select` incluye `lote`, `fecha_caducidad`, `tipo_lio`,
 *         `marca`, `modelo`, `stock`
 *       * el mapeo de respuesta propaga esos campos
 *
 *   - Helper `src/lib/lio.ts`:
 *       * exporta `listarLIOsDisponibles` y `validarLIO`
 *       * define `LIODisponible` con id, marca, modelo, tipo_lio, lote,
 *         fecha_caducidad (mínimo 5 datos visibles)
 *       * usa `getSupabaseAdmin()`
 *       * `validarLIO` rechaza: item inexistente, tipo distinto a
 *         LENTE_INTRAOCULAR, estado no DISPONIBLE, stock < 1, fecha de
 *         caducidad vencida
 *
 *   - Componente `src/components/cirugia/LIOSelector.tsx`:
 *       * `'use client'`
 *       * importa `cn` desde `@/lib/utils`
 *       * acepta props `value`, `onChange`, `disabled`, `placeholder`,
 *         `className`
 *       * hace fetch a `/api/inventario/disponible?tipo=LENTE_INTRAOCULAR`
 *       * el texto de las opciones incluye marca, modelo, tipo_lio,
 *         lote, caducidad y stock
 *       * el resumen del seleccionado incluye marca, modelo, tipo, lote,
 *         caducidad
 *
 *   - `src/app/(dashboard)/agenda/AgendaContent.tsx`:
 *       * importa `LIOSelector` desde `@/components/cirugia/LIOSelector`
 *       * renderiza `<LIOSelector value={form.inventario_item_id}
 *         onChange={handleLIOSelect} />`
 *       * `handleLIOSelect` actualiza `inventario_item_id` y NO copia
 *         marca/modelo a `lio`/`marca_lio`
 *
 *   - Creación de cirugía:
 *       * `src/app/api/cirugias/route.ts` acepta `inventario_item_id`
 *         opcional y lo pasa al RPC `crear_cirugia`
 *       * `src/migrations/1800000000180-CreateCrearCirugiaRPC.ts`
 *         valida LIO si se envía; inserta solo `inventario_item_id`; no
 *         inserta `lio`/`marca_lio`
 *
 *   - Script npm `test:b7` en package.json (sin tocar test:b1..b6).
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

const INVENTARIO_ENDPOINT_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'inventario',
  'disponible',
  'route.ts'
);
const LIO_HELPER_FILE = path.join(REPO_ROOT, 'src', 'lib', 'lio.ts');
const LIO_SELECTOR_FILE = path.join(
  REPO_ROOT,
  'src',
  'components',
  'cirugia',
  'LIOSelector.tsx'
);
const AGENDA_CONTENT_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'agenda',
  'AgendaContent.tsx'
);
const CIRUGIAS_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'route.ts'
);
const CREAR_CIRUGIA_MIGRATION_FILE = path.join(
  REPO_ROOT,
  'src',
  'migrations',
  '1800000000180-CreateCrearCirugiaRPC.ts'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1..b6)
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
// Transpilador mínimo TS -> JS para `src/lib/lio.ts`
// ---------------------------------------------------------------------------
//
// `lio.ts` usa:
//   - `import { ... } from '...';`                              -> eliminada
//   - `export interface LIODisponible { ... }`                  -> eliminada
//   - `export interface ValidarLIOResult { ... }`               -> eliminada
//   - `export async function listarLIOsDisponibles(): P { ... }` -> strip tipo
//   - `export async function validarLIO(x: string): P { ... }`    -> strip tipo
//   - `aserciones` `as Type` y `as Type<X>`                      -> strip
//
// Estrategia regex-driven + escáner con conteo de paréntesis/llaves
// (mismo patrón que el transpilador de b5/b6). Si en el futuro el helper
// agrega sintaxis TS más compleja (genéricos con varios parámetros, tipos
// condicionales, etc.) este transpilador deberá extenderse.

function transpileLioHelper(content) {
  let js = content;

  // 1. Eliminar líneas de import (incluyendo `import type { ... }`).
  js = js.replace(/^\s*import\s+[^;]+;\s*$/gm, '');

  // 2. Eliminar `export interface X { ... }` (el archivo sólo contiene
  //    interfaces planas, sin anidamiento).
  js = js.replace(/export\s+interface\s+\w+\s*\{[^}]*\}/g, '');

  // 3. Strip la palabra clave `export` antes de declaraciones top-level
  //    (const / function / async function).
  js = js.replace(
    /\bexport\s+(const|async\s+function|function)\b/g,
    '$1'
  );

  // 4. Convertir `const X: T = ...` -> `const X = ...` (strip anotación
  //    de tipo en `const`).
  js = js.replace(
    /(\bconst\s+[A-Za-z_$][\w$]*)\s*:\s*[^=]+=/g,
    '$1 ='
  );

  // 4b. Strip aserciones de tipo `expr as Type` y `expr as Type<X>`.
  js = js.replace(
    /\s+as\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?/g,
    ''
  );

  // 5. Funciones: saltamos la lista de parámetros contando paréntesis,
  //    limpiamos anotaciones de tipo de cada parámetro y eliminamos el
  //    tipo de retorno hasta el `{` del cuerpo.
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

// Stubs para `getSupabaseAdmin`. Devuelve un cliente con `from(TABLE)`
// registrando filtros y devolviendo datos configurables por tabla:
//   - `.single()` => `{ data, error }` (usado por `validarLIO`).
//   - `await chain` => `{ data, error }` (usado por `listarLIOsDisponibles`,
//     que termina con `await query`).
function makeLioStub(opts) {
  const singleData = opts && opts.singleData ? opts.singleData : null;
  const singleError = opts && opts.singleError ? opts.singleError : null;
  const listData = opts && opts.listData ? opts.listData : null;
  const listError = opts && opts.listError ? opts.listError : null;

  function makeChain(tableName) {
    const captured = { table: tableName, filters: {}, isSingle: false };
    const chain = {};
    chain.select = function () { return chain; };
    chain.insert = function () { return chain; };
    chain.update = function () { return chain; };
    chain.eq = function (col, val) {
      captured.filters[col] = val;
      return chain;
    };
    chain.gt = function (col, val) {
      captured.filters['__gt_' + col] = val;
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
    chain.maybeSingle = async function () {
      captured.isSingle = true;
      if (singleError) return { data: null, error: singleError };
      return { data: singleData, error: null };
    };
    chain.single = async function () {
      captured.isSingle = true;
      if (singleError) return { data: null, error: singleError };
      return { data: singleData, error: null };
    };
    // `await chain` resuelve a `{ data, error }` directamente.
    chain.then = function (resolve, reject) {
      try {
        if (listError) {
          return resolve({ data: null, error: listError });
        }
        return resolve({ data: listData, error: null });
      } catch (e) {
        if (reject) return reject(e);
        throw e;
      }
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

function loadLioHelperModule(stubFactory) {
  const content = fs.readFileSync(LIO_HELPER_FILE, 'utf8');
  const js = transpileLioHelper(content);

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
    '  listarLIOsDisponibles: typeof listarLIOsDisponibles === "function" ? listarLIOsDisponibles : null,' +
    '  validarLIO: typeof validarLIO === "function" ? validarLIO : null' +
    '};';

  vm.runInContext(js + shim, sandbox, {
    filename: 'lio.transpiled.js',
  });
  return sandbox.module.exports;
}

// ---------------------------------------------------------------------------
// [1/6] Endpoint src/app/api/inventario/disponible/route.ts
// ---------------------------------------------------------------------------

function checkInventarioEndpoint() {
  console.log(
    '\n[1/6] Endpoint inventario/disponible: ' +
      path.relative(REPO_ROOT, INVENTARIO_ENDPOINT_FILE)
  );

  const content = fileExistsOrFail(
    INVENTARIO_ENDPOINT_FILE,
    'archivo del endpoint existe'
  );
  if (content === null) return;

  // 1. Consulta inventario_items
  assertRegexMatches(
    content,
    /\.from\(\s*['"]inventario_items['"]\s*\)/,
    "consulta la tabla 'inventario_items'"
  );

  // 2. Filtra estado = 'DISPONIBLE'
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]estado['"]\s*,\s*['"]DISPONIBLE['"]\s*\)/,
    "filtra estado = 'DISPONIBLE'"
  );

  // 3. Filtra stock > 0
  assertRegexMatches(
    content,
    /\.gt\(\s*['"]stock['"]\s*,\s*0\s*\)/,
    "filtra stock > 0"
  );

  // 4. Filtra caducidad (fecha_caducidad IS NULL OR fecha_caducidad > HOY)
  assertRegexMatches(
    content,
    /\.or\(\s*[`'"]fecha_caducidad\.is\.null,fecha_caducidad\.gt\./,
    "filtra caducidad con .or() fecha_caducidad.is.null / fecha_caducidad.gt.HOY"
  );
  assertRegexMatches(
    content,
    /fecha_caducidad\.gt\.\$\{hoy\}/,
    'usa la fecha de hoy (YYYY-MM-DD) como referencia de caducidad'
  );

  // 5. El select incluye lote, fecha_caducidad, tipo_lio, marca, modelo, stock
  const selectBlockMatch = content.match(/\.select\(\s*[`'"`]([\s\S]*?)[`'"`]\s*\)/);
  if (!selectBlockMatch) {
    fail(
      'select incluye lote, fecha_caducidad, tipo_lio, marca, modelo, stock',
      'no se encontró ningún .select(...) en el endpoint'
    );
  } else {
    const selectBlock = selectBlockMatch[1];
    const required = ['lote', 'fecha_caducidad', 'tipo_lio', 'marca', 'modelo', 'stock'];
    const missing = required.filter(function (r) {
      return !selectBlock.includes(r);
    });
    if (missing.length === 0) {
      ok(
        'select incluye lote, fecha_caducidad, tipo_lio, marca, modelo, stock (' +
          required.length +
          ')'
      );
    } else {
      fail(
        'select incluye lote, fecha_caducidad, tipo_lio, marca, modelo, stock',
        'faltan: ' + missing.map(function (m) {
          return JSON.stringify(m);
        }).join(', ')
      );
    }
  }

  // 6. Filtro opcional por tipo (?tipo=...)
  assertRegexMatches(
    content,
    /searchParams\s*\.\s*get\(\s*['"]tipo['"]\s*\)/,
    "lee query param 'tipo' de la URL"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]tipo['"]\s*,\s*tipo\s*\)/,
    "aplica filtro opcional .eq('tipo', tipo) si se recibe query param"
  );

  // 7. Mapeo de respuesta incluye los campos requeridos
  const mapBlock = (content.match(/\.map\(\s*\([\s\S]*?\)\s*=>\s*\(\{[\s\S]*?\}\s*\)/) || [
    '',
  ])[0];
  const requiredInMap = [
    'id:',
    'marca:',
    'modelo:',
    'stock:',
    'lote:',
    'fecha_caducidad:',
    'tipo_lio:',
  ];
  const missingInMap = requiredInMap.filter(function (r) {
    return !mapBlock.includes(r);
  });
  if (missingInMap.length === 0) {
    ok(
      'mapeo de respuesta propaga id, marca, modelo, stock, lote, fecha_caducidad, tipo_lio (' +
        requiredInMap.length +
        ')'
    );
  } else {
    fail(
      'mapeo de respuesta propaga id, marca, modelo, stock, lote, fecha_caducidad, tipo_lio',
      'faltan: ' + missingInMap.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 8. Usa requireAuth (no expone datos sin autenticación)
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar al usuario'
  );

  // 9. Usa getSupabaseAdmin (cliente servidor)
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );

  // 10. Ordena por marca ascendente (UX predecible en selector)
  assertRegexMatches(
    content,
    /\.order\(\s*['"]marca['"]\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/,
    "ordena resultados por marca ascendente"
  );
}

// ---------------------------------------------------------------------------
// [2/6] Helper src/lib/lio.ts (estático + runtime)
// ---------------------------------------------------------------------------

async function checkLioHelper() {
  console.log(
    '\n[2/6] Helper de LIO: ' + path.relative(REPO_ROOT, LIO_HELPER_FILE)
  );

  const content = fileExistsOrFail(LIO_HELPER_FILE, 'archivo del helper existe');
  if (content === null) return;

  // --- Aserciones estáticas -----------------------------------------------

  // 1. Exporta listarLIOsDisponibles y validarLIO
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+listarLIOsDisponibles\b/,
    'exporta async function listarLIOsDisponibles'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+validarLIO\b/,
    'exporta async function validarLIO'
  );

  // 2. Define interfaz LIODisponible con los campos requeridos
  assertRegexMatches(
    content,
    /export\s+interface\s+LIODisponible\b/,
    'define export interface LIODisponible'
  );
  const lioInterfaceBlock = (content.match(
    /export\s+interface\s+LIODisponible\s*\{[^}]*\}/
  ) || [''])[0];
  const requiredInInterface = [
    'id:',
    'marca:',
    'modelo:',
    'tipo_lio:',
    'lote:',
    'fecha_caducidad:',
  ];
  const missingInInterface = requiredInInterface.filter(function (r) {
    return !lioInterfaceBlock.includes(r);
  });
  if (missingInInterface.length === 0) {
    ok(
      'LIODisponible contiene id, marca, modelo, tipo_lio, lote, fecha_caducidad (' +
        requiredInInterface.length +
        ')'
    );
  } else {
    fail(
      'LIODisponible contiene id, marca, modelo, tipo_lio, lote, fecha_caducidad',
      'faltan: ' + missingInInterface.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 3. Usa getSupabaseAdmin()
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );

  // 4. listarLIOsDisponibles filtra por LENTE_INTRAOCULAR + DISPONIBLE + stock>0 + caducidad
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]tipo['"]\s*,\s*['"]LENTE_INTRAOCULAR['"]\s*\)/,
    "listarLIOsDisponibles filtra tipo = 'LENTE_INTRAOCULAR'"
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]estado['"]\s*,\s*['"]DISPONIBLE['"]\s*\)/,
    "listarLIOsDisponibles filtra estado = 'DISPONIBLE'"
  );
  assertRegexMatches(
    content,
    /\.gt\(\s*['"]stock['"]\s*,\s*0\s*\)/,
    'listarLIOsDisponibles filtra stock > 0'
  );
  assertRegexMatches(
    content,
    /\.or\(\s*[`'"]fecha_caducidad\.is\.null,fecha_caducidad\.gt\./,
    'listarLIOsDisponibles filtra caducidad (null o futura)'
  );

  // 5. validarLIO cubre los 5 casos de rechazo
  assertRegexMatches(
    content,
    /if\s*\(\s*error\s*\|\|\s*!item\s*\)/,
    'validarLIO maneja error o item inexistente (rama no existe)'
  );
  assertRegexMatches(
    content,
    /item\.tipo\s*!==\s*['"]LENTE_INTRAOCULAR['"]/,
    "validarLIO rechaza si tipo !== 'LENTE_INTRAOCULAR'"
  );
  assertRegexMatches(
    content,
    /item\.estado\s*!==\s*['"]DISPONIBLE['"]/,
    "validarLIO rechaza si estado !== 'DISPONIBLE'"
  );
  assertRegexMatches(
    content,
    /item\.stock\s*<\s*1/,
    'validarLIO rechaza si stock < 1'
  );
  assertRegexMatches(
    content,
    /item\.fecha_caducidad/,
    'validarLIO evalúa fecha_caducidad'
  );
  assertRegexMatches(
    content,
    /cad\s*<\s*hoy|cad\s*<\s*v_hoy|new Date\(\s*item\.fecha_caducidad\s*\)/,
    'validarLIO compara caducidad contra hoy'
  );

  // 6. firmar validarLIO(inventarioItemId: string)
  assertRegexMatches(
    content,
    /validarLIO\s*\(\s*inventarioItemId\s*:\s*string\s*\)/,
    'firma validarLIO(inventarioItemId: string)'
  );

  // --- Aserciones de runtime (async) --------------------------------------

  let mod;
  try {
    mod = loadLioHelperModule(
      makeLioStub({
        singleData: null,
        listData: [],
      })
    );
  } catch (e) {
    fail(
      'cargar lio en runtime',
      'transpile/eval falló: ' + e.message
    );
    return;
  }
  ok('cargar lio en runtime');

  if (!mod || typeof mod.validarLIO !== 'function') {
    fail('exports del módulo cargados', 'validarLIO no está disponible');
    return;
  }
  if (typeof mod.listarLIOsDisponibles !== 'function') {
    fail(
      'exports del módulo cargados',
      'listarLIOsDisponibles no está disponible'
    );
    return;
  }
  ok('exports del módulo cargados (listarLIOsDisponibles + validarLIO)');

  const runtimeChecks = [];

  // ---- listarLIOsDisponibles: propaga id/marca/modelo/tipo_lio/lote/fecha_caducidad/stock
  const lioSample = {
    id: 'sample-lio-1',
    marca: 'Alcon',
    modelo: 'AcrySof IQ',
    tipo: 'LENTE_INTRAOCULAR',
    tipo_lio: '23.0',
    potencia_dioptrias: 21.5,
    lote: 'L-ABC123',
    fecha_caducidad: '2030-12-31',
    stock: 5,
    estado: 'DISPONIBLE',
  };
  const lioFactoryList = makeLioStub({ listData: [lioSample] });
  const modList = loadLioHelperModule(lioFactoryList);
  runtimeChecks.push(
    modList.listarLIOsDisponibles().then(function (res) {
      if (!Array.isArray(res)) {
        fail('listarLIOsDisponibles retorna array', JSON.stringify(res));
        return;
      }
      ok('listarLIOsDisponibles retorna array (1 elemento)');
      if (res.length !== 1) {
        fail('listarLIOsDisponibles longitud', 'obtuvo ' + res.length);
        return;
      }
      ok('listarLIOsDisponibles longitud = 1');
      const out = res[0];
      const expected = ['id', 'marca', 'modelo', 'tipo_lio', 'lote', 'fecha_caducidad', 'stock'];
      const missingOut = expected.filter(function (k) {
        return !(k in out);
      });
      if (missingOut.length === 0) {
        ok(
          'mapeo de listarLIOsDisponibles expone id, marca, modelo, tipo_lio, lote, fecha_caducidad, stock (' +
            expected.length +
            ')'
        );
      } else {
        fail(
          'mapeo de listarLIOsDisponibles expone id, marca, modelo, tipo_lio, lote, fecha_caducidad, stock',
          'faltan: ' + missingOut.map(function (m) {
            return JSON.stringify(m);
          }).join(', ')
        );
      }
    }).catch(function (e) {
      fail(
        'listarLIOsDisponibles()',
        'excepción: ' + e.message
      );
    })
  );

  // ---- validarLIO: 5 ramas de rechazo -----------------------------------

  function validarCaso(label, singleDataOpts, expectedErrorRegex) {
    const factory = makeLioStub(singleDataOpts);
    const m = loadLioHelperModule(factory);
    return m.validarLIO('item-x').then(function (res) {
      if (res && res.valido === false) {
        if (!expectedErrorRegex || expectedErrorRegex.test(res.error || '')) {
          ok('validarLIO(' + label + ') -> valido=false');
        } else {
          fail(
            'validarLIO(' + label + ') -> valido=false con mensaje esperado',
            'obtuvo error: ' + JSON.stringify(res.error)
          );
        }
      } else {
        fail(
          'validarLIO(' + label + ') -> valido=false',
          'obtuvo ' + JSON.stringify(res)
        );
      }
    }).catch(function (e) {
      fail('validarLIO(' + label + ')', 'excepción: ' + e.message);
    });
  }

  // 1. Item inexistente: error de supabase (single) o data=null
  runtimeChecks.push(
    validarCaso(
      'item inexistente (error supabase)',
      { singleError: { message: 'PGRST116' } },
      /no existe|no encontr/i
    )
  );
  runtimeChecks.push(
    validarCaso(
      'item inexistente (data null)',
      { singleData: null },
      /no existe|no encontr/i
    )
  );

  // 2. Tipo distinto a LENTE_INTRAOCULAR
  runtimeChecks.push(
    validarCaso(
      "tipo distinto a LENTE_INTRAOCULAR",
      {
        singleData: {
          id: 'item-y',
          tipo: 'LENTE_VISION',
          estado: 'DISPONIBLE',
          stock: 3,
          fecha_caducidad: null,
          marca: 'X', modelo: 'Y', tipo_lio: null,
          potencia_dioptrias: null, lote: 'L1',
        },
      },
      /no es un LIO|LENTE_INTRAOCULAR/i
    )
  );

  // 3. Estado distinto a DISPONIBLE
  runtimeChecks.push(
    validarCaso(
      "estado no DISPONIBLE",
      {
        singleData: {
          id: 'item-y',
          tipo: 'LENTE_INTRAOCULAR',
          estado: 'AGOTADO',
          stock: 3,
          fecha_caducidad: null,
          marca: 'X', modelo: 'Y', tipo_lio: null,
          potencia_dioptrias: null, lote: 'L1',
        },
      },
      /disponible|estado/i
    )
  );

  // 4. Stock < 1
  runtimeChecks.push(
    validarCaso(
      'stock < 1',
      {
        singleData: {
          id: 'item-y',
          tipo: 'LENTE_INTRAOCULAR',
          estado: 'DISPONIBLE',
          stock: 0,
          fecha_caducidad: null,
          marca: 'X', modelo: 'Y', tipo_lio: null,
          potencia_dioptrias: null, lote: 'L1',
        },
      },
      /stock/i
    )
  );

  // 5. Fecha de caducidad vencida
  runtimeChecks.push(
    validarCaso(
      'fecha de caducidad vencida',
      {
        singleData: {
          id: 'item-y',
          tipo: 'LENTE_INTRAOCULAR',
          estado: 'DISPONIBLE',
          stock: 3,
          fecha_caducidad: '2000-01-01',
          marca: 'X', modelo: 'Y', tipo_lio: null,
          potencia_dioptrias: null, lote: 'L1',
        },
      },
      /caducad/i
    )
  );

  // Caso válido: todo OK -> valido=true
  runtimeChecks.push(
    (function () {
      const factory = makeLioStub({
        singleData: {
          id: 'item-ok',
          tipo: 'LENTE_INTRAOCULAR',
          estado: 'DISPONIBLE',
          stock: 5,
          fecha_caducidad: '2099-12-31',
          marca: 'Alcon', modelo: 'AcrySof', tipo_lio: '23.0',
          potencia_dioptrias: 21.5, lote: 'L-VALID',
        },
      });
      const m = loadLioHelperModule(factory);
      return m.validarLIO('item-ok').then(function (res) {
        if (res && res.valido === true && res.item && res.item.id === 'item-ok') {
          ok('validarLIO caso válido -> valido=true con item normalizado');
        } else {
          fail(
            'validarLIO caso válido -> valido=true',
            'obtuvo ' + JSON.stringify(res)
          );
        }
      }).catch(function (e) {
        fail('validarLIO caso válido', 'excepción: ' + e.message);
      });
    })()
  );

  await Promise.all(runtimeChecks);
}

// ---------------------------------------------------------------------------
// [3/6] Componente src/components/cirugia/LIOSelector.tsx
// ---------------------------------------------------------------------------

function checkLioSelector() {
  console.log(
    '\n[3/6] Componente LIOSelector: ' +
      path.relative(REPO_ROOT, LIO_SELECTOR_FILE)
  );

  const content = fileExistsOrFail(LIO_SELECTOR_FILE, 'archivo del componente existe');
  if (content === null) return;

  // 1. Es 'use client'
  assertRegexMatches(
    content,
    /^['"]use client['"]/m,
    "componente marcado con 'use client'"
  );

  // 2. Importa cn desde @/lib/utils
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/,
    "importa `cn` desde '@/lib/utils'"
  );

  // 3. Props del componente: value, onChange, disabled, placeholder, className
  const props = ['value', 'onChange', 'disabled', 'placeholder', 'className'];
  const missingProps = props.filter(function (p) {
    // Acepta la presencia tanto en la firma como en el destructuring.
    const re = new RegExp(
      '(?:\\b' + p + '\\b\\s*[?:]?\\s*:?\\s*[^,)]*[,)])|(?:\\{' +
        '[\\s\\S]{0,200}' +
        '\\b' + p + '\\b' +
        ')'
    );
    return !re.test(content);
  });
  if (missingProps.length === 0) {
    ok(
      'acepta props value, onChange, disabled, placeholder, className (' +
        props.length +
        ')'
    );
  } else {
    fail(
      'acepta props value, onChange, disabled, placeholder, className',
      'faltan: ' + missingProps.join(', ')
    );
  }

  // 4. Hace fetch a /api/inventario/disponible?tipo=LENTE_INTRAOCULAR
  assertRegexMatches(
    content,
    /fetch\(\s*['"]\/api\/inventario\/disponible\?tipo=LENTE_INTRAOCULAR['"]/,
    "hace fetch a '/api/inventario/disponible?tipo=LENTE_INTRAOCULAR'"
  );

  // 5. Texto de opciones incluye marca, modelo, tipo_lio, lote, caducidad y stock
  //    (la función `formatearOpcion` los junta en `partes.join(' ')`).
  const opFnBlock = (content.match(/function\s+formatearOpcion[\s\S]*?\n\s*\}/) || [
    '',
  ])[0];
  const requiredInOp = [
    'item.marca',
    'item.modelo',
    'item.tipo_lio',
    'item.lote',
    'item.fecha_caducidad',
    'item.stock',
  ];
  const missingOp = requiredInOp.filter(function (r) {
    return !opFnBlock.includes(r);
  });
  if (missingOp.length === 0) {
    ok(
      'formatearOpcion referencia marca, modelo, tipo_lio, lote, caducidad y stock (' +
        requiredInOp.length +
        ')'
    );
  } else {
    fail(
      'formatearOpcion referencia marca, modelo, tipo_lio, lote, caducidad y stock',
      'faltan: ' + missingOp.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 6. Resumen del seleccionado incluye marca, modelo, tipo, lote, caducidad
  const sumFnBlock = (content.match(/function\s+formatearResumen[\s\S]*?\n\s*\}/) || [
    '',
  ])[0];
  const requiredInSum = [
    'item.marca',
    'item.modelo',
    'item.tipo_lio',
    'item.lote',
    'item.fecha_caducidad',
  ];
  const missingSum = requiredInSum.filter(function (r) {
    return !sumFnBlock.includes(r);
  });
  if (missingSum.length === 0) {
    ok(
      'formatearResumen incluye marca, modelo, tipo, lote, caducidad (' +
        requiredInSum.length +
        ')'
    );
  } else {
    fail(
      'formatearResumen incluye marca, modelo, tipo, lote, caducidad',
      'faltan: ' + missingSum.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 7. onChange sólo propaga el id (no copia marca/modelo a campos de texto)
  const selectBlock = (content.match(/<select[\s\S]*?<\/select>/) || [''])[0];
  assertRegexMatches(
    selectBlock,
    /onChange\s*=\s*\{\s*\([^)]*\)\s*=>\s*onChange\([^)]*\)\s*\}/,
    'onChange del <select> sólo invoca onChange(...) con el valor seleccionado'
  );

  // 8. Define type/interface para el item del selector
  assertRegexMatches(
    content,
    /(?:export\s+)?(?:interface|type)\s+LIODisponible\b/,
    'define interface/type LIODisponible para el selector'
  );
}

// ---------------------------------------------------------------------------
// [4/6] AgendaContent.tsx (formulario de creación)
// ---------------------------------------------------------------------------

function checkAgendaContent() {
  console.log(
    '\n[4/6] AgendaContent.tsx: integración con LIOSelector'
  );

  const content = fileExistsOrFail(
    AGENDA_CONTENT_FILE,
    'archivo AgendaContent.tsx existe'
  );
  if (content === null) return;

  // 1. Importa LIOSelector desde @/components/cirugia/LIOSelector
  assertRegexMatches(
    content,
    /import\s+LIOSelector\s+from\s+['"]@\/components\/cirugia\/LIOSelector['"]/,
    "importa LIOSelector desde '@/components/cirugia/LIOSelector'"
  );

  // 2. Renderiza <LIOSelector value={form.inventario_item_id} onChange={handleLIOSelect} />
  assertRegexMatches(
    content,
    /<LIOSelector\s+value=\{form\.inventario_item_id\}\s+onChange=\{handleLIOSelect\}/,
    'renderiza <LIOSelector value={form.inventario_item_id} onChange={handleLIOSelect} />'
  );

  // 3. handleLIOSelect actualiza inventario_item_id y limpia lio/marca_lio
  //    (FK sin copiar marca/modelo a columnas de texto).
  const handleBlock = (content.match(/const\s+handleLIOSelect\s*=[\s\S]*?\}\s*;/) || [
    '',
  ])[0];
  if (!handleBlock) {
    fail(
      'handleLIOSelect definido como función',
      'no se encontró la función handleLIOSelect'
    );
  } else {
    ok('handleLIOSelect definido como función flecha');
    assertContainsAll(
      handleBlock,
      ['inventario_item_id', 'lio', 'marca_lio'],
      'handleLIOSelect toca inventario_item_id, lio, marca_lio'
    );
    assertRegexMatches(
      handleBlock,
      /inventario_item_id\s*:\s*itemId\s*\|\|\s*['"]['"]/,
      'handleLIOSelect asigna inventario_item_id desde el item seleccionado'
    );
    assertRegexMatches(
      handleBlock,
      /lio\s*:\s*['"]['"]/,
      'handleLIOSelect limpia `lio` (cadena vacía) — no copia del item'
    );
    assertRegexMatches(
      handleBlock,
      /marca_lio\s*:\s*['"]['"]/,
      'handleLIOSelect limpia `marca_lio` (cadena vacía) — no copia del item'
    );
  }

  // 4. El formulario no debe asignar `lio`/`marca_lio` desde el item
  //    seleccionado por LIOSelector (regresión anti-copia).
  assertNotContains(
    content,
    "handleLIOSelect(item).lio",
    'no se copia el campo `lio` desde el item seleccionado'
  );
  assertNotContains(
    content,
    "handleLIOSelect(item).marca_lio",
    'no se copia el campo `marca_lio` desde el item seleccionado'
  );

  // 5. Form inicial y body enviado a /api/agenda aún incluyen los campos
  //    `lio` y `marca_lio` por compatibilidad, pero handleLIOSelect los
  //    vacía (esto es por diseño: la API legacy sigue aceptándolos).
  //    No exigimos nada aquí; es informativo.
}

// ---------------------------------------------------------------------------
// [5/6] Endpoint POST /api/cirugias + RPC crear_cirugia
// ---------------------------------------------------------------------------

function checkCirugiasRoute() {
  console.log(
    '\n[5/6] Endpoint POST /api/cirugias + RPC crear_cirugia'
  );

  const routeContent = fileExistsOrFail(
    CIRUGIAS_ROUTE_FILE,
    'archivo del endpoint /api/cirugias existe'
  );
  if (routeContent === null) return;

  // 1. Esquema Zod incluye inventario_item_id opcional y nullable
  assertRegexMatches(
    routeContent,
    /inventario_item_id\s*:\s*z\s*\.\s*string\s*\(\s*\)\s*\.\s*uuid\s*\(\s*\)\s*\.\s*optional\s*\(\s*\)\s*\.\s*nullable\s*\(\s*\)/,
    "Zod acepta inventario_item_id (uuid, optional, nullable)"
  );

  // 2. Pasa inventario_item_id al RPC como p_inventario_item_id
  assertRegexMatches(
    routeContent,
    /p_inventario_item_id\s*:\s*data\.inventario_item_id/,
    'pasa inventario_item_id al RPC como p_inventario_item_id'
  );

  // 3. RPC llamado
  assertRegexMatches(
    routeContent,
    /supabase\s*\.\s*rpc\s*\(\s*['"]crear_cirugia['"]/,
    "llama a supabase.rpc('crear_cirugia', ...)"
  );

  // 4. .strict() rechaza campos extra (incluye lio/marca_lio)
  assertRegexMatches(
    routeContent,
    /\)\s*\.\s*strict\s*\(\s*\)/,
    "esquema Zod usa .strict() (no permite lio/marca_lio)"
  );

  // --- Migración RPC crear_cirugia ----------------------------------------

  const migContent = fileExistsOrFail(
    CREAR_CIRUGIA_MIGRATION_FILE,
    'archivo de migración RPC existe'
  );
  if (migContent === null) return;

  // 5. La firma del RPC acepta p_inventario_item_id UUID DEFAULT NULL
  assertRegexMatches(
    migContent,
    /p_inventario_item_id\s+UUID\s+DEFAULT\s+NULL/i,
    'firma RPC incluye p_inventario_item_id UUID DEFAULT NULL'
  );

  // 6. VAL-006: valida LIO si p_inventario_item_id IS NOT NULL
  assertRegexMatches(
    migContent,
    /IF\s+p_inventario_item_id\s+IS\s+NOT\s+NULL/i,
    'rama condicional IF p_inventario_item_id IS NOT NULL'
  );
  assertRegexMatches(
    migContent,
    /FROM\s+inventario_items/i,
    'consulta inventario_items para validar el LIO'
  );
  assertContainsAll(
    migContent,
    [
      "tipo = 'LENTE_INTRAOCULAR'",
      "estado = 'DISPONIBLE'",
      'stock >= 1',
      'CURRENT_DATE',
    ],
    "VAL-006 valida tipo='LENTE_INTRAOCULAR', estado='DISPONIBLE', stock>=1 y fecha_caducidad > CURRENT_DATE"
  );
  assertRegexMatches(
    migContent,
    /caducado|RAISE\s+EXCEPTION/i,
    'rechaza LIO inválido con RAISE EXCEPTION / mensaje de error'
  );

  // 7. INSERT sólo incluye inventario_item_id (no lio / marca_lio)
  const insertBlock = (migContent.match(
    /INSERT\s+INTO\s+agenda_cirugias[\s\S]*?RETURNING\s+id\s+INTO\s+v_cirugia_id/
  ) || [''])[0];
  if (!insertBlock) {
    fail(
      'INSERT INTO agenda_cirugias contiene inventario_item_id',
      'no se localizó el bloque INSERT INTO agenda_cirugias ... RETURNING id INTO v_cirugia_id'
    );
  } else {
    assertContainsAll(
      insertBlock,
      ['inventario_item_id'],
      'INSERT incluye la columna inventario_item_id'
    );
    assertNotContains(
      insertBlock,
      'lio',
      'INSERT NO incluye columna `lio` (relación sólo por FK)'
    );
    assertNotContains(
      insertBlock,
      'marca_lio',
      'INSERT NO incluye columna `marca_lio` (relación sólo por FK)'
    );
  }

  // 8. Historial AUD-004: inserta 'LIO_ASIGNADO' cuando hay inventario_item_id
  assertRegexMatches(
    migContent,
    /'LIO_ASIGNADO'/,
    "inserta accion='LIO_ASIGNADO' en cirugia_historial"
  );
}

// ---------------------------------------------------------------------------
// [6/6] Script npm test:b7 + integridad de test:b1..b6
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[6/6] Script npm test:b7 e integridad de test:b1..b6');

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
    typeof scripts['test:b7'] === 'string' &&
    scripts['test:b7'].length > 0
  ) {
    ok(
      'script npm "test:b7" definido (' +
        JSON.stringify(scripts['test:b7']) +
        ')'
    );
  } else {
    fail('script npm "test:b7" definido', 'ausente o vacío en package.json');
  }

  ['test:b1', 'test:b2', 'test:b3', 'test:b4', 'test:b5', 'test:b6'].forEach(function (key) {
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
  console.log(' Pruebas B7 - LIO (inventario → cirugía, Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkInventarioEndpoint();
  await checkLioHelper();
  checkLioSelector();
  checkAgendaContent();
  checkCirugiasRoute();
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
      '\nLa prueba B7 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B7 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main().catch(function (e) {
  console.error('ERROR inesperado en B7: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});