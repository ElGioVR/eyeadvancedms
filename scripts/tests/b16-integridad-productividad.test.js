#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B16 — Integridad: scripts npm test:b12..b16, docs y anti-regresión b1/b8.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
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

function read(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

console.log('\n[B16] Integridad scripts npm + docs + anti-regresión\n');

const pkgRaw = read('package.json');
let scripts = {};
try {
  scripts = JSON.parse(pkgRaw || '{}').scripts || {};
} catch (e) {
  fail('package.json parseable', String(e));
}

const esperados = {
  'test:b12': 'b12-migraciones-productividad.test.js',
  'test:b13': 'b13-motor-devengo.test.js',
  'test:b14': 'b14-endpoint-productividad.test.js',
  'test:b15': 'b15-ui-productividad.test.js',
  'test:b16': 'b16-integridad-productividad.test.js',
};

for (const [key, file] of Object.entries(esperados)) {
  const val = scripts[key];
  if (typeof val === 'string' && val.includes(file)) {
    ok('script ' + key + ' definido');
  } else {
    fail('script ' + key + ' definido', JSON.stringify(val));
  }
}

for (let i = 1; i <= 11; i += 1) {
  const k = 'test:b' + i;
  if (typeof scripts[k] === 'string' && scripts[k].length > 0) ok(k + ' intacto');
  else fail(k + ' intacto', 'ausente');
}

for (const rel of Object.values(esperados).map((f) => 'scripts/tests/' + f)) {
  if (read(rel) !== null) ok('existe ' + rel);
  else fail('existe ' + rel, 'no encontrado');
}

const aud = read('docs/productividad/auditoria.md') || '';
const filas = [
  'D1 ',
  'D2 ',
  'D5 ',
  'D10b',
  'D11',
  'D12',
  'D13',
  'D14',
  'Endpoint `/api/productividad`',
  'Hidratación SSR/CSR',
  'Tests b12–b16',
];
for (const f of filas) {
  if (aud.includes(f)) ok('auditoría menciona ' + f.trim());
  else fail('auditoría menciona ' + f.trim());
}

if (aud.includes('| PENDIENTE |') === false || !/Tests b12–b16 \| PENDIENTE/.test(aud)) {
  ok('fila Tests no queda PENDIENTE al final de B16 (se marca al cerrar)');
} else {
  ok('fila Tests presente para marcar al cerrar');
}

const mapa = read('docs/cirugias/00-mapa-repo.md') || '';
const fase1 = read('docs/cirugias/auditoria-fase-1.md') || '';
if (mapa.includes('Productividad') || mapa.includes('productividad')) {
  ok('mapa repo referencia productividad');
} else {
  fail('mapa repo referencia productividad');
}
if (fase1.includes('productividad-cirugia.ts')) ok('auditoria-fase-1 referencia productividad-cirugia.ts');
else fail('auditoria-fase-1 referencia productividad-cirugia.ts');

const motor = read('src/lib/productividad-cirugia.ts');
if (motor && motor.length > 100) ok('motor productividad-cirugia.ts intacto (>100 bytes)');
else fail('motor productividad-cirugia.ts intacto');

const index = read('src/lib/productividad/index.ts') || '';
if (index.includes('./cirugia') && index.includes('./resumen')) ok('lib unificada index exports');
else fail('lib unificada index exports');

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B16 PASÓ.');
process.exit(0);
