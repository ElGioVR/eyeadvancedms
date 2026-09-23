#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B5 (Archivos de cirugía homologada:
 * helper `storage-cirugia` + endpoints `archivos` y `archivos/[archivoId]`)
 * de Fase 1 (Creación de cirugía homologada) de EyeAdvancedMS.
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con aserciones
 * textuales sobre los archivos fuente y un mini-runtime con `vm.runInContext`
 * para ejercitar `validarArchivo`. NO conecta a Supabase/PostgreSQL ni
 * ejecuta migraciones; sólo lee el contenido del repo y verifica que estén
 * los elementos obligatorios del bloque B5:
 *
 *   - Helper src/lib/storage-cirugia.ts:
 *       * exporta BUCKET_CIRUGIAS = 'cirugias'
 *       * exporta EXTENSIONES_PERMITIDAS con pdf/jpg/jpeg/png/webp
 *       * exporta MIME_PERMITIDOS con los MIMEs correctos
 *       * exporta MAX_TAMANO_ARCHIVO y MAX_ARCHIVOS_POR_CIRUGIA
 *       * exporta validarArchivo, subirArchivoACirugia,
 *         eliminarArchivoDeStorage, generarUrlFirmada
 *
 *   - Endpoint src/app/api/cirugias/[id]/archivos/route.ts (GET, POST):
 *       * importa requireAuth / requireRole
 *       * POST usa subirArchivoACirugia
 *       * POST inserta en cirugia_archivos
 *       * POST inserta ARCHIVO_AGREGADO en cirugia_historial
 *       * POST rechaza si falta tipo_documento
 *       * usa getSupabaseAdmin()
 *
 *   - Endpoint src/app/api/cirugias/[id]/archivos/[archivoId]/route.ts (GET, DELETE):
 *       * GET llama a generarUrlFirmada y devuelve { archivo, signedUrl }
 *       * DELETE hace update de deleted_at / deleted_by
 *       * DELETE inserta ARCHIVO_ELIMINADO en cirugia_historial
 *       * usa getSupabaseAdmin()
 *
 *   - Los endpoints NO escriben directamente a Storage desde el cliente:
 *       * delegan a helpers de @/lib/storage-cirugia
 *       * ningún archivo con 'use client' importa storage-cirugia o
 *         supabase/admin (regresión)
 *
 *   - Script npm `test:b5` en package.json (sin tocar test:b1..b4).
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

const STORAGE_HELPER_FILE = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'storage-cirugia.ts'
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
// Mini-framework de aserciones (mismo estilo que b1..b4)
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
// Transpilador mínimo TS -> JS para storage-cirugia.ts
// ---------------------------------------------------------------------------
//
// `storage-cirugia.ts` no se importa desde el runtime de Node; lo cargamos
// mediante un transpile regex-driven + `vm.runInContext` sólo para poder
// ejecutar `validarArchivo` contra archivos mock. La estrategia es limitada
// al patrón usado por este archivo:
//
//   - import { ... } from '...';          -> eliminadas
//   - export const X: T = ...;           -> const X = ...;
//   - export interface X { ... }         -> eliminada
//   - export function f(p: T): R { ... } -> function f(p) { ... }
//   - export async function f(p: T): R { ... } -> async function f(p) { ... }
//
// Para los argumentos de función, se descarta todo lo que esté después del
// primer `:` de cada parámetro. Para el tipo de retorno se reemplaza todo
// desde `: ` hasta el `{` de apertura del cuerpo (no greedy).
//
// Si en el futuro el helper agrega sintaxis TS más compleja (genéricos,
// tipos condicionales, etc.) este transpilador deberá extenderse.

function transpileStorageCirugia(content) {
  let js = content;

  // 1. Eliminar líneas de import (incluyendo `import type { ... }`)
  js = js.replace(/^\s*import\s+[^;]+;\s*$/gm, '');

  // 2. Eliminar `export interface X { ... }` (no admite anidamiento; el
  //    archivo sólo contiene una interfaz plana).
  js = js.replace(/export\s+interface\s+\w+\s*\{[^}]*\}/g, '');

  // 3. Strip la palabra clave `export` antes de declaraciones top-level
  //    (const / function / async function). Esto evita que el runtime
  //    vea `export` que JS puro no soporta.
  js = js.replace(
    /\bexport\s+(const|async\s+function|function)\b/g,
    '$1'
  );

  // 4. Convertir `const X: T = ...` -> `const X = ...` (strip anotación de
  //    tipo en `const`).
  js = js.replace(
    /(\bconst\s+[A-Za-z_$][\w$]*)\s*:\s*[^=]+=/g,
    '$1 ='
  );

  // 4b. Strip aserciones de tipo `expr as Type` y `expr as Type<X>`. La parte
  //     `<X>` puede contener comas si son tipos genéricos.
  js = js.replace(
    /\s+as\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?/g,
    ''
  );

  // 5. Para funciones, recorremos el código con un escáner manual que
  //    cuenta paréntesis y llaves para localizar el inicio del cuerpo
  //    `{`, tolerando tipos de retorno como
  //    `: { valido: true } | { valido: false; error: string } { ... }`
  //    o anotaciones en parámetros que contienen `{ ... }`.
  //
  //    Para cada `function NAME(` o `async function NAME(` encontrada:
  //      a) saltamos la lista de parámetros contando `(` y `)`.
  //      b) limpiamos la anotación de tipo de cada parámetro
  //         (todo lo que va desde el primer `:` hasta `=` o `,` o `)`).
  //      c) tras el `)` de cierre, saltamos espacios y, si aparece
  //         `:`, saltamos el tipo de retorno contando llaves hasta
  //         encontrar el `{` del cuerpo (a profundidad de llaves 0).

  function stripFunction(source) {
    let out = '';
    let i = 0;
    while (i < source.length) {
      // Buscar `function NAME(` o `async function NAME(`. No usamos look-behind
      // para máxima portabilidad.
      const tail = source.substring(i);
      const m = tail.match(
        /^(\basync\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/
      );
      if (!m) {
        out += source[i];
        i += 1;
        continue;
      }
      // Mantener prefijo (puede ser `export` o no; ya strippeado arriba
      // para `export`, pero puede ser solo `function NAME(`).
      out += m[0];
      i += m[0].length;
      // Saltar la lista de parámetros con conteo de paréntesis.
      let pDepth = 1;
      let paramsStart = i;
      while (i < source.length && pDepth > 0) {
        const c = source[i];
        if (c === '(') pDepth += 1;
        else if (c === ')') pDepth -= 1;
        i += 1;
      }
      let paramsRaw = source.substring(paramsStart, i - 1);
      // Limpiar anotaciones de tipo en cada parámetro. Para cada parámetro
      // (terminado en `,` o fin de lista), quitamos todo lo que va desde
      // el primer `:` hasta el `=` o `,` que lo delimita a profundidad 0
      // (los tipos pueden contener `()`, `[]`, `<>` anidados).
      let cleanedParams = '';
      {
        let j = 0;
        while (j < paramsRaw.length) {
          const c = paramsRaw[j];
          if (c === ':') {
            // Saltar el tipo del parámetro hasta `=` o `,` a profundidad 0.
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
        // Normalizar espacios múltiples.
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
        // Saltar el tipo de retorno hasta el `{` del cuerpo. Estrategia:
        //   - Contar profundidad sobre TODOS los grupos () {} [] <> (no sólo
        //     `{}`), para que tipos como `Promise<{ ok: true } | { ok: false }>`
        //     y `{ valido: true } | { valido: false; error: string }`
        //     queden correctamente balanceados.
        //   - Para distinguir el `{` del CUERPO de un `{` que abre un type
        //     literal cuando ambos están a profundidad 0, usamos la heurística
        //     del carácter previo no-whitespace: si es uno de los operadores
        //     de tipo `| & : ( [ < ,`, entonces es un type literal; en otro
        //     caso es el body.
        //   - Ignoramos el contenido dentro de strings ' " para no contar
        //     llaves que sean parte de un literal.
        let depth = 0;
        let inStr = null;
        while (i < source.length) {
          const c = source[i];
          if (inStr) {
            if (c === '\\') {
              i += 2;
              continue;
            }
            if (c === inStr) inStr = null;
            i += 1;
            continue;
          }
          if (c === "'" || c === '"') {
            inStr = c;
            i += 1;
            continue;
          }
          if (c === '(' || c === '{' || c === '[' || c === '<') {
            if (c === '{' && depth === 0) {
              // Heurística: ¿este `{` es un type literal o el body?
              let k = i - 1;
              while (k >= 0 && /\s/.test(source[k])) k -= 1;
              const prev = k >= 0 ? source[k] : '';
              if (
                prev === ':' ||
                prev === '|' ||
                prev === '&' ||
                prev === '(' ||
                prev === '[' ||
                prev === '<' ||
                prev === ','
              ) {
                // Es un type literal (objeto en una unión/intersección o
                // inmediatamente tras `:`). Lo tratamos como apertura de
                // grupo para que `}` posterior lo cierre.
                depth += 1;
              } else {
                // Es el `{` del cuerpo.
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
      // Si no había `:`, dejamos que el `)` + `{` siga su curso normal en
      // el output (el `{` se copiará tal cual en la siguiente iteración).
    }
    return out;
  }

  js = stripFunction(js);

  return js;
}

function loadStorageCirugiaModule() {
  const content = fs.readFileSync(STORAGE_HELPER_FILE, 'utf8');
  const js = transpileStorageCirugia(content);

  // Stubs: getSupabaseAdmin no se invoca desde validarArchivo, pero
  // subirArchivoACirugia / eliminarArchivoDeStorage / generarUrlFirmada sí
  // lo usan y deben poder cargarse sin reventar. randomUUID lo usamos sólo
  // como referencia a `crypto.randomUUID` real de Node 18+.
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: console,
    getSupabaseAdmin: function () {
      return {
        storage: {
          from: function () {
            return {
              upload: async function () {
                return { error: null };
              },
              remove: async function () {
                return { error: null };
              },
              createSignedUrl: async function () {
                return { data: { signedUrl: 'stub' }, error: null };
              },
            };
          },
        },
        from: function () {
          // Cadena fluida mínima para que `subirArchivoACirugia` pueda
          // ejecutarse sin errores si llegara a llamarse (no la invocamos
          // en los asserts, pero evitamos ReferenceError al cargar).
          const chain = {};
          chain.select = function () {
            return chain;
          };
          chain.insert = function () {
            return chain;
          };
          chain.update = function () {
            return chain;
          };
          chain.eq = function () {
            return chain;
          };
          chain.is = function () {
            return chain;
          };
          chain.maybeSingle = async function () {
            return { data: null, error: null };
          };
          chain.single = async function () {
            return { data: null, error: null };
          };
          chain.order = function () {
            return chain;
          };
          return chain;
        },
      };
    },
  };
  sandbox.module.exports = sandbox.exports;

  vm.createContext(sandbox);

  const shim =
    '\nmodule.exports = {' +
    '  BUCKET_CIRUGIAS: typeof BUCKET_CIRUGIAS !== "undefined" ? BUCKET_CIRUGIAS : null,' +
    '  EXTENSIONES_PERMITIDAS: typeof EXTENSIONES_PERMITIDAS !== "undefined" ? EXTENSIONES_PERMITIDAS : null,' +
    '  MIME_PERMITIDOS: typeof MIME_PERMITIDOS !== "undefined" ? MIME_PERMITIDOS : null,' +
    '  MAX_TAMANO_ARCHIVO: typeof MAX_TAMANO_ARCHIVO !== "undefined" ? MAX_TAMANO_ARCHIVO : null,' +
    '  MAX_ARCHIVOS_POR_CIRUGIA: typeof MAX_ARCHIVOS_POR_CIRUGIA !== "undefined" ? MAX_ARCHIVOS_POR_CIRUGIA : null,' +
    '  validarArchivo: typeof validarArchivo === "function" ? validarArchivo : null,' +
    '  subirArchivoACirugia: typeof subirArchivoACirugia === "function" ? subirArchivoACirugia : null,' +
    '  eliminarArchivoDeStorage: typeof eliminarArchivoDeStorage === "function" ? eliminarArchivoDeStorage : null,' +
    '  generarUrlFirmada: typeof generarUrlFirmada === "function" ? generarUrlFirmada : null' +
    '};';

  vm.runInContext(js + shim, sandbox, {
    filename: 'storage-cirugia.transpiled.js',
  });
  return sandbox.module.exports;
}

// Construye un "archivo" mínimo compatible con validarArchivo (que sólo lee
// `name`, `size` y `type`). Usamos un objeto plano para no depender de la
// disponibilidad global de `File` ni del buffer.
function mockFile(name, size, type) {
  return { name: name, size: size, type: type };
}

// ---------------------------------------------------------------------------
// [1/5] Helper src/lib/storage-cirugia.ts
// ---------------------------------------------------------------------------

function checkStorageHelper() {
  console.log(
    '\n[1/5] Helper de archivos: ' +
      path.relative(REPO_ROOT, STORAGE_HELPER_FILE)
  );

  const content = fileExistsOrFail(STORAGE_HELPER_FILE, 'archivo del helper existe');
  if (content === null) return;

  // 1. BUCKET_CIRUGIAS = 'cirugias'
  assertRegexMatches(
    content,
    /export\s+const\s+BUCKET_CIRUGIAS\s*=\s*['"]cirugias['"]\s*;?/,
    "exporta const BUCKET_CIRUGIAS = 'cirugias'"
  );

  // 2. EXTENSIONES_PERMITIDAS con pdf, jpg, jpeg, png, webp
  assertRegexMatches(
    content,
    /export\s+const\s+EXTENSIONES_PERMITIDAS\b/,
    'exporta const EXTENSIONES_PERMITIDAS'
  );
  const requiredExts = ["'pdf'", "'jpg'", "'jpeg'", "'png'", "'webp'"];
  const extBlock = (content.match(/EXTENSIONES_PERMITIDAS\s*=\s*\[[^\]]*\]/) || [
    '',
  ])[0];
  const missingExts = requiredExts.filter(function (e) {
    return !extBlock.includes(e);
  });
  if (missingExts.length === 0) {
    ok(
      'EXTENSIONES_PERMITIDAS incluye pdf/jpg/jpeg/png/webp (' +
        requiredExts.length +
        ')'
    );
  } else {
    fail(
      'EXTENSIONES_PERMITIDAS incluye pdf/jpg/jpeg/png/webp',
      'faltan: ' + missingExts.map(function (m) {
        return JSON.stringify(m);
      }).join(', ')
    );
  }

  // 3. MIME_PERMITIDOS con asociación extensión -> MIMEs
  assertRegexMatches(
    content,
    /export\s+const\s+MIME_PERMITIDOS\b/,
    'exporta const MIME_PERMITIDOS'
  );
  const mimePairs = [
    { ext: 'pdf', mimes: ['application/pdf'] },
    { ext: 'jpg', mimes: ['image/jpeg'] },
    { ext: 'jpeg', mimes: ['image/jpeg'] },
    { ext: 'png', mimes: ['image/png'] },
    { ext: 'webp', mimes: ['image/webp'] },
  ];
  mimePairs.forEach(function (pair) {
    const re = new RegExp(
      pair.ext + '\\s*:\\s*\\[[^\\]]*' +
        pair.mimes
          .map(function (m) {
            return m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('[^\\]]*') +
        '[^\\]]*\\]'
    );
    assertRegexMatches(content, re, "MIME_PERMITIDOS." + pair.ext + ' contiene ' + pair.mimes.join('/'));
  });

  // 4. MAX_TAMANO_ARCHIVO y MAX_ARCHIVOS_POR_CIRUGIA
  assertRegexMatches(
    content,
    /export\s+const\s+MAX_TAMANO_ARCHIVO\b/,
    'exporta const MAX_TAMANO_ARCHIVO'
  );
  assertRegexMatches(
    content,
    /export\s+const\s+MAX_ARCHIVOS_POR_CIRUGIA\b/,
    'exporta const MAX_ARCHIVOS_POR_CIRUGIA'
  );
  assertRegexMatches(
    content,
    /MAX_TAMANO_ARCHIVO\s*=\s*10\s*\*\s*1024\s*\*\s*1024/,
    'MAX_TAMANO_ARCHIVO = 10 * 1024 * 1024 (10 MB)'
  );
  assertRegexMatches(
    content,
    /MAX_ARCHIVOS_POR_CIRUGIA\s*=\s*20\b/,
    'MAX_ARCHIVOS_POR_CIRUGIA = 20'
  );

  // 5. Funciones exportadas
  assertRegexMatches(
    content,
    /export\s+function\s+validarArchivo\b/,
    'exporta function validarArchivo'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+subirArchivoACirugia\b/,
    'exporta async function subirArchivoACirugia'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+eliminarArchivoDeStorage\b/,
    'exporta async function eliminarArchivoDeStorage'
  );
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+generarUrlFirmada\b/,
    'exporta async function generarUrlFirmada'
  );
}

// ---------------------------------------------------------------------------
// [2/5] Validaciones (runtime de validarArchivo + validaciones estáticas
// del límite y de tipo_documento en el endpoint)
// ---------------------------------------------------------------------------

function checkValidations() {
  console.log(
    '\n[2/5] Validaciones: validarArchivo (runtime) + MAX/tipo_documento (estático)'
  );

  // --- Runtime: validarArchivo -------------------------------------------

  let mod;
  try {
    mod = loadStorageCirugiaModule();
  } catch (e) {
    fail('cargar storage-cirugia en runtime', 'transpile/eval falló: ' + e.message);
    return;
  }
  ok('cargar storage-cirugia en runtime');

  if (!mod || typeof mod.validarArchivo !== 'function') {
    fail('exports del módulo cargados', 'validarArchivo no está disponible');
    return;
  }
  ok('exports del módulo cargados (constantes + 4 funciones)');

  if (mod.BUCKET_CIRUGIAS === 'cirugias') {
    ok('BUCKET_CIRUGIAS === "cirugias" en runtime');
  } else {
    fail('BUCKET_CIRUGIAS === "cirugias" en runtime', 'obtuvo ' + JSON.stringify(mod.BUCKET_CIRUGIAS));
  }

  if (Array.isArray(mod.EXTENSIONES_PERMITIDAS) && mod.EXTENSIONES_PERMITIDAS.length >= 5) {
    ok('EXTENSIONES_PERMITIDAS es array con >=5 elementos');
  } else {
    fail('EXTENSIONES_PERMITIDAS es array con >=5 elementos', JSON.stringify(mod.EXTENSIONES_PERMITIDAS));
  }

  if (mod.MIME_PERMITIDOS && typeof mod.MIME_PERMITIDOS === 'object') {
    ok('MIME_PERMITIDOS es un objeto Record<string,string[]>');
  } else {
    fail('MIME_PERMITIDOS es un objeto Record<string,string[]>', JSON.stringify(mod.MIME_PERMITIDOS));
  }

  if (typeof mod.MAX_TAMANO_ARCHIVO === 'number' && mod.MAX_TAMANO_ARCHIVO > 0) {
    ok('MAX_TAMANO_ARCHIVO es número positivo (' + mod.MAX_TAMANO_ARCHIVO + ')');
  } else {
    fail('MAX_TAMANO_ARCHIVO es número positivo', JSON.stringify(mod.MAX_TAMANO_ARCHIVO));
  }

  if (typeof mod.MAX_ARCHIVOS_POR_CIRUGIA === 'number' && mod.MAX_ARCHIVOS_POR_CIRUGIA > 0) {
    ok('MAX_ARCHIVOS_POR_CIRUGIA es número positivo (' + mod.MAX_ARCHIVOS_POR_CIRUGIA + ')');
  } else {
    fail('MAX_ARCHIVOS_POR_CIRUGIA es número positivo', JSON.stringify(mod.MAX_ARCHIVOS_POR_CIRUGIA));
  }

  // -- Caso válido: PDF dentro de límite con MIME correcto
  let r;
  try {
    r = mod.validarArchivo(mockFile('consentimiento.pdf', 1024 * 100, 'application/pdf'));
  } catch (e) {
    fail('validarArchivo(pdf válido) -> valido', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === true) {
    ok('validarArchivo(pdf 100KB, application/pdf) -> { valido: true }');
  } else {
    fail('validarArchivo(pdf 100KB, application/pdf) -> { valido: true }', JSON.stringify(r));
  }

  // -- Caso válido: JPG con MIME image/jpeg
  try {
    r = mod.validarArchivo(mockFile('foto.jpg', 2048, 'image/jpeg'));
  } catch (e) {
    fail('validarArchivo(jpg válido) -> valido', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === true) {
    ok('validarArchivo(jpg 2KB, image/jpeg) -> { valido: true }');
  } else {
    fail('validarArchivo(jpg 2KB, image/jpeg) -> { valido: true }', JSON.stringify(r));
  }

  // -- Caso válido: jpeg (extensión larga) con MIME image/jpeg
  try {
    r = mod.validarArchivo(mockFile('foto.jpeg', 2048, 'image/jpeg'));
  } catch (e) {
    fail('validarArchivo(jpeg válido) -> valido', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === true) {
    ok('validarArchivo(jpeg 2KB, image/jpeg) -> { valido: true }');
  } else {
    fail('validarArchivo(jpeg 2KB, image/jpeg) -> { valido: true }', JSON.stringify(r));
  }

  // -- Caso válido: PNG con MIME image/png
  try {
    r = mod.validarArchivo(mockFile('imagen.png', 4096, 'image/png'));
  } catch (e) {
    fail('validarArchivo(png válido) -> valido', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === true) {
    ok('validarArchivo(png 4KB, image/png) -> { valido: true }');
  } else {
    fail('validarArchivo(png 4KB, image/png) -> { valido: true }', JSON.stringify(r));
  }

  // -- Caso válido: WebP con MIME image/webp
  try {
    r = mod.validarArchivo(mockFile('foto.webp', 1024, 'image/webp'));
  } catch (e) {
    fail('validarArchivo(webp válido) -> valido', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === true) {
    ok('validarArchivo(webp 1KB, image/webp) -> { valido: true }');
  } else {
    fail('validarArchivo(webp 1KB, image/webp) -> { valido: true }', JSON.stringify(r));
  }

  // -- Rechazo por tamaño excedido
  try {
    r = mod.validarArchivo(
      mockFile('grande.pdf', mod.MAX_TAMANO_ARCHIVO + 1, 'application/pdf')
    );
  } catch (e) {
    fail('validarArchivo > MAX_TAMANO_ARCHIVO -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false && /tama(ñ|n)o/i.test(r.error || '')) {
    ok('validarArchivo(size > MAX) -> { valido: false, error contiene "tamaño" }');
  } else {
    fail(
      'validarArchivo(size > MAX) -> { valido: false, error contiene "tamaño" }',
      JSON.stringify(r)
    );
  }

  // -- Rechazo por extensión no permitida (.exe)
  try {
    r = mod.validarArchivo(mockFile('malware.exe', 1024, 'application/octet-stream'));
  } catch (e) {
    fail('validarArchivo(.exe) -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false && /formato|no permitido|extensi/i.test(r.error || '')) {
    ok('validarArchivo(.exe) -> { valido: false, error menciona formato/extensión }');
  } else {
    fail(
      'validarArchivo(.exe) -> { valido: false, error menciona formato/extensión }',
      JSON.stringify(r)
    );
  }

  // -- Rechazo por extensión no permitida (.docx)
  try {
    r = mod.validarArchivo(
      mockFile(
        'documento.docx',
        1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    );
  } catch (e) {
    fail('validarArchivo(.docx) -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false) {
    ok('validarArchivo(.docx) -> { valido: false }');
  } else {
    fail('validarArchivo(.docx) -> { valido: false }', JSON.stringify(r));
  }

  // -- Rechazo por MIME no coincidente (extensión .pdf con MIME image/png)
  try {
    r = mod.validarArchivo(mockFile('tramposo.pdf', 1024, 'image/png'));
  } catch (e) {
    fail('validarArchivo(MIME no coincide) -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false && /mime|extens/i.test(r.error || '')) {
    ok('validarArchivo(MIME no coincide con extensión) -> { valido: false, error menciona MIME/extensión }');
  } else {
    fail(
      'validarArchivo(MIME no coincide con extensión) -> { valido: false, error menciona MIME/extensión }',
      JSON.stringify(r)
    );
  }

  // -- Rechazo por archivo vacío (size 0)
  try {
    r = mod.validarArchivo(mockFile('vacio.pdf', 0, 'application/pdf'));
  } catch (e) {
    fail('validarArchivo(size 0) -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false) {
    ok('validarArchivo(size 0) -> { valido: false }');
  } else {
    fail('validarArchivo(size 0) -> { valido: false }', JSON.stringify(r));
  }

  // -- Sanity: pasar maxBytes personalizados respeta el límite
  try {
    r = mod.validarArchivo(mockFile('chico.pdf', 500, 'application/pdf'), { maxBytes: 100 });
  } catch (e) {
    fail('validarArchivo(maxBytes custom) -> rechazo', 'excepción: ' + e.message);
    return;
  }
  if (r && r.valido === false) {
    ok('validarArchivo(size > maxBytes custom) -> { valido: false }');
  } else {
    fail('validarArchivo(size > maxBytes custom) -> { valido: false }', JSON.stringify(r));
  }

  // --- Estático: MAX_ARCHIVOS_POR_CIRUGIA se valida en subirArchivoACirugia
  const helperContent = fs.readFileSync(STORAGE_HELPER_FILE, 'utf8');
  assertContainsAll(
    helperContent,
    [
      'MAX_ARCHIVOS_POR_CIRUGIA',
      ".from('cirugia_archivos')",
      'count',
      'deleted_at',
    ],
    'subirArchivoACirugia verifica MAX_ARCHIVOS_POR_CIRUGIA con count sobre cirugia_archivos'
  );

  // --- Estático: tipo_documento obligatorio en el endpoint POST
  const archivosRouteContent = fs.existsSync(ARCHIVOS_ROUTE_FILE)
    ? fs.readFileSync(ARCHIVOS_ROUTE_FILE, 'utf8')
    : '';
  assertContainsAll(
    archivosRouteContent,
    [
      'tipo_documento',
      'obligatorio',
      'status: 400',
    ],
    "endpoint POST rechaza con 400 cuando falta tipo_documento (mensaje 'obligatorio')"
  );
}

// ---------------------------------------------------------------------------
// [3/5] Endpoint src/app/api/cirugias/[id]/archivos/route.ts (GET, POST)
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

  // 2. Importa requireAuth y verificarPermisoArchivo
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\brequireAuth\b[^}]*\}\s*from\s*['"]@\/lib\/supabase\/server['"]/,
    'importa requireAuth desde @/lib/supabase/server'
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bverificarPermisoArchivo\b[^}]*\}\s*from\s*['"]@\/lib\/permisos-archivo['"]/,
    "importa verificarPermisoArchivo desde @/lib/permisos-archivo"
  );

  // 3. Importa subirArchivoACirugia
  assertRegexMatches(
    content,
    /from\s+['"]@\/lib\/storage-cirugia['"]/,
    "importa desde '@/lib/storage-cirugia'"
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bsubirArchivoACirugia\b[^}]*\}\s*from\s*['"]@\/lib\/storage-cirugia['"]/,
    'importa subirArchivoACirugia'
  );

  // 4. POST llama a subirArchivoACirugia
  assertRegexMatches(
    content,
    /subirArchivoACirugia\s*\(/,
    'POST llama a subirArchivoACirugia(...)'
  );

  // 5. POST inserta en cirugia_archivos
  assertContainsAll(
    content,
    [
      ".from('cirugia_archivos')",
      ".insert(",
      'nombre_original',
      'nombre_storage',
      'mime_type',
      'size',
      'storage_path',
      'tipo_documento',
      'uploaded_by',
    ],
    "POST inserta en cirugia_archivos con metadatos (nombre_original, storage_path, tipo_documento, uploaded_by...)"
  );

  // 6. POST inserta ARCHIVO_AGREGADO en cirugia_historial
  assertContainsAll(
    content,
    [
      ".from('cirugia_historial')",
      ".insert(",
      "'ARCHIVO_AGREGADO'",
      'accion:',
      'detalle:',
    ],
    "POST inserta accion='ARCHIVO_AGREGADO' en cirugia_historial con detalle"
  );

  // 7. POST verifica existencia de la cirugía antes de subir
  assertContainsAll(
    content,
    [
      ".from('agenda_cirugias')",
      '.eq(\'id\', id)',
      'Cirugía no encontrada',
      'status: 404',
    ],
    "POST valida existencia de la cirugía en agenda_cirugias antes de procesar"
  );

  // 8. POST exige archivo + tipo_documento
  assertContainsAll(
    content,
    [
      'archivo',
      'instanceof File',
      'tipo_documento',
      'El archivo es obligatorio',
      'El tipo de documento es obligatorio',
    ],
    "POST exige 'archivo' (File) y 'tipo_documento' obligatorios"
  );

  // 9. GET usa requireAuth + verificarPermisoArchivo y filtra deleted_at IS NULL
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'GET llama a requireAuth()'
  );
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*auth\.user\.id\s*,\s*['"]ver['"]\s*\)/,
    "GET verifica permiso 'ver' con verificarPermisoArchivo"
  );
  assertRegexMatches(
    content,
    /status:\s*403/,
    'GET responde 403 si no tiene permiso'
  );
  assertRegexMatches(
    content,
    /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/,
    'GET filtra deleted_at IS NULL al listar archivos'
  );

  // 10. POST usa getSupabaseAdmin() (servidor)
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'POST usa getSupabaseAdmin() (cliente servidor)'
  );

  // 11. Limpieza: si falla el insert, elimina el archivo del storage
  assertContainsAll(
    content,
    [
      'eliminarArchivoDeStorage(',
      'insertError',
    ],
    "POST limpia el storage si falla el insert en cirugia_archivos (eliminarArchivoDeStorage)"
  );
}

// ---------------------------------------------------------------------------
// [4/5] Endpoint src/app/api/cirugias/[id]/archivos/[archivoId]/route.ts
//       (GET, DELETE)
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

  // 2. Importa generarUrlFirmada
  assertRegexMatches(
    content,
    /from\s+['"]@\/lib\/storage-cirugia['"]/,
    "importa desde '@/lib/storage-cirugia'"
  );
  assertRegexMatches(
    content,
    /import\s*\{[^}]*\bgenerarUrlFirmada\b[^}]*\}\s*from\s*['"]@\/lib\/storage-cirugia['"]/,
    'importa generarUrlFirmada'
  );

  // 3. GET llama a generarUrlFirmada y devuelve signedUrl
  assertContainsAll(
    content,
    [
      'generarUrlFirmada(',
      'storage_path',
      'signedUrl',
      '3600',
    ],
    'GET llama a generarUrlFirmada(storage_path, 3600) y devuelve { archivo, signedUrl }'
  );

  // 4. GET verifica archivo + cirugia_id + deleted_at IS NULL
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]id['"]\s*,\s*archivoId\s*\)/,
    'GET filtra por archivoId'
  );
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]cirugia_id['"]\s*,\s*id\s*\)/,
    'GET filtra por cirugia_id (id de la ruta)'
  );
  assertRegexMatches(
    content,
    /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/,
    'GET filtra deleted_at IS NULL'
  );
  assertRegexMatches(
    content,
    /Archivo no encontrado/,
    'GET responde 404 si el archivo no existe o fue eliminado'
  );

  // 5. DELETE hace update con deleted_at y deleted_by
  assertContainsAll(
    content,
    [
      ".from('cirugia_archivos')",
      '.update(',
      'deleted_at',
      'deleted_by',
      'new Date().toISOString()',
      'auth.user.id',
    ],
    "DELETE hace .update({ deleted_at, deleted_by }) sobre cirugia_archivos"
  );

  // 6. DELETE inserta ARCHIVO_ELIMINADO en cirugia_historial
  assertContainsAll(
    content,
    [
      ".from('cirugia_historial')",
      '.insert(',
      "'ARCHIVO_ELIMINADO'",
      'accion:',
      'detalle:',
    ],
    "DELETE inserta accion='ARCHIVO_ELIMINADO' en cirugia_historial con detalle"
  );

  // 7. DELETE valida existencia previa
  assertContainsAll(
    content,
    [
      '.eq(\'id\', archivoId)',
      '.eq(\'cirugia_id\', id)',
      'Archivo no encontrado',
      'status: 404',
    ],
    "DELETE verifica que el archivo existe y pertenece a la cirugía (404 si no)"
  );

  // 8. Usa getSupabaseAdmin() (servidor)
  assertRegexMatches(
    content,
    /getSupabaseAdmin\s*\(\s*\)/,
    'usa getSupabaseAdmin() (cliente servidor)'
  );

  // 9. Restringe por permisos de archivo
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*auth\.user\.id\s*,\s*['"]descargar['"]\s*\)/,
    "GET verifica permiso 'descargar' con verificarPermisoArchivo"
  );
  assertRegexMatches(
    content,
    /verificarPermisoArchivo\s*\(\s*auth\.user\.id\s*,\s*['"]eliminar['"]\s*\)/,
    "DELETE verifica permiso 'eliminar' con verificarPermisoArchivo"
  );
  assertRegexMatches(
    content,
    /status:\s*403/,
    'responde 403 si no tiene permiso'
  );
}

// ---------------------------------------------------------------------------
// [5/5] Anti-regresión: nada del lado cliente importa el helper o el admin
//        + script npm test:b5 + b1..b4 intactos.
// ---------------------------------------------------------------------------

function walkSrc(dir, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') return;
      walkSrc(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  });
}

function checkServerOnlyAndPackageJson() {
  console.log('\n[5/5] Anti-regresión (cliente) + script npm test:b5');

  // 5a. Endpoints NO escriben directo a Storage: no debe haber
  //     .storage. inline en los archivos de la API; las operaciones se
  //     delegan a helpers de @/lib/storage-cirugia.
  const archivosRoute = fs.readFileSync(ARCHIVOS_ROUTE_FILE, 'utf8');
  assertNotContains(
    archivosRoute,
    'supabase.storage',
    'endpoint archivos/route.ts NO accede directo a supabase.storage'
  );
  const detailRoute = fs.readFileSync(ARCHIVO_DETAIL_ROUTE_FILE, 'utf8');
  assertNotContains(
    detailRoute,
    'supabase.storage',
    'endpoint archivos/[archivoId]/route.ts NO accede directo a supabase.storage'
  );

  // 5b. Los endpoints usan getSupabaseAdmin (servidor) y NO createBrowserClient
  //     ni createServerClient (rutas API deben usar el admin client).
  assertNotContains(
    archivosRoute,
    'createBrowserClient',
    'endpoint archivos/route.ts NO usa createBrowserClient (cliente)'
  );
  assertNotContains(
    archivosRoute,
    '@supabase/auth-helpers-nextjs',
    'endpoint archivos/route.ts NO usa @supabase/auth-helpers-nextjs'
  );
  assertNotContains(
    detailRoute,
    'createBrowserClient',
    'endpoint archivos/[archivoId]/route.ts NO usa createBrowserClient'
  );
  assertNotContains(
    detailRoute,
    '@supabase/auth-helpers-nextjs',
    'endpoint archivos/[archivoId]/route.ts NO usa @supabase/auth-helpers-nextjs'
  );

  // 5c. Ningún archivo 'use client' importa @/lib/storage-cirugia ni
  //     @/lib/supabase/admin (regresión).
  const srcDir = path.join(REPO_ROOT, 'src');
  const allFiles = [];
  walkSrc(srcDir, allFiles);
  const clientImports = [];
  allFiles.forEach(function (f) {
    if (!/\.(ts|tsx|js|jsx)$/.test(f)) return;
    const c = fs.readFileSync(f, 'utf8');
    if (!/['"]use client['"]/.test(c)) return;
    const lines = c.split(/\r?\n/);
    let isClient = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/['"]use client['"]/.test(line)) {
        isClient = true;
      }
      if (
        isClient &&
        (/from\s+['"]@\/lib\/storage-cirugia['"]/.test(line) ||
          /from\s+['"]@\/lib\/supabase\/admin['"]/.test(line))
      ) {
        clientImports.push(path.relative(REPO_ROOT, f) + ':' + (i + 1));
      }
    }
  });
  if (clientImports.length === 0) {
    ok(
      "ningún archivo 'use client' importa @/lib/storage-cirugia o @/lib/supabase/admin"
    );
  } else {
    fail(
      "ningún archivo 'use client' importa @/lib/storage-cirugia o @/lib/supabase/admin",
      'detectado en: ' + clientImports.join(', ')
    );
  }

  // 5d. package.json: script test:b5 presente, sin tocar test:b1..b4.
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
    typeof scripts['test:b5'] === 'string' &&
    scripts['test:b5'].length > 0
  ) {
    ok(
      'script npm "test:b5" definido (' +
        JSON.stringify(scripts['test:b5']) +
        ')'
    );
  } else {
    fail('script npm "test:b5" definido', 'ausente o vacío en package.json');
  }

  ['test:b1', 'test:b2', 'test:b3', 'test:b4'].forEach(function (key) {
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
  console.log(' Pruebas B5 - Archivos de cirugía (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkStorageHelper();
  checkValidations();
  checkArchivosRoute();
  checkArchivoDetailRoute();
  checkServerOnlyAndPackageJson();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach(function (f, i) {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B5 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B5 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();
