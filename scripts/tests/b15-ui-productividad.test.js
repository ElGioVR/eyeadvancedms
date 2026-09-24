#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B15 — UI /productividad: pestañas, admin-only, hidratación SSR/CSR, CSV cliente.
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

function assertContains(rel, needles, label) {
  const c = read(rel);
  if (c === null) {
    fail(label, 'archivo ausente: ' + rel);
    return;
  }
  const missing = needles.filter((n) => !c.includes(n));
  if (missing.length === 0) ok(label + ' (' + needles.length + ')');
  else fail(label, 'faltan: ' + missing.map((m) => JSON.stringify(m)).join(', '));
}

function assertNotContains(rel, needles, label) {
  const c = read(rel);
  if (c === null) {
    fail(label, 'archivo ausente: ' + rel);
    return;
  }
  const present = needles.filter((n) => c.includes(n));
  if (present.length === 0) ok(label);
  else fail(label, 'no debe contener: ' + present.map((m) => JSON.stringify(m)).join(', '));
}

console.log('\n[B15] UI productividad + Sidebar admin + hidratación\n');

const page = 'src/app/(dashboard)/productividad/page.tsx';
function assertFileOk(rel) {
  if (read(rel) !== null) ok('existe ' + rel);
  else fail('existe ' + rel, 'no encontrado');
}
assertFileOk(page);

assertContains(page, [
  "'use client'",
  'Tabs',
  'Honorarios',
  'Por doctor',
  'Cirugías',
  'Entradas y salidas',
  'Estudios',
  'useUser',
  'rangoMesActual',
  'formatFechaCsv',
  '/api/productividad',
  'formato',
  'csv',
  'AbortController',
  'Acceso restringido',
  "rol === 'admin'",
], 'page.tsx pestañas + admin + fetch + CSV');

assertNotContains(page, [
  'localStorage',
  'sessionStorage',
  'Math.random',
  'matchMedia',
], 'page.tsx sin APIs de cliente en render');

const fechaEnRender = /useState\(\s*new Date/.test(read(page) || '');
if (!fechaEnRender) ok('useState sin new Date (hidratación)');
else fail('useState sin new Date', 'inicializador con new Date');

assertFileOk('src/app/(dashboard)/productividad/loading.tsx');
assertContains('src/components/layout/Sidebar.tsx', [
  '/productividad',
  'adminOnly',
  "user?.rol === 'admin'",
], 'Sidebar link admin-only');

assertContains('src/lib/rangos.ts', ['America/Tijuana'], 'rangos timezone');

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B15 PASÓ.');
process.exit(0);
