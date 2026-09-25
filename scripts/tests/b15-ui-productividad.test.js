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
  'VISTAS',
  "'Métricas'",
  "'Honorarios'",
  "'Doctores'",
  "'Pagos'",
  "'Sync'",
  'useUser',
  'rangoMesActual',
  'formatFechaCsv',
  '/api/productividad',
  '/api/productividad/metricas',
  'formato',
  'csv',
  'AbortController',
  'Acceso restringido',
  "rol === 'admin'",
  '/api/productividad/honorarios',
  'periodo',
  'Pagar',
  'Embudo',
  'MetricasSeccion',
  'DoctorDetalle',
  'PagosHistorial',
  'ssr: false',
  "descargarReporte('entradas_salidas'",
  'ModalRangoFechas',
  '/api/productividad/reportes/cirugias',
  'Descargar reporte CSV de entradas y salidas de consultas',
  'agrupar_por',
  "pageSize: '10'",
  'pageSize=10',
  'líneas del doctor',
  'const rangoActivo = desde && hasta',
  'if (abortLigaRef.current === controller) setLoading(false)',
  'page={page}',
], 'page.tsx botones de secciones + admin + fetch + CSV + embudo + doctor + pagos + paginación 10');

assertContains('src/components/ui/Pagination.tsx', [
  'Math.max(1, Math.floor(Number(page) || 1))',
  'totalPages <= 10',
  '}–{',
  'type="button"',
], 'Pagination.tsx valores numéricos seguros + números hasta 10 páginas + guion');

assertNotContains('src/components/ui/Pagination.tsx', [
  'â€“',
], 'Pagination.tsx sin caracteres mal codificados en el rango');

assertNotContains(page, [
  "tab === 'entradas_salidas'",
  'tablas.entradas_salidas',
  'formatHora12',
  'from \'@/components/ui/Tabs\'',
], 'page.tsx sin tabla entradas_salidas ni componente Tabs');

const removidas = ['Tarifas', 'Períodos'];
const pageContent = read(page) || '';
const presentes = removidas.filter((t) => pageContent.includes(`'${t}'`) || pageContent.includes(`"${t}"`) || pageContent.includes(`: '${t}'`));
if (presentes.length === 0) ok('sin pestañas Tarifas/Períodos en labels');
else fail('sin pestañas Tarifas/Períodos', presentes.join(', '));

const sinTabs = !pageContent.includes('from \'@/components/ui/Tabs\'') && !pageContent.includes('<Tabs');
if (sinTabs) ok('sin componente Tabs (reemplazado por botones de sección)');
else fail('sin componente Tabs', 'sigue importando/usando Tabs');

assertContains('src/components/productividad/charts.tsx', [
  'recharts',
  'h-[360px] max-lg:h-[280px]',
  'h-[320px] max-lg:h-[260px]',
  'h-[280px]',
  'h-[300px] max-lg:h-[240px]',
  'ResponsiveContainer',
], 'charts.tsx librería recharts + tamaños de gráficos');

assertContains('package.json', ['"recharts"'], 'dependencia recharts instalada');

assertContains('src/components/productividad/PagosHistorial.tsx', [
  '/api/productividad/honorarios/pagos',
  'formato',
  'fecha_pago',
], 'historial de pagos consume endpoint propio');

assertContains('src/components/productividad/DoctorDetalle.tsx', [
  '/api/agenda?',
  'doctorId',
  '/api/productividad/metricas',
  '/api/productividad/honorarios',
], 'detalle de doctor incluye agenda + métricas + honorarios');

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
