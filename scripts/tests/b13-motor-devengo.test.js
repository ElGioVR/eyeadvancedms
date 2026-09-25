#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B13 — Motor de devengo: D11, D5, D10b, cantidad/ojo, costo_total.
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

console.log('\n[B13] Motor devengo D11/D5/D10 + consultas cantidad/ojo\n');

assertContains(
  'src/services/productividad/MotorDevengoService.ts',
  [
    'sin_tarifa',
    'dedupe_key',
    'generarDesdeCirugia',
    'resolverFuenteHonorario',
    'cancelarPorConsulta',
    'cancelarPorCirugia',
    'metricas_ligados',
    'deployed_to_performance',
    'marcarDeployed',
    'listarPendientesDespliegue',
    'reportar_doctor_distinto',
    'normalizarMoneda',
    'normalizarRolEvento',
    "moneda: normalizarMoneda",
    'rol: normalizarRolEvento',
  ],
  'MotorDevengoService (R1/R2 + cancelación + métricas + deployed + moneda + rol)'
);

assertContains(
  'src/app/api/productividad/sync/route.ts',
  [
    'deployed_to_performance',
    'solo_pendientes',
    'consultas_desplegadas',
    'doctores_sin_evento',
    'generarDesdeCirugia',
    'generarDesdeConsulta',
  ],
  'Sync: flag deployed + multi-doctor + preview'
);

assertContains(
  'src/migrations/1800000000261-AddDeployedToPerformance.ts',
  ['deployed_to_performance', 'deployed_at', 'consultas', 'agenda_cirugias'],
  'Migración 261 flag deployed'
);

assertContains(
  'src/app/api/consultas/route.ts',
  [
    'consulta_origen_id',
    'cantidad',
    'ojo',
    'precio_aplicado',
    'costo_total',
    'consulta_origen_id',
  ],
  'POST /api/consultas Zod + conceptos'
);

assertContains(
  'src/components/consultations/AgendarEstudioModal.tsx',
  ['consulta_origen_id'],
  'AgendarEstudioModal envía consulta_origen_id'
);

const motor = read('src/services/productividad/MotorDevengoService.ts') || '';
if (motor.includes('dedupe_key')) ok('dedupe_key presente en insert de eventos');
else fail('dedupe_key presente en insert de eventos');

const consultas = read('src/app/api/consultas/route.ts') || '';
if (consultas.includes('precio_aplicado * concepto.cantidad') || consultas.includes('precio_aplicado * cantidad')) {
  ok('costo_total considera cantidad');
} else {
  fail('costo_total considera cantidad', 'no se encontró fórmula con cantidad');
}

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B13 PASÓ.');
process.exit(0);
