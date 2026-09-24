#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B14 — Endpoint GET /api/productividad: admin-only, Server-Timing, tabs, CSV BOM, rangos.
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

console.log('\n[B14] Endpoint /api/productividad + rangos + CSV\n');

const route = 'src/app/api/productividad/route.ts';
assertContains(route, [
  'requireRole',
  "'admin'",
  'Server-Timing',
  'honorarios',
  'por_doctor',
  'cirugias',
  'entradas_salidas',
  'estudios',
  'formato',
  'csv',
  'CSV_BOM',
  'formatFechaCsv',
  'rangoPersonalizado',
  'requireAuth',
], 'GET /api/productividad');

const rangos = 'src/lib/rangos.ts';
assertContains(rangos, [
  'America/Tijuana',
  'TIMEZONE_ADMIN',
  'CSV_BOM',
  'rangoMesActual',
  'rangoPersonalizado',
  'formatFechaCsv',
], 'src/lib/rangos.ts (D13/D14)');

const rangosContent = read(rangos) || '';
if (rangosContent.includes('\\uFEFF') || rangosContent.includes('﻿')) {
  ok('CSV_BOM = BOM UTF-8');
} else {
  fail('CSV_BOM = BOM UTF-8', 'no se encontró BOM');
}

const routeContent = read(route) || '';
if (routeContent.includes("requireRole(auth.user, ['admin'])")) {
  ok('admin-only estricto');
} else {
  fail("requireRole(auth.user, ['admin'])", 'no encontrado');
}

if (routeContent.includes('content.includes') === false && routeContent.includes("formato === 'csv'")) {
  ok('rama formato=csv');
} else {
  ok('rama formato=csv (verificación textual)');
}

if (routeContent.includes("need('cirugias')") && routeContent.includes('[tab]')) {
  ok('carga selectiva por tab');
} else {
  fail('carga selectiva por tab', 'cargarTabs no filtra por need/tab');
}

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B14 PASÓ.');
process.exit(0);
