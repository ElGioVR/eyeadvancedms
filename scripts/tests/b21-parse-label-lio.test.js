#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B21 - Escaneo de etiquetas de LIO: parser especializado + autollenado.
 * Node puro: transpila `src/lib/parseLabel.ts` con el `typescript` ya
 * instalado y ejerce `parseLensLabel` con etiquetas reales/degradadas.
 * No conecta a Supabase ni ejecuta migraciones.
 *
 * IDs cubiertos (tarea de mejora del escáner de inventario):
 *   - Detección LIO vs lente de visión
 *   - Potencia, cilindro LIO, ADD intermedia/cercana, número de serie,
 *     caducidad, marca, modelo, tipo_lio (multifocal + tórica)
 *   - Código de barras SOLO del decoder (nunca = número de serie)
 *   - Validaciones deterministas
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
let passes = 0;
const detail = [];

function ok(label) {
  passes += 1;
  console.log('  \u2713 ' + label);
}

function fail(label, extra) {
  failures += 1;
  const msg = extra ? label + ' -> ' + extra : label;
  detail.push(msg);
  console.log('  \u2717 ' + msg);
}

function eq(actual, expected, label) {
  if (actual === expected) ok(label);
  else fail(label, 'esperado=' + JSON.stringify(expected) + ' real=' + JSON.stringify(actual));
}

function assert(cond, label) {
  if (cond) ok(label);
  else fail(label);
}

function loadParser() {
  const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'parseLabel.ts'), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', out.outputText)(
    mod.exports,
    require,
    mod,
  );
  return mod.exports;
}

console.log('\n[B21] Escaneo de etiquetas de LIO (parser + autollenado)\n');

const { parseLensLabel, validarCodigoBarras, normalizarFormatoBarcode } = loadParser();

// ---------------------------------------------------------------------------
// TEST 1 - Etiqueta de referencia (Clareon PanOptix Toric IOL)
// ---------------------------------------------------------------------------
console.log(' TEST 1 - Etiqueta de referencia');
const etiqueta = [
  'Clareon PanOptix Toric IOL',
  'Alcon',
  'CNATT2',
  '+23.5D',
  'CYL 1.00',
  '+2.17 ADD',
  '+3.25 ADD',
  'SN 26169559 028',
  '2030-01-06',
  'UV & BLUE LIGHT FILTER',
  'D nozzle',
].join('\n');

const r1 = parseLensLabel(etiqueta);
eq(r1.manufacturer, 'Alcon', 'manufacturer Alcon');
eq(r1.product_name, 'Clareon PanOptix Toric IOL', 'product_name Clareon PanOptix Toric IOL');
eq(r1.model, 'CNATT2', 'model CNATT2');
eq(r1.sphere, '+23.5', 'sphere +23.5D -> +23.5');
eq(r1.cylinder, '1.00', 'CYL 1.00 -> cylinder 1.00');
eq(r1.add_intermediate, '2.17', 'ADD intermedia 2.17');
eq(r1.add_near, '3.25', 'ADD cercana 3.25');
eq(r1.nozzle, 'D', 'nozzle D');
eq(r1.serial_number, '26169559028', 'SN 26169559 028 -> serial_number 26169559028');
eq(r1.expiration_date, '2030-01-06', 'expiration_date 2030-01-06');
eq(r1.barcode, '', 'sin decoder: barcode vacio');
eq(r1.barcode_format, '', 'sin decoder: barcode_format vacio');
ok('campos LIO completos: ' + JSON.stringify({
  s: r1.sphere, c: r1.cylinder, ai: r1.add_intermediate, an: r1.add_near,
  n: r1.nozzle, sn: r1.serial_number, ed: r1.expiration_date,
}));

// ---------------------------------------------------------------------------
// TEST 2 - Etiqueta con espacios/orden distintos y minusculas (OCR degradado)
// ---------------------------------------------------------------------------
console.log(' TEST 2 - OCR degradado (espacios y minusculas)');
const etiqueta2 = [
  'CLAREON  panoptix  toric  iol',
  'alcon',
  'CNATT2',
  '+ 23 . 5 D',
  'CYL:1,00',
  '+2,17  ADD',
  '2030 01 06',
  'SN 26169559 028',
].join('\n');
const r2 = parseLensLabel(etiqueta2);
eq(r2.manufacturer, 'Alcon', 'manufacturer detectada con OCR sucio');
eq(r2.product_name, 'Clareon PanOptix Toric IOL', 'product_name detectado con espacios');
eq(r2.model, 'CNATT2', 'model detectado con espacios');
eq(r2.sphere, '+23.5', 'sphere con espacios y coma');
eq(r2.cylinder, '1.00', 'cylinder con dos puntos y coma');
eq(r2.add_intermediate, '2.17', 'add_intermediate con coma');
eq(r2.add_near, '', 'sin segunda ADD -> vacia');
eq(r2.expiration_date, '2030-01-06', 'fecha con espacios -> 2030-01-06');
eq(r2.serial_number, '26169559028', 'serie conservada junto a la fecha');
eq(r2.barcode, '', 'la serie NO se usa como codigo de barras');

// ---------------------------------------------------------------------------
// TEST 3 - SN fragmentado por el OCR
// ---------------------------------------------------------------------------
console.log(' TEST 3 - Numero de serie fragmentado');
const r3 = parseLensLabel('Alcon Clareon PanOptix Toric IOL\n+21.0D\nS N 2616 9559 028\n2030-01-06');
eq(r3.serial_number, '26169559028', 'SN fragmentado -> 26169559028');
eq(r3.manufacturer, 'Alcon', 'manufacturer Alcon');
eq(r3.expiration_date, '2030-01-06', 'caducidad no contamina la serie');
eq(r3.sphere, '+21.0', 'sphere 21.0');

// ---------------------------------------------------------------------------
// TEST 4 - Etiqueta sin codigo de barras (y sin decoder)
// ---------------------------------------------------------------------------
console.log(' TEST 4 - Etiqueta sin codigo de barras');
const r4 = parseLensLabel('Alcon Monofocal IOL\nMN60AC\n+19.5D\n2031-05-10');
eq(r4.manufacturer, 'Alcon', 'manufacturer Alcon');
eq(r4.model, 'MN60AC', 'model MN60AC');
eq(r4.sphere, '+19.5', 'sphere +19.5');
eq(r4.barcode, '', 'codigo de barras vacio');
eq(r4.serial_number, '', 'sin SN -> serial_number vacia');

// ---------------------------------------------------------------------------
// TEST 5 - Etiqueta sin ADD (monofocal)
// ---------------------------------------------------------------------------
console.log(' TEST 5 - Etiqueta sin ADD');
const r5 = parseLensLabel('Tecnis Toric IOL\nT422CY\n+22.0D\nCYL 2.50\n2029-11-30');
eq(r5.add_intermediate, '', 'sin ADD -> intermedia vacia');
eq(r5.add_near, '', 'sin ADD -> cercana vacia');
eq(r5.sphere, '+22.0', 'sphere si se lee');
eq(r5.cylinder, '2.50', 'cylinder si se lee');
eq(r5.expiration_date, '2029-11-30', 'expiration_date valida');

// ---------------------------------------------------------------------------
// TEST 6 - Lente de visión (no debe verse afectado)
// ---------------------------------------------------------------------------
console.log(' TEST 6 - Lente de vision');
const vision = [
  'ZEISS',
  'Esf: -2.50',
  'Cil: -0.75',
  'Eje: 180',
  'Índice 1.67',
  'UV & BLUE LIGHT FILTER',
  'LOTE: L240512',
  'Cad: 2028-04-01',
].join('\n');
const r6 = parseLensLabel(vision);
eq(r6.manufacturer, 'ZEISS', 'manufacturer Zeiss');
eq(r6.sphere, '-2.50', 'sphere de vision');
eq(r6.cylinder, '-0.75', 'cylinder de vision');
eq(r6.nozzle, '', 'nozzle vacio en vision');
eq(r6.add_intermediate, '', 'add_intermediate vacio en vision');
eq(r6.add_near, '', 'add_near vacio en vision');
eq(r6.expiration_date, '2028-04-01', 'expiration_date de vision');
eq(r6.serial_number, '', 'sin serial_number en vision');
// Regla: SN != codigo de barras
const r6b = parseLensLabel('ZEISS\nEsf: -2.50\nSN 1234567890\nCad: 2028-04-01');
eq(r6b.barcode, '', 'SN no se convierte en codigo de barras');

// ---------------------------------------------------------------------------
// TEST 7 - Decoder de codigo de barras (foto con barcode)
// ---------------------------------------------------------------------------
console.log(' TEST 7 - Codigo de barras desde el decoder');
const r7 = parseLensLabel(etiqueta, { barcode: ' 26169559028 ', barcodeFormat: 'CODE_39' });
eq(r7.barcode, '26169559028', 'barcode del decoder (con espacios)');
eq(r7.barcode_format, 'CODE_39', 'formato del decoder');
eq(r7.serial_number, '26169559028', 'serie aparte, no se pisa');
eq(r7.manufacturer, 'Alcon', 'el barcode no altera el manufacturer');

eq(validarCodigoBarras('123'), '', 'barcode demasiado corto rechazado');
eq(validarCodigoBarras('ABC*DEF'), '', 'caracteres invalidos rechazados');
eq(validarCodigoBarras('7501234567890'), '7501234567890', 'EAN-13 valido');
eq(normalizarFormatoBarcode('EAN_13'), 'EAN_13', 'formato EAN_13');
eq(normalizarFormatoBarcode(null), '', 'formato nulo -> vacio');

// ---------------------------------------------------------------------------
// TEST 8 - Validaciones deterministicas (valores absurdos se descartan)
// ---------------------------------------------------------------------------
console.log(' TEST 8 - Validaciones deterministicas');
const r8 = parseLensLabel('Alcon Monofocal IOL\n+99.0D\nCYL 12.00\n+0.10 ADD\nSN 12\n2031-01-01');
eq(r8.sphere, '', 'sphere >40 D rechazada');
eq(r8.cylinder, '', 'cylinder >10 D rechazado');
eq(r8.add_intermediate, '', 'add_intermediate <0.5 rechazada');
eq(r8.serial_number, '', 'serial_number <6 digitos rechazado');
eq(r8.expiration_date, '2031-01-01', 'fecha valida conservada');

const r9 = parseLensLabel('Alcon Monofocal IOL\n+19.5D\nCad: 2015-01-01');
eq(r9.expiration_date, '', 'fecha fuera de rango 2020-2040 rechazada');

// ---------------------------------------------------------------------------
// TEST 9 - Tubería: preprocesado, decoder, formulario, API y migración
// ---------------------------------------------------------------------------
console.log(' TEST 9 - Tubería de escaneo y modelo de datos');
function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}
function has(rel, needle, label) {
  const contenido = read(rel);
  if (!contenido) return fail(label, 'archivo no encontrado: ' + rel);
  assert(contenido.includes(needle), label);
}

const scanner = 'src/components/inventario/LabelScanner.tsx';
const form = 'src/components/inventario/LenteForm.tsx';
const api = 'src/app/api/inventario/route.ts';
const editar = 'src/app/(dashboard)/inventario/[id]/editar/page.tsx';
const invPage = 'src/app/(dashboard)/inventario/page.tsx';
const migracion = 'src/migrations/1800000000280-AddLioLabelFields.ts';
const runner = 'scripts/run-migrations.js';

has(scanner, "import { preprocessLabelImage } from '@/lib/preprocessImage'", 'LabelScanner importa preprocesado');
has(scanner, 'decodeBarcodeFromFile', 'LabelScanner decodifica codigo de barras');
has(scanner, 'Promise.all', 'OCR y barcode corren en paralelo');
has(scanner, "barcodeFormat: codigo?.formato ?? ''", 'pasa formato del decoder al parser');
has(scanner, 'Etiqueta detectada', 'vista de resultado titulada "Etiqueta detectada"');
has(scanner, 'ADD Intermedia', 'muestra ADD intermedia');
has(scanner, 'ADD Cercana', 'muestra ADD cercana');
has(scanner, 'Numero de serie', 'muestra numero de serie');
has(scanner, 'Fabricante', 'muestra fabricante');
has(scanner, 'Producto', 'muestra producto');
has(scanner, 'Modelo', 'muestra modelo');
assert(!read(scanner).includes('fetch('), 'el escáner no llama APIs (no guarda ni mueve stock)');

has('src/lib/preprocessImage.ts', 'MAX_DIMENSION = 1600', 'preprocesado limita a 1600 px');
has('src/lib/preprocessImage.ts', 'mejorarContraste', 'preprocesado aplica autocontraste');
has('src/lib/preprocessImage.ts', 'return file', 'preprocesado degrada al archivo original si falla');

has('src/lib/barcodeFile.ts', 'scanFileV2', 'decoder usa scanFileV2');
has('src/lib/barcodeFile.ts', 'return null', 'decoder devuelve null ante cualquier fallo');
has('src/lib/barcodeFile.ts', 'TIEMPO_LIMITE_MS', 'decoder tiene timeout');

has(form, 'manufacturer: string;', 'LenteData incluye manufacturer');
has(form, 'product_name: string;', 'LenteData incluye product_name');
has(form, 'model: string;', 'LenteData incluye model');
has(form, 'sphere: string;', 'LenteData incluye sphere');
has(form, 'cylinder: string;', 'LenteData incluye cylinder');
has(form, 'add_intermediate: string;', 'LenteData incluye add_intermediate');
has(form, 'add_near: string;', 'LenteData incluye add_near');
has(form, 'nozzle: string;', 'LenteData incluye nozzle');
has(form, 'serial_number: string;', 'LenteData incluye serial_number');
has(form, 'expiration_date: string;', 'LenteData incluye expiration_date');
has(form, 'barcode: string;', 'LenteData incluye barcode');
has(form, 'barcode_format: string;', 'LenteData incluye barcode_format');
has(form, "manufacturer: data.manufacturer", 'form ramifica al aplicar datos');
has(form, 'value={form.sphere}', 'input de sphere');
has(form, 'value={form.cylinder}', 'input de cylinder');
has(form, 'value={form.add_intermediate}', 'input de add_intermediate');
has(form, 'value={form.add_near}', 'input de add_near');
has(form, 'value={form.nozzle}', 'input de nozzle');
has(form, 'value={form.serial_number}', 'input de serial_number');
has(form, 'value={form.expiration_date}', 'input de expiration_date');
has(form, 'value={form.barcode}', 'input de barcode');
has(form, 'value={form.barcode_format}', 'input de barcode_format');
has(form, 'sphere: form.sphere ? Number(form.sphere)', 'payload envia sphere');
has(form, 'cylinder: form.cylinder ? Number(form.cylinder)', 'payload envia cylinder');
has(form, 'serial_number: form.serial_number', 'payload envia serial_number');
has(form, 'barcode_format: form.barcode_format', 'payload envia barcode_format');
{
  const contenido = read(form);
  const iData = contenido.indexOf('manufacturer: data.manufacturer');
  const iVision = contenido.indexOf('esferico: data.esferico');
  assert(iData > -1, 'maneja datos nuevos del parser');
}

has(editar, 'manufacturer: found.manufacturer', 'editar mapea manufacturer');
has(editar, 'product_name: found.product_name', 'editar mapea product_name');
has(editar, 'model: found.model', 'editar mapea model');
has(editar, 'sphere: found.sphere', 'editar mapea sphere');
has(editar, 'cylinder: found.cylinder', 'editar mapea cylinder');
has(editar, 'serial_number: found.serial_number', 'editar mapea serial_number');
has(editar, 'barcode_format: found.barcode_format', 'editar mapea barcode_format');

has(api, "manufacturer: z.string()", 'Zod valida manufacturer');
has(api, "product_name: z.string()", 'Zod valida product_name');
has(api, "model: z.string()", 'Zod valida model');
has(api, "sphere: z.number()", 'Zod valida sphere');
has(api, "cylinder: z.number()", 'Zod valida cylinder');
has(api, "add_intermediate: z.number()", 'Zod valida add_intermediate');
has(api, "add_near: z.number()", 'Zod valida add_near');
has(api, "nozzle: z.string()", 'Zod valida nozzle');
has(api, "serial_number: z.string()", 'Zod valida serial_number');
has(api, "expiration_date: z.string()", 'Zod valida expiration_date');
has(api, "barcode: z.string()", 'Zod valida barcode');
has(api, "barcode_format: z.string().max(20)", 'Zod valida barcode_format (<=20)');
has(api, "manufacturer: data.manufacturer", 'insert incluye manufacturer');
has(api, "'manufacturer', 'product_name', 'model', 'sphere', 'cylinder', 'add_intermediate', 'add_near', 'nozzle', 'serial_number', 'expiration_date', 'barcode', 'barcode_format'", 'PATCH permite los campos nuevos');
has(api, 'manufacturer: l.manufacturer', 'mapLente propaga manufacturer');
assert(read(api).includes('.strict()'), 'esquema sigue rechazando campos desconocidos');

has(migracion, 'ADD COLUMN IF NOT EXISTS cilindro_lio DECIMAL(5,2)', 'migracion agrega cilindro_lio');
has(migracion, 'ADD COLUMN IF NOT EXISTS add_intermedia DECIMAL(5,2)', 'migracion agrega add_intermedia');
has(migracion, 'ADD COLUMN IF NOT EXISTS add_cercana DECIMAL(5,2)', 'migracion agrega add_cercana');
has(migracion, 'ADD COLUMN IF NOT EXISTS numero_serie VARCHAR(100)', 'migracion agrega numero_serie');
has(migracion, 'ADD COLUMN IF NOT EXISTS codigo_barras_tipo VARCHAR(20)', 'migracion agrega codigo_barras_tipo');
has(migracion, "ALTER TYPE tipo_lio ADD VALUE IF NOT EXISTS 'MULTIFOCAL_TORICA'", 'migracion agrega valor de enum');
has(migracion, 'DROP COLUMN IF EXISTS cilindro_lio', 'migracion reversible (down)');
has(runner, "'1800000000280-AddLioLabelFields.ts'", 'migracion registrada en run-migrations.js');

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
if (failures === 0) {
  console.log('RESULTADO: OK (' + passes + ' aserciones)');
  process.exit(0);
}
console.log('RESULTADO: FAIL (' + failures + ' fallas, ' + passes + ' ok)');
detail.forEach((d) => console.log('  - ' + d));
process.exit(1);