// Prueba de integración del import masivo con una BD en memoria (sin Supabase).
// Ejecutar: npm run test:import
import assert from 'node:assert/strict';
import { db, opciones } from './fake-admin';
import { POST } from '@/app/api/agenda/import/route';

const enviar = async (nombre: string, contenido: string, tipo: string, confirmar: boolean) => {
  const fd = new FormData();
  fd.append('file', new File([contenido], nombre, { type: 'text/csv' }));
  fd.append('tipo', tipo);
  if (confirmar) fd.append('confirmar', 'true');
  const res = await POST(new Request('http://x/api/agenda/import', { method: 'POST', body: fd }));
  const j: any = await res.json();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
  return j;
};

async function main() {
  db.doctores = [
    { id: 'd-luis', alias: 'LUIS', activo: true },
    { id: 'd-irina', alias: 'DRA IRINA', activo: true },
    { id: 'd-bay', alias: 'DR BAYARDO GARZA', activo: true },
  ];
  db.pacientes = [{ id: 'p-carlos', nombre_completo: 'Carlos Gómez Jiménez', telefono: '6644388498', created_at: '2024-01-01' }];
  db.consultas = [{ id: 'c0', paciente_id: 'p-carlos', fecha: '2026-09-01', hora_inicio: '11:30:00' }];
  db.aseguranzas = [];

  const H = 'FECHA,HORA DE INGRESO,HORA DE EGRESO,NUMERO DE TELEFONO,DOCTOR,NOMBRE DE PACIENTE,SEXO,FECHA DE NACIMIENTO,CONSULTA,TIPO DE CONSULTA,COSTO CONSULTA';
  const csv = [H,
    '2026-09-01,10:00AM,10:30AM,6611073755,luis,Manuel Escobar Martinez,MASCULINO,1958-06-05,CONSULTA,PRIMERA VEZ,800',   // 2 ok (doctor existente en minúsculas, paciente nuevo)
    '2026-09-01,11:30AM,12:00PM,6644388498,DRA IRINA,Carlos Gomez Jimenez,MASCULINO,,CONSULTA,SUBSECUENTE,0',            // 3 ya existe
    '2026-09-01,10:00AM,10:30AM,6611073755,LUIS,manuel escobar martínez,MASCULINO,,CONSULTA,PRIMERA VEZ,800',              // 4 duplicada en archivo
    '2026-09-01,09:00AM,,,,MARIA,,,CONSULTA,,0',                                                                          // 5 nombre incompleto
    '32/13/2026,09:00AM,,,LUIS,Rosa Mena Paz,,,CONSULTA,,0',                                                             // 6 fecha inválida
    '2026-09-02,09:00AM,,,pedro ruiz,Ana Torres,MUJER,,ESTUDIO,,0',                                                       // 7 doctor nuevo + paciente nueva
    '2026-09-02,10:00AM,,,PEDRO  RUIZ,ana  torres,,,ESTUDIO,,0',                                                          // 8 mismo doctor y paciente nuevos
    '2026-09-02,11:00AM,,,N/A,Luis Alberto Soto,,,CONSULTA,,0',                                                           // 9 doctor inválido
    '2026-09-02,25:00,,,LUIS,Luis Alberto Soto,,,CONSULTA,,0',                                                            // 10 hora inválida
  ].join('\n');

  const pv = await enviar('c.csv', csv, 'consultas', false);
  assert.deepEqual(pv.resumen, { total: 9, aImportar: 3, duplicadas: 2, conError: 4, doctoresNuevos: ['PEDRO RUIZ'], pacientesNuevos: 2 });
  assert.equal(db.consultas.length, 1, 'el preview no escribe');
  assert.deepEqual(pv.rechazos.map((r: any) => r.fila), [5, 6, 9, 10]);
  const lineas = pv.rechazosCsv.split('\r\n');
  assert.equal(lineas[0], 'FILA,MOTIVO DEL RECHAZO,' + H);
  assert.match(lineas[1], /^5,Nombre de paciente incompleto/);
  assert.match(lineas[2], /^6,"?Fecha no válida/);
  assert.equal(pv.duplicadosCsv.split('\r\n').length, 3);

  const r1 = await enviar('c.csv', csv, 'consultas', true);
  assert.equal(r1.importadas, 3);
  assert.equal(r1.doctoresCreados, 1);
  assert.equal(r1.pacientesCreados, 2);
  const pedro = db.doctores.filter((d) => d.alias === 'PEDRO RUIZ');
  assert.equal(pedro.length, 1);
  assert.equal(pedro[0].pendiente_completar, true);
  assert.equal(db.doctores.length, 4, 'no se duplicó LUIS');
  const ana = db.pacientes.filter((p) => p.nombre_completo === 'Ana Torres');
  assert.equal(ana.length, 1);
  assert.equal(ana[0].sexo, 'FEMENINO');
  assert.equal(ana[0].pendiente_completar, true);
  const manuel = db.pacientes.find((p) => p.nombre_completo === 'Manuel Escobar Martinez')!;
  assert.equal(manuel.pendiente_completar, false, 'tiene sexo, fecha y teléfono');
  assert.equal(db.consultas.filter((c) => c.doctor_id === 'd-luis').length, 1);

  const r2 = await enviar('c.csv', csv, 'consultas', true);
  assert.equal(r2.importadas, 0, 'reimportar no duplica');
  assert.equal(r2.omitidasDuplicadas, 5);
  assert.equal(r2.doctoresCreados + r2.pacientesCreados, 0);
  assert.equal(db.consultas.length, 4);

  // ── Cirugías ──
  db.agenda_cirugias = [];
  db.agenda_cirugia_doctores = [];
  const HC = 'FECHA,NOMBRE PX,No. Expediente,HORA CX,FECHA NAC.,SEXO,EDAD,DIAGNOSTICO,PROCEDIMIENTO,OJO,LIO,MARCA,CIRUJANO,NOTAS';
  const cx = [HC,
    '2026-07-22,MARIA LOURDES RUIZ,776,06:00:00,1969-09-20,F,56,RETINA,FACO-VITRECTOMIA,OS,23.00 CLAREON,,BAYARDO/IRINA,', // 2 ok, BAYARDO → DR BAYARDO GARZA
    ',Manuel Escobar Martinez,,,,,,CATARATA,FACO + LIO,OD,,,,',                                                           // 3 aplazada, paciente existente
    ',MANUEL ESCOBAR MARTINEZ,,,,,,CATARATA,faco + lio,OD,,,,',                                                            // 4 aplazada duplicada en archivo
    '2026-07-23,Pedro Lara Gil,,07:00,,M,40,CATARATA,FACO,XX,,,LUIS,',                                                     // 5 ojo inválido
    '2026-07-23,Pedro Lara Gil,,07:00,,M,40,CATARATA,FACO,OD,,,Felix Rios,SUSPENDIDO',                                     // 6 cancelada, doctor nuevo
  ].join('\n');
  const pc = await enviar('x.csv', cx, 'cirugias', false);
  assert.deepEqual(pc.resumen, { total: 5, aImportar: 3, aplazadas: 1, duplicadas: 1, conError: 1, doctoresNuevos: ['FELIX RIOS'], pacientesNuevos: 2 });
  const rc = await enviar('x.csv', cx, 'cirugias', true);
  assert.equal(rc.importadas, 2);
  assert.equal(rc.aplazadasImportadas, 1);
  const maria = db.agenda_cirugias.find((c) => c.nombre_paciente === 'MARIA LOURDES RUIZ')!;
  assert.equal(maria.doctor_id, 'd-bay');
  assert.equal(maria.ojo, 'OI');
  assert.ok(maria.paciente_id);
  assert.equal(db.agenda_cirugias.find((c) => c.estado === 'aplazada')!.paciente_id, manuel.id, 'aplazada ligada al paciente existente');
  assert.equal(db.agenda_cirugias.find((c) => c.estado === 'cancelada')!.nombre_paciente, 'Pedro Lara Gil');
  const rc2 = await enviar('x.csv', cx, 'cirugias', true);
  assert.equal(rc2.importadas + rc2.aplazadasImportadas, 0, 'reimportar cirugías no duplica (incluye aplazadas)');
  assert.equal(db.agenda_cirugias.length, 3);
  assert.equal(db.doctores.filter((d) => d.alias === 'FELIX RIOS').length, 1);

  // ── BD sin la columna pendiente_completar (mig. 400 sin aplicar) ──
  opciones.sinColumnaPendiente = true;
  const r3 = await enviar('c2.csv', [H, '2026-09-03,09:00AM,,,Nuevo Doc,Lucia Perez Sol,F,,CONSULTA,,0'].join('\n'), 'consultas', true);
  assert.equal(r3.importadas, 1);
  assert.equal(db.doctores.find((d) => d.alias === 'NUEVO DOC')!.pendiente_completar, undefined);
  console.log('OK: todas las pruebas de importación pasaron');
}
main().catch((e) => { console.error(e); process.exit(1); });
