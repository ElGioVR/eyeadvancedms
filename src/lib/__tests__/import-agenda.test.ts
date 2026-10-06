import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveDoctor,
  claveTexto,
  crearResolverDoctores,
  crearResolverPacientes,
  generarCsvRechazos,
  normalizarSexo,
  parseFechaImport,
  detectarOrdenFechas,
  fechasInvertidasPorExcel,
  parseHoraImport,
  validarAliasDoctor,
  validarNombrePaciente,
  valorCelda,
  faltantesPaciente,
} from '../import-agenda';

test('claves: sin mayúsculas, acentos ni espacios extra', () => {
  assert.equal(claveTexto('  José   Pérez '), 'JOSE PEREZ');
  assert.equal(claveDoctor('Dra. Irina'), 'IRINA');
  assert.equal(claveDoctor('DR LUIS'), claveDoctor('luis'));
});

test('alias de doctor: MAYÚSCULAS y validación', () => {
  const v = validarAliasDoctor('  luis  ');
  assert.ok(v.ok && v.alias === 'LUIS');
  const multi = validarAliasDoctor('BAYARDO/IRINA');
  assert.ok(multi.ok && multi.alias === 'BAYARDO');
  for (const malo of ['123', 'N/A', 'x', 'DR', '---', 'DR 5']) {
    assert.equal(validarAliasDoctor(malo).ok, false, malo);
  }
});

test('nombre de paciente: nombre y apellido, solo letras', () => {
  assert.ok(validarNombrePaciente('María  López').ok);
  assert.equal(validarNombrePaciente('MARIA').ok, false);
  assert.equal(validarNombrePaciente('Juan 123').ok, false);
  assert.equal(validarNombrePaciente('PENDIENTE').ok, false);
  assert.equal(validarNombrePaciente('').ok, false);
});

test('resolver doctores: Luis = LUIS, no crea otro', () => {
  const r = crearResolverDoctores([{ id: 'd1', alias: 'LUIS', activo: true }]);
  assert.deepEqual(r('Luis'), { tipo: 'existente', id: 'd1', alias: 'LUIS' });
  assert.deepEqual(r('luis '), { tipo: 'existente', id: 'd1', alias: 'LUIS' });
  assert.equal(r(''), null);
});

test('resolver doctores: título y palabra completa', () => {
  const r = crearResolverDoctores([
    { id: 'd1', alias: 'DRA IRINA', activo: true },
    { id: 'd2', alias: 'DR BAYARDO GARZA', activo: true },
    { id: 'd3', alias: 'LUISA', activo: true },
  ]);
  assert.equal((r('IRINA') as { id: string }).id, 'd1');
  assert.equal((r('BAYARDO/IRINA') as { id: string }).id, 'd2');
  // «LUIS» no debe tomar a «LUISA» (antes se usaba includes)
  assert.equal(r('LUIS')?.tipo, 'nuevo');
});

test('resolver doctores: ambiguo, inactivo e inválido se rechazan', () => {
  const r = crearResolverDoctores([
    { id: 'a', alias: 'LUIS PEREZ', activo: true },
    { id: 'b', alias: 'LUIS GOMEZ', activo: true },
    { id: 'c', alias: 'FELIX', activo: false },
  ]);
  assert.equal(r('LUIS')?.tipo, 'rechazo');
  assert.equal(r('Felix')?.tipo, 'rechazo');
  assert.equal(r('N/A')?.tipo, 'rechazo');
});

test('resolver doctores: nuevo una sola vez por clave', () => {
  const r = crearResolverDoctores([]);
  const a = r('Pedro Ruiz');
  const b = r('PEDRO  RUIZ');
  assert.equal(a?.tipo, 'nuevo');
  assert.strictEqual(a, b);
  assert.equal((a as { alias: string }).alias, 'PEDRO RUIZ');
});

test('resolver pacientes: por nombre; teléfono solo desempata', () => {
  const r = crearResolverPacientes([
    { id: 'p1', nombre_completo: 'María López', telefono: '6641111111', created_at: '2024-01-01' },
    { id: 'p2', nombre_completo: 'MARIA LOPEZ', telefono: '6642222222', created_at: '2025-01-01' },
    { id: 'p3', nombre_completo: 'Juan Ruiz', telefono: '6649999999' },
  ]);
  assert.equal(r(claveTexto('maria lópez'), '664-222-2222'), 'p2');
  assert.equal(r(claveTexto('maria lopez'), null), 'p1');
  assert.equal(r(claveTexto('Pedro Paz'), '6649999999'), null); // mismo teléfono, otro nombre: no se mezcla
});

test('sexo: MUJER ya no se toma como masculino', () => {
  assert.equal(normalizarSexo('MUJER'), 'FEMENINO');
  assert.equal(normalizarSexo('F'), 'FEMENINO');
  assert.equal(normalizarSexo('Masculino'), 'MASCULINO');
  assert.equal(normalizarSexo('?'), null);
});

test('fechas y horas', () => {
  assert.equal(parseFechaImport('2026-07-22 00:00:00'), '2026-07-22');
  assert.equal(parseFechaImport('Tuesday, September 1, 2026'), '2026-09-01');
  assert.equal(parseFechaImport('01/02/2026'), '2026-02-01');
  assert.equal(parseFechaImport(46225), '2026-07-22');
  assert.equal(parseFechaImport('31/02/2026'), null);
  assert.equal(parseFechaImport('mañana'), null);
  assert.equal(parseHoraImport('10:00AM'), '10:00:00');
  assert.equal(parseHoraImport('12:30 pm'), '12:30:00');
  assert.equal(parseHoraImport(0.25), '06:00:00');
  assert.equal(parseHoraImport('25:00'), null);
});

test('celdas de Excel', () => {
  assert.equal(valorCelda(new Date(Date.UTC(2026, 6, 22))), '2026-07-22');
  assert.equal(valorCelda(new Date(Date.UTC(1899, 11, 30, 6, 0))), '06:00:00');
  assert.equal(valorCelda({ richText: [{ text: 'A' }, { text: 'B' }] }), 'AB');
  assert.equal(valorCelda({ formula: 'x', result: 5 }), 5);
});

test('CSV de rechazos con motivo por fila', () => {
  const csv = generarCsvRechazos(['FECHA', 'NOMBRE'], [{ fila: 3, motivo: 'Fecha no válida', valores: ['32/13/2026', 'Ana, Ruiz'] }])!;
  const [cab, l1] = csv.split('\r\n');
  assert.equal(cab, 'FILA,MOTIVO DEL RECHAZO,FECHA,NOMBRE');
  assert.equal(l1, '3,Fecha no válida,32/13/2026,"Ana, Ruiz"');
  assert.equal(generarCsvRechazos(['A'], []), null);
});

test('faltantes de paciente', () => {
  assert.deepEqual(faltantesPaciente({ sexo: 'F', edad: 40, telefono: '1' }), []);
  assert.deepEqual(faltantesPaciente({}), ['sexo', 'fecha de nacimiento', 'teléfono']);
});

test('fechas: formatos de Excel en español/inglés y orden mes/día por columna', () => {
  // Con hora pegada (CSV exportado desde Excel)
  assert.equal(parseFechaImport('01/09/2026 00:00'), '2026-09-01');
  assert.equal(parseFechaImport('9/15/2026 12:00:00 AM'), '2026-09-15');
  // Mes/día sin ambigüedad (día > 12)
  assert.equal(parseFechaImport('9/15/2026'), '2026-09-15');
  // Ambiguas: deciden por la columna
  const col = ['9/1/2026', '9/15/2026'];
  const orden = detectarOrdenFechas(col);
  assert.equal(orden, 'mdy');
  assert.equal(parseFechaImport('9/1/2026', orden), '2026-09-01');
  assert.equal(parseFechaImport('9/1/2026'), '2026-01-09'); // México por defecto
  assert.equal(detectarOrdenFechas(['1/9/2026', '15/9/2026']), 'dmy');
  assert.equal(detectarOrdenFechas(['06/05/1958'], 'mdy'), 'mdy');
  // Mes en texto
  assert.equal(parseFechaImport('01-sep-2026'), '2026-09-01');
  assert.equal(parseFechaImport('1-Sep-26'), '2026-09-01');
  assert.equal(parseFechaImport('martes, 1 de septiembre de 2026'), '2026-09-01');
  assert.equal(parseFechaImport('Sep 1, 2026'), '2026-09-01');
  assert.equal(parseFechaImport('2026/09/01'), '2026-09-01');
  assert.equal(parseFechaImport('46225'), '2026-07-22');
  assert.equal(parseFechaImport('05/06/58'), '1958-06-05');
  assert.equal(parseFechaImport('13/13/2026'), null);
});

test('horas: a. m./p. m. de Excel en español y variantes', () => {
  assert.equal(parseHoraImport('10:00 a. m.'), '10:00:00');
  assert.equal(parseHoraImport('3:30 p. m.'), '15:30:00');
  assert.equal(parseHoraImport('10:00:00\u202fa.\u202fm.'), '10:00:00');
  assert.equal(parseHoraImport('10 AM'), '10:00:00');
  assert.equal(parseHoraImport('10:00 hrs'), '10:00:00');
  assert.equal(parseHoraImport('13:00 PM'), null);
  assert.equal(parseHoraImport('10'), null);
});

test('valorCelda: fórmula sin resultado guardado → vacío', () => {
  assert.equal(valorCelda({ formula: 'DATE(2026,9,1)' }), '');
});

test('xlsx mezclado: texto mes/día + celdas de fecha invertidas por Excel es-MX', () => {
  // Caso real CIRUGIAS 2026: «7/29/2026» quedó como texto; «8/1/2026» Excel lo guardó como 8 de enero.
  const col = ['7/29/2026', '2026-01-08', '2026-08-08', '8/24/2026', '2026-02-09'];
  assert.equal(fechasInvertidasPorExcel(col), 2);
  assert.equal(parseFechaImport('2026-01-08', 'mdy', true), '2026-08-01');
  assert.equal(parseFechaImport('2026-08-08', 'mdy', true), '2026-08-08');
  assert.equal(parseFechaImport('2026-02-09', 'mdy', true), '2026-09-02');
  // Sin texto mes/día no se invierte nada
  assert.equal(fechasInvertidasPorExcel(['2026-01-08', '15/09/2026']), 0);
  assert.equal(fechasInvertidasPorExcel(['2026-01-08', '2026-02-09']), 0);
});
