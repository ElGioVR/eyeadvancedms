#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B18 — Métricas gráficas, embudo, detalle por doctor e historial de pagos.
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
  console.log('  ✓ ' + label);
}

function fail(label, extra) {
  failures += 1;
  const msg = extra ? label + ' -> ' + extra : label;
  detail.push(msg);
  console.log('  ✗ ' + msg);
}

function read(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function assertFile(rel) {
  if (read(rel) !== null) ok('existe ' + rel);
  else fail('existe ' + rel, 'no encontrado');
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

console.log('\n[B18] Métricas gráficas + embudo + detalle doctor + historial de pagos\n');

const metricasRoute = 'src/app/api/productividad/metricas/route.ts';
const pagosRoute = 'src/app/api/productividad/honorarios/pagos/route.ts';
const metricasLib = 'src/lib/productividad/metricas.ts';

assertFile(metricasRoute);
assertContains(
  metricasRoute,
  [
    "requireRole(auth.user, ['admin'])",
    'Server-Timing',
    'formato',
    'agregarMetricas',
    'listarResumenHonorarios',
    'rangoPersonalizado',
    'Content-Disposition',
  ],
  'endpoint /api/productividad/metricas admin-only + Server-Timing + CSV'
);
assertNotContains(metricasRoute, [".select('*"], 'métricas sin select *');

assertFile(pagosRoute);
assertContains(
  pagosRoute,
  [
    "requireRole(auth.user, ['admin'])",
    'Server-Timing',
    "'PAGADO'",
    'fecha_pago',
    'pagado_por',
    'formato',
    'historial-pagos',
    'rangoPersonalizado',
  ],
  'endpoint historial de pagos admin-only + fecha_pago + CSV'
);
assertNotContains(pagosRoute, [".select('*"], 'pagos sin select *');

assertFile(metricasLib);
assertContains(
  metricasLib,
  ['agregarMetricas', 'serie_diaria', 'por_fuente', 'por_estado', 'ticket_promedio', 'por_doctor'],
  'agregador de métricas (series + kpis)'
);

assertContains(
  'src/lib/productividad/liga.ts',
  ['agruparFilas', 'params.fuente', 'params.estado', 'params.agrupar_por'],
  'liga soporta filtros fuente/estado + agrupación'
);

assertContains('src/lib/productividad/liga.ts', ['page = 1,', 'pageSize = 10'], 'panel doctor pagina de 10 en 10 por defecto');
assertContains(
  'src/app/api/productividad/honorarios/doctor/[doctorId]/route.ts',
  [
    'pageSize',
    '|| 10',
    'panelDoctorHonorarios(',
    'conRango ? { desde, hasta } : undefined',
  ],
  'ruta panel doctor acepta page/pageSize + rango desde/hasta'
);

assertContains(
  'src/app/api/productividad/honorarios/route.ts',
  ['fuente', 'estado', 'agrupar_por'],
  'ruta honorarios expone fuente/estado/agrupar_por'
);

const migracion = 'src/migrations/1800000000270-AddIndiceHistorialPagos.ts';
assertFile(migracion);
assertContains(
  migracion,
  ['idx_eventos_honorario_fecha_pago', "estado = 'PAGADO'", 'DROP INDEX'],
  'migración índice historial de pagos (aditiva, con down)'
);
assertContains(
  'scripts/run-migrations.js',
  ['1800000000270-AddIndiceHistorialPagos.ts'],
  'migración 270 registrada en MIGRATION_ORDER'
);

assertContains(
  'src/components/productividad/Embudo.tsx',
  ['total_filtrado', 'por_pagar', 'pagado', 'total_eventos'],
  'embudo de honorarios con etapas'
);

assertContains(
  'docs/productividad/auditoria.md',
  ['RM-1 ', 'RM-2 ', 'RM-4 ', 'RH-1 ', 'RD-1 ', 'RP-1 '],
  'auditoría registra requisitos del rediseño'
);

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B18 PASÓ.');
process.exit(0);
