#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B17 — Honorarios simplificados: período pura, resolución de fuente, monto/pago.
 * Node puro: carga TS con ts-node transpileOnly (sin BD).
 */
'use strict';

const path = require('path');

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

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(label);
  else fail(label, 'esperado ' + e + ' obtenido ' + a);
}

function loadTs(rel) {
  const abs = path.resolve(__dirname, '..', '..', rel);
  const ts = require('typescript');
  const fs = require('fs');
  const source = fs.readFileSync(abs, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
  const Module = require('module');
  const m = new Module(abs, null);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  m._compile(out, abs);
  return m.exports;
}

console.log('\n[B17] Honorarios: periodo + resolver-fuente + monto\n');

try {
  const { getPeriodRange, periodoSiguiente, montoValidoParaPago, parseMontoManual, esTipoPeriodo } =
    loadTs('src/lib/productividad/periodo.ts');

  assertEqual(
    getPeriodRange('2026-09-23', 'SEMANAL'),
    { inicio: '2026-09-21', fin: '2026-09-27', tipo: 'SEMANAL' },
    'SEMANAL lunes-domingo'
  );

  assertEqual(
    getPeriodRange('2026-09-10', 'QUINCENAL'),
    { inicio: '2026-09-01', fin: '2026-09-15', tipo: 'QUINCENAL' },
    'QUINCENAL primera quincena'
  );

  assertEqual(
    getPeriodRange('2026-09-20', 'QUINCENAL'),
    { inicio: '2026-09-16', fin: '2026-09-30', tipo: 'QUINCENAL' },
    'QUINCENAL segunda quincena'
  );

  assertEqual(
    getPeriodRange('2026-02-10', 'MENSUAL'),
    { inicio: '2026-02-01', fin: '2026-02-28', tipo: 'MENSUAL' },
    'MENSUAL febrero 2026'
  );

  assertEqual(
    getPeriodRange('2026-05-15', 'TRIMESTRAL'),
    { inicio: '2026-04-01', fin: '2026-06-30', tipo: 'TRIMESTRAL' },
    'TRIMESTRAL Q2'
  );

  assertEqual(
    periodoSiguiente({ inicio: '2026-09-01', fin: '2026-09-15', tipo: 'QUINCENAL' }),
    { inicio: '2026-09-16', fin: '2026-09-30', tipo: 'QUINCENAL' },
    'periodoSiguiente QUINCENAL'
  );

  if (esTipoPeriodo('MENSUAL') && !esTipoPeriodo('CUSTOM')) ok('esTipoPeriodo');
  else fail('esTipoPeriodo');

  if (montoValidoParaPago(10) && !montoValidoParaPago(0) && !montoValidoParaPago(-1)) {
    ok('montoValidoParaPago >0');
  } else fail('montoValidoParaPago >0');

  assertEqual(parseMontoManual('123.456'), 123.46, 'parseMontoManual 2 decimales');
  assertEqual(parseMontoManual(-1), null, 'parseMontoManual rechaza negativo');
} catch (err) {
  fail('cargar periodo.ts', String(err && err.message ? err.message : err));
}

try {
  const { resolverFuenteHonorario, contarMetricasConceptos, metricasVacias } =
    loadTs('src/lib/productividad/resolver-fuente.ts');

  const consulta = resolverFuenteHonorario({
    tipo: 'CONSULTA',
    tieneConsultaRaiz: true,
    consultaId: 'c1',
    doctorId: 'd1',
  });
  if (consulta.crearLinea && consulta.fuente === 'CONSULTA' && consulta.origenId === 'c1') {
    ok('consulta crea línea única');
  } else fail('consulta crea línea única');

  const estudioLigado = resolverFuenteHonorario({
    tipo: 'ESTUDIO',
    tieneConsultaRaiz: true,
    consultaId: 'c1',
    doctorId: 'd2',
    doctorConsultaId: 'd1',
  });
  if (estudioLigado.crearLinea && estudioLigado.reportarDoctorDistinto && estudioLigado.doctorId === 'd2') {
    ok('estudio ligado doctor distinto crea línea + reporta');
  } else fail('estudio ligado doctor distinto crea línea + reporta');

  const estudioMismoDoctor = resolverFuenteHonorario({
    tipo: 'ESTUDIO',
    tieneConsultaRaiz: true,
    consultaId: 'c1',
    doctorId: 'd1',
    doctorConsultaId: 'd1',
  });
  if (!estudioMismoDoctor.crearLinea && !estudioMismoDoctor.reportarDoctorDistinto) {
    ok('estudio ligado mismo doctor sin línea propia');
  } else fail('estudio ligado mismo doctor sin línea propia');

  const cirugiaLigada = resolverFuenteHonorario({
    tipo: 'CIRUGIA',
    tieneConsultaRaiz: true,
    consultaId: 'c1',
    cirugiaConsultaId: 'c1',
    doctorId: 'd1',
  });
  if (!cirugiaLigada.crearLinea && cirugiaLigada.motivo === 'cirugia_ligada_consulta') {
    ok('cirugía ligada no crea línea propia');
  } else fail('cirugía ligada no crea línea propia');

  const cirugiaIndep = resolverFuenteHonorario({
    tipo: 'CIRUGIA',
    tieneConsultaRaiz: false,
    consultaId: null,
    cirugiaConsultaId: null,
    doctorId: 'd9',
  });
  if (cirugiaIndep.crearLinea && cirugiaIndep.fuente === 'CIRUGIA') {
    ok('cirugía independiente crea línea');
  } else fail('cirugía independiente crea línea');

  const metricas = contarMetricasConceptos([
    { tipo_concepto: 'ESTUDIO' },
    { tipo_concepto: 'ESTUDIO' },
    { tipo_concepto: 'PROCEDIMIENTO' },
    { tipo_concepto: 'CONSULTA' },
  ]);
  assertEqual(metricas, { estudios_ligados: 2, procedimientos_ligados: 1, cirugias_ligadas: 0 }, 'contarMetricasConceptos');

  assertEqual(metricasVacias(), { estudios_ligados: 0, procedimientos_ligados: 0, cirugias_ligadas: 0 }, 'metricasVacias');
} catch (err) {
  fail('cargar resolver-fuente.ts', String(err && err.message ? err.message : err));
}

try {
  const fs = require('fs');
  const mig = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'src/migrations/1800000000260-AddHonorariosSimplificados.ts'),
    'utf8'
  );
  for (const n of ['CANCELADO', 'fecha_pago', 'pagado_por', 'metricas_ligados', 'idx_eventos_honorario_liga']) {
    if (mig.includes(n)) ok('migración 260 contiene ' + n);
    else fail('migración 260 contiene ' + n);
  }
  const order = fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts/run-migrations.js'), 'utf8');
  if (order.includes('1800000000260-AddHonorariosSimplificados.ts')) ok('MIGRATION_ORDER registra 260');
  else fail('MIGRATION_ORDER registra 260');
} catch (err) {
  fail('migración 260', String(err && err.message ? err.message : err));
}

try {
  const fs = require('fs');
  const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
  const liga = leer('src/lib/productividad/liga.ts');
  const needlesLiga = [
    ['const [eventosRes, doctoresRes, periodoTipo] = await Promise.all([', 'eventos + doctores + período en paralelo'],
    ['Promise.all([cadenaAgenda, cadenaConsultas])', 'agenda y cadena de consultas en paralelo'],
    ['resolverOrigenBatch(rawPagina)', 'origen resuelto solo para la página visible'],
    ['const pendientes: string[] = []', 'fallback por concepto en lote (1 query)'],
    ['consultaIdsQuery', 'ids de consulta aislados de los que agrega agenda'],
  ];
  for (const n of needlesLiga) {
    if (liga.includes(n[0])) ok('rendimiento: ' + n[1]);
    else fail('rendimiento: ' + n[1], 'no se encontró ' + n[0]);
  }
  if (!liga.includes(".eq('id', eh.origen_id)")) {
    ok('rendimiento: sin lookup N+1 por fila en resolverOrigenBatch');
  } else {
    fail('rendimiento: sin lookup N+1 por fila', 'sigue consultando por fila');
  }
  if ((liga.match(/from\('agenda_cirugias'\)/g) || []).length === 1) {
    ok('rendimiento: agenda_cirugias consultada 1 sola vez');
  } else {
    fail('rendimiento: agenda_cirugias consultada 1 sola vez', 'hay consultas duplicadas');
  }

  const rutas = [
    'src/app/api/productividad/honorarios/route.ts',
    'src/app/api/productividad/honorarios/doctor/[doctorId]/route.ts',
  ];
  for (const r of rutas) {
    const src = leer(r);
    if (src.includes('Server-Timing') && src.includes('auth;dur=') && src.includes('db;dur=')) {
      ok('Server-Timing con etapas auth/db en ' + r.split('/').slice(-2).join('/'));
    } else {
      fail('Server-Timing con etapas auth/db en ' + r, 'faltan auth;dur / db;dur');
    }
  }
} catch (err) {
  fail('rendimiento liga', String(err && err.message ? err.message : err));
}

console.log('\n--------------------------------------------------------');
console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
console.log('--------------------------------------------------------\n');
if (failures > 0) {
  console.log('Detalles:');
  detail.forEach((d) => console.log('  - ' + d));
  process.exit(1);
}
console.log('La prueba B17 PASÓ.');
process.exit(0);
