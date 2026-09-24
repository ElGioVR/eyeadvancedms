#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B12 — Migraciones y fusión del namespace productividad.
 * Node puro: solo lee archivos del repo (sin BD).
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

console.log('\n[B12] Migraciones productividad + fusión de namespace\n');

const mig230 = 'src/migrations/1800000000230-AddProductividadColumns.ts';
const mig240 = 'src/migrations/1800000000240-CreateProductividadHonorariosResumen.ts';
assertFile(mig230);
assertFile(mig240);
assertContains(mig230, [
  'consulta_origen_id',
  'dedupe_key',
  'PAGADO',
  'ojo',
  'OD',
  'OI',
  'OU',
  'IF NOT EXISTS',
], 'mig 230 columnas/enum/índices');
assertContains(mig240, [
  'productividad_honorarios_resumen',
  'cirugia_productividad',
  'COALESCE',
], 'mig 240 función resumen');

assertContains(
  'scripts/run-migrations.js',
  ['1800000000230-AddProductividadColumns.ts', '1800000000240-CreateProductividadHonorariosResumen.ts'],
  'MIGRATION_ORDER registra 230 y 240'
);

assertFile('sql/backfill-consulta-origen.sql');
assertFile('sql/auditoria-duplicados-honorarios.sql');
assertContains('sql/backfill-consulta-origen.sql', ['consulta_origen_id', 'UPDATE'], 'backfill idempotente');
assertContains('sql/auditoria-duplicados-honorarios.sql', ['SELECT'], 'auditoría solo SELECT');

assertFile('src/lib/productividad/index.ts');
assertFile('src/lib/productividad/cirugia.ts');
assertFile('src/lib/productividad/resumen.ts');
assertContains('src/lib/productividad/index.ts', ["./cirugia", "./resumen"], 'index re-exporta cirugia+resumen');
assertContains('src/lib/productividad/cirugia.ts', ['@/lib/productividad-cirugia'], 'cirugia re-exporta motor');
assertContains('src/lib/productividad/resumen.ts', ['productividad_honorarios_resumen', 'listarResumenHonorarios'], 'resumen → RPC');

assertContains(
  'src/app/api/cirugias/route.ts',
  ["@/lib/productividad"],
  'POST /api/cirugias importa @/lib/productividad'
);
assertContains(
  'src/app/api/cirugias/[id]/productividad/route.ts',
  ["@/lib/productividad"],
  'GET productividad cirugía importa @/lib/productividad'
);

const restos = [];
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walk(full);
    } else if (/\.(ts|tsx|js|jsx|sql|md)$/.test(e.name)) {
      const c = fs.readFileSync(full, 'utf8');
      if (/analitico_honorarios|analitico-cirugia|\banalitico\b/i.test(c) && !full.includes('auditoria-fase-1') && !full.includes('.test-')) {
        const rel = path.relative(REPO, full);
        if (!rel.includes('productividad/auditoria') && !rel.includes('00-mapa-repo')) restos.push(rel);
      }
    }
  }
}
walk(path.join(REPO, 'src'));
walk(path.join(REPO, 'sql'));
if (restos.length === 0) ok('sin restos "analitico" en src/ y sql/');
else fail('sin restos "analitico"', restos.join(', '));

assertContains('docs/productividad/auditoria.md', ['D-FUS-01', 'D11', 'D10b'], 'auditoría docs');

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B12 PASÓ.');
process.exit(0);
