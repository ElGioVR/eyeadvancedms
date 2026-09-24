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
  'src/services/honorarios/MotorDevengoService.ts',
  [
    'sin_tarifa',
    'cantidad',
    'operador',
    'dedupe_key',
    'PORCENTAJE',
    'tipo_calculo',
    'cantidadSafe',
    'servicio_id',
    'aseguranza_servicios',
  ],
  'MotorDevengoService (D5/D10b/D11 + generarDesdeCirugia)'
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

const motor = read('src/services/honorarios/MotorDevengoService.ts') || '';
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
