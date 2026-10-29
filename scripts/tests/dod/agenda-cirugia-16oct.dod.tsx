// Pruebas DoD del documento «AGENDA DE CIRUGÍA» (16 oct 2026) con BD en memoria (sin Supabase).
// Ejecutar: npx tsx --conditions=react-server --tsconfig scripts/tests/dod/tsconfig.json scripts/tests/dod/agenda-cirugia-16oct.dod.tsx
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Los componentes de src se transforman con JSX clásico (tsconfig raíz «preserve»).
(globalThis as any).React = React;
import { db } from './fake-admin';
import { sesion } from './fake-server';
import { registro } from './stubs';
import { POST as importar } from '@/app/api/agenda/import/route';
import { PATCH as patchAgenda } from '@/app/api/agenda/[id]/route';
import { PUT as putEquipo } from '@/app/api/cirugias/[id]/equipo/route';
import { PUT as putLentesPlan } from '@/app/api/cirugias/[id]/lentes-plan/route';
import { GET as getPaciente, PATCH as patchPaciente } from '@/app/api/pacientes/[id]/route';
import { POST as postCatalogoQx } from '@/app/api/configuracion/catalogo-quirurgico/route';
import { POST as postModeloLio } from '@/app/api/catalogos/modelos-lio/route';
import { guardarPlanLentes } from '@/lib/cirugia-lentes';
import { describirEventoCirugia } from '@/lib/historial-cirugia';
import LenteLogistica, { lenteVacio, validarLente } from '@/components/cirugia/LenteLogistica';
import SelectorModeloLio from '@/components/cirugia/SelectorModeloLio';
import EditorDatosPaciente, { faltantesDatosGenerales } from '@/components/pacientes/EditorDatosPaciente';
import CompletarCirugiaLentes from '@/components/agenda/CompletarCirugiaLentes';
import { hoyTijuana } from '@/lib/ficha-paciente';
import { sumarDias } from '@/lib/bandeja-agenda';
import { accionesDisponibles } from '@/lib/agenda-acciones';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const json = (metodo: string, body: unknown) =>
  new Request('http://x/api', { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const resultados: Array<{ punto: string; prueba: string; ok: boolean; error?: string }> = [];
async function prueba(punto: string, nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); resultados.push({ punto, prueba: nombre, ok: true }); }
  catch (e) { resultados.push({ punto, prueba: nombre, ok: false, error: e instanceof Error ? e.message : String(e) }); }
}
const espera = () => new Promise((r) => setTimeout(r, 30));

async function importarCx(csv: string, confirmar: boolean, completar: boolean) {
  const fd = new FormData();
  fd.append('file', new File([csv], 'CIRUGIAS.csv', { type: 'text/csv' }));
  fd.append('tipo', 'cirugias');
  if (confirmar) fd.append('confirmar', 'true');
  if (completar) fd.append('completar_existentes', 'true');
  const res = await importar(new Request('http://x/api/agenda/import', { method: 'POST', body: fd }));
  const j: any = await res.json();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  // ───────────── 1. Re-subir el Excel completa lo que faltó ─────────────
  const P_CARLOS = U(1), P_OTRO = U(2), CX1 = U(10);
  db.doctores = [{ id: U(50), alias: 'DR BAYARDO GARZA', activo: true }];
  db.pacientes = [
    { id: P_CARLOS, nombre_completo: 'Carlos Gómez Jiménez', telefono: null, sexo: null, fecha_nacimiento: null, edad: null, numero_expediente: null, created_at: '2024-01-01' },
    { id: P_OTRO, nombre_completo: 'Otro Paciente Uno', telefono: '6640000000', sexo: 'FEMENINO', numero_expediente: '900', created_at: '2024-01-01' },
  ];
  db.aseguranzas = [];
  db.agenda_cirugias = [{
    id: CX1, paciente_id: P_CARLOS, nombre_paciente: 'Carlos Gómez Jiménez', fecha: '2026-11-02', hora: null, procedimiento: 'FACO + LIO', ojo: 'OD',
    anestesia: null, diagnostico: null, procedencia: 'TIJUANA', expediente: null, tiempo_estimado: null, tiempo_estancia: null, lio: null, marca_lio: null,
    doctor_id: null, estado: 'agendada',
  }];
  db.cirugia_lentes = [];
  const HC = 'FECHA,NOMBRE PX,No. Exp,HORA CX,PROCEDENCIA,FECHA NAC.,SEXO,EDAD,DIAGNOSTICO,CIRUGÍA,OJO,LIO,MARCA,TIEMPO CX,CIRUJANO,ANESTESIA,NOTAS';
  const csv = [HC,
    '2026-11-02,Carlos Gomez Jimenez,1234,08:00,ENSENADA,1960-05-01,M,66,CATARATA OD,FACO + LIO,OD,23.00 CLAREON,,30 MIN,BAYARDO,LOCAL CON SEDACION,',
    '2026-11-03,Rosa Mena Paz,555,09:00,ROSARITO,1970-01-01,F,56,PTERIGION,PTERIGION,OI,,,,BAYARDO,LOCAL,',
    '2026-11-03,Luis Soto Rey,900,10:00,TECATE,1980-01-01,M,46,PTERIGION,PTERIGION,OD,,,,BAYARDO,LOCAL,',
  ].join('\n');

  let pv: any;
  await prueba('1. Re-importar', 'Vista previa detecta la cirugía existente a completar y no escribe', async () => {
    pv = await importarCx(csv, false, true);
    assert.equal(pv.resumen.completables, 1);
    assert.equal(pv.resumen.aImportar, 2);
    assert.equal(db.agenda_cirugias.length, 1, 'la vista previa no escribe');
    assert.ok(pv.avisos.some((a: string) => /datos generales vacíos/.test(a)), 'avisa que se completarán pacientes');
  });
  let r1: any;
  await prueba('1. Re-importar', 'Confirmar completa SOLO los campos vacíos de la cirugía existente', async () => {
    r1 = await importarCx(csv, true, true);
    const cx = db.agenda_cirugias.find((c) => c.id === CX1)!;
    assert.equal(r1.completadas, 1);
    assert.equal(String(cx.hora).slice(0, 5), '08:00');
    assert.equal(cx.anestesia, 'LOCAL_SEDACION');
    assert.equal(cx.diagnostico, 'CATARATA OD');
    assert.equal(cx.expediente, '1234');
    assert.equal(cx.tiempo_estimado, '30 MIN');
    assert.equal(cx.doctor_id, U(50), 'cirujano existente');
    assert.equal(cx.procedencia, 'TIJUANA', 'no sobrescribe lo capturado');
  });
  await prueba('1. Re-importar', 'Guarda el lente de la cirugía existente (no tenía)', () => {
    const l = db.cirugia_lentes.filter((x) => x.cirugia_id === CX1);
    assert.equal(l.length, 1);
    assert.equal(l[0].modo, 'SOLICITAR', 'sin inventario → solicitar');
    assert.equal(l[0].poder_d, 23);
  });
  await prueba('1. Re-importar', 'Completa los datos generales vacíos del paciente existente', () => {
    const p = db.pacientes.find((x) => x.id === P_CARLOS)!;
    assert.equal(p.sexo, 'MASCULINO');
    assert.equal(p.fecha_nacimiento, '1960-05-01');
    assert.equal(p.edad, 66);
    assert.equal(p.numero_expediente, '1234');
  });
  await prueba('1. Re-importar', 'Pacientes nuevos se crean con expediente (si no está repetido) y la procedencia se guarda en agendadas', () => {
    const rosa = db.pacientes.find((p) => p.nombre_completo === 'Rosa Mena Paz')!;
    assert.equal(rosa.numero_expediente, '555');
    const luis = db.pacientes.find((p) => p.nombre_completo === 'Luis Soto Rey')!;
    assert.equal(luis.numero_expediente, undefined, 'el 900 ya es de otro paciente: no se duplica');
    assert.equal(db.agenda_cirugias.find((c) => c.nombre_paciente === 'Rosa Mena Paz')!.procedencia, 'ROSARITO');
    assert.equal(db.agenda_cirugias.length, 3, 'no duplica la cirugía existente');
  });
  await prueba('1. Re-importar', 'Volver a subirlo otra vez no cambia nada (idempotente)', async () => {
    const antes = JSON.stringify(db.agenda_cirugias);
    const r2 = await importarCx(csv, true, true);
    assert.equal(r2.importadas, 0);
    assert.equal(r2.completadas, 0);
    assert.equal(db.cirugia_lentes.filter((x) => x.cirugia_id === CX1).length, 1, 'no duplica el lente');
    assert.equal(JSON.stringify(db.agenda_cirugias.map(({ updated_at: _u, ...r }) => r)), JSON.stringify(JSON.parse(antes).map(({ updated_at: _u, ...r }: any) => r)));
  });

  // ───────────── 2. Editar una cirugía completada ─────────────
  const CXC = U(20), CXA = U(21), CXX = U(22);
  db.agenda_cirugias.push(
    { id: CXC, paciente_id: P_CARLOS, nombre_paciente: 'Carlos', fecha: '2026-10-01', hora: '08:00:00', duracion_min: 60, diagnostico: 'Catarata', notas: 'n', estado: 'completada', origen_id: null, servicio_id: null },
    { id: CXA, paciente_id: P_CARLOS, nombre_paciente: 'Carlos', fecha: '2026-11-20', hora: '08:00:00', duracion_min: 60, estado: 'agendada', inventario_item_id: null },
    { id: CXX, paciente_id: P_CARLOS, nombre_paciente: 'Carlos', fecha: '2026-11-21', hora: '08:00:00', duracion_min: 60, estado: 'cancelada' },
  );
  db.cirugia_historial = [];
  await prueba('2. Editar completada', 'Recepción corrige una completada (aunque haya empalme) y queda en historial solo lo que cambió', async () => {
    sesion.rol = 'recepcionista';
    registro.conflictos = [{ entidad_id: U(99), tipo: 'cirugia' }];
    const res = await patchAgenda(json('PATCH', { fecha: '2026-10-01', hora: '08:00', duracion_min: 60, diagnostico: 'Catarata senil', notas: 'n' }), params(CXC));
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(db.agenda_cirugias.find((c) => c.id === CXC)!.diagnostico, 'Catarata senil');
    const h = db.cirugia_historial.filter((x) => x.cirugia_id === CXC && x.accion === 'CIRUGIA_CORREGIDA');
    assert.equal(h.length, 1);
    assert.deepEqual(h[0].detalle.campos, ['diagnostico']);
    assert.deepEqual(describirEventoCirugia('CIRUGIA_CORREGIDA', h[0].detalle).lineas, ['Campos: diagnóstico']);
  });
  await prueba('2. Editar completada', 'Enfermería NO puede corregir una completada (409)', async () => {
    sesion.rol = 'enfermero';
    const res = await patchAgenda(json('PATCH', { diagnostico: 'x' }), params(CXC));
    assert.equal(res.status, 409);
  });
  await prueba('2. Editar completada', 'Sigue bloqueado el empalme al mover una cirugía agendada', async () => {
    sesion.rol = 'admin';
    const res = await patchAgenda(json('PATCH', { hora: '09:00' }), params(CXA));
    assert.equal(res.status, 409);
  });
  db.cat_roles_participante = [{ id: U(60), clave: 'cirujano' }];
  db.doctores.push({ id: U(51), alias: 'DRA IRINA', tipo_personal: 'MEDICO', activo: true });
  db.doctores[0].tipo_personal = 'MEDICO';
  db.cirugia_participantes = [{ id: U(70), cirugia_id: CXC, medico_id: U(50), rol_id: U(60) }];
  db.cirugia_productividad = [];
  db.cirugia_personal = [];
  db.eventos_honorario = [
    { id: U(80), origen_tipo: 'OPERACION', origen_id: CXC, doctor_id: U(50), estado: 'PENDIENTE' },
    { id: U(81), origen_tipo: 'OPERACION', origen_id: CXC, doctor_id: U(52), estado: 'PAGADO' },
  ];
  await prueba('2. Editar completada', 'Cambiar el cirujano de una completada ajusta honorarios (retira no pagados, genera los nuevos)', async () => {
    sesion.rol = 'recepcionista';
    registro.devengos = [];
    const res = await putEquipo(json('PUT', { participantes: [{ medico_id: U(51), rol_id: U(60), hora_inicio: '08:00', hora_fin: '09:00' }], personal: [] }), { params: { id: CXC } });
    assert.equal(res.status, 200, await res.clone().text());
    await espera();
    assert.equal(db.eventos_honorario.find((e) => e.id === U(80))!.estado, 'CANCELADO');
    assert.equal(db.eventos_honorario.find((e) => e.id === U(81))!.estado, 'PAGADO', 'lo pagado no se toca');
    assert.ok(registro.devengos.includes(`generar:${CXC}`));
  });
  await prueba('2. Editar completada', 'Una cancelada no acepta cambios de equipo (409)', async () => {
    const res = await putEquipo(json('PUT', { participantes: [{ medico_id: U(51), rol_id: U(60), hora_inicio: '08:00', hora_fin: '09:00' }], personal: [] }), { params: { id: CXX } });
    assert.equal(res.status, 409);
  });

  // ───────────── 3. Datos generales del paciente ─────────────
  db.agenda_cirugias.find((c) => c.id === CXA)!.expediente = null;
  await prueba('3. Datos del paciente', 'Doctor corrige nombre, expediente, sexo, nacimiento y teléfono; la agenda se actualiza', async () => {
    sesion.rol = 'doctor';
    const res = await patchPaciente(json('PATCH', {
      nombre_completo: 'Carlos Gómez Jiménez', numero_expediente: 'EXP-77', sexo: 'H', fecha_nacimiento: '1960-05-02', telefono: '6641112233',
      telefonos: [{ numero: '6641112233', etiqueta: 'Celular', principal: true }],
    }), params(P_CARLOS));
    assert.equal(res.status, 200, await res.clone().text());
    const p = db.pacientes.find((x) => x.id === P_CARLOS)!;
    assert.equal(p.numero_expediente, 'EXP-77');
    assert.equal(p.fecha_nacimiento, '1960-05-02');
    const cx = db.agenda_cirugias.filter((c) => c.paciente_id === P_CARLOS);
    assert.ok(cx.length >= 3 && cx.every((c) => c.expediente === 'EXP-77' && c.nombre_paciente === 'Carlos Gómez Jiménez'));
  });
  await prueba('3. Datos del paciente', 'Expediente repetido se rechaza con mensaje claro (409)', async () => {
    sesion.rol = 'recepcionista';
    const res = await patchPaciente(json('PATCH', { numero_expediente: '900' }), params(P_CARLOS));
    assert.equal(res.status, 409);
  });
  await prueba('3. Datos del paciente', 'Enfermería no edita datos generales (403)', async () => {
    sesion.rol = 'enfermero';
    const res = await patchPaciente(json('PATCH', { sexo: 'M' }), params(P_CARLOS));
    assert.equal(res.status, 403);
  });
  await prueba('3. Datos del paciente', 'Aviso de datos faltantes', () => {
    assert.deepEqual(faltantesDatosGenerales({ sexo: null, fecha_nacimiento: null, edad: null, telefono: null, telefonos: [], numero_expediente: null }),
      ['expediente', 'sexo', 'fecha de nacimiento', 'teléfono']);
    assert.deepEqual(faltantesDatosGenerales({ sexo: 'H', fecha_nacimiento: '1960-01-01', edad: null, telefono: '1', telefonos: [], numero_expediente: '1' }), []);
  });
  await prueba('3. Datos del paciente', 'El editor muestra los 5 datos generales', () => {
    const html = renderToStaticMarkup(<EditorDatosPaciente paciente={{ id: P_CARLOS, nombre: 'Carlos', nombre_completo: 'Carlos', edad: null, sexo: 'H', aseguradora: null, aseguranza_id: null, telefono: '664', email: null, direccion: null, numero_expediente: '1', fecha_nacimiento: '1960-01-01' }}
      inputCls="" labelCls="" onCancelar={() => {}} onGuardado={() => {}} />);
    for (const t of ['Nombre completo', 'Número de expediente', 'Sexo', 'Fecha de nacimiento', 'Teléfonos']) assert.ok(html.includes(t), t);
  });

  // ───────────── 4. Catálogo de cirugías ─────────────
  db.catalogo_quirurgico = [
    { id: U(90), nombre: 'Facoemulsificación del cristalino + LIO monofocal tórico', ojo: null, activo: false, precio: 1000 },
  ];
  await prueba('4. Catálogo', 'Recepción agrega una cirugía nueva desde el formulario (sin poder fijar precio)', async () => {
    sesion.rol = 'recepcionista';
    const res = await postCatalogoQx(json('POST', { nombre: 'Vitrectomía   posterior', precio: 9999 }));
    assert.equal(res.status, 201, await res.clone().text());
    const c = db.catalogo_quirurgico.find((x) => x.nombre === 'Vitrectomía posterior')!;
    assert.ok(c, 'espacios normalizados');
    assert.equal(c.precio, undefined, 'el precio lo captura admin');
  });
  await prueba('4. Catálogo', 'Si ya existe (aunque esté inactiva) se reutiliza y reactiva', async () => {
    const res = await postCatalogoQx(json('POST', { nombre: 'facoemulsificación del cristalino + lio monofocal tórico' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, U(90));
    assert.equal(db.catalogo_quirurgico.find((x) => x.id === U(90))!.activo, true);
    assert.equal(db.catalogo_quirurgico.length, 2);
  });
  await prueba('4. Catálogo', 'Enfermería no agrega cirugías (403)', async () => {
    sesion.rol = 'enfermero';
    assert.equal((await postCatalogoQx(json('POST', { nombre: 'X' }))).status, 403);
  });

  // ───────────── 5. LIO ─────────────
  db.cat_modelos_lio = [];
  await prueba('5. LIO', 'Agregar marca/modelo nuevo (ISERT de Hoya) desde la cirugía', async () => {
    sesion.rol = 'recepcionista';
    const res = await postModeloLio(json('POST', { fabricante: 'HOYA SURGICAL OPTICS', modelo: 'iSert 251', diseno: 'MONOFOCAL', torico: false }));
    assert.equal(res.status, 201, await res.clone().text());
    const m = await res.json();
    assert.equal(m.fabricante, 'Hoya', 'marca unificada');
    assert.equal(m.verificado, false);
    assert.equal(m.activo, true);
  });
  await prueba('5. LIO', 'Repetirlo devuelve el mismo modelo (no duplica)', async () => {
    const res = await postModeloLio(json('POST', { fabricante: 'Hoya', modelo: 'ISERT 251', diseno: 'MONOFOCAL', torico: false }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).existente, true);
    assert.equal(db.cat_modelos_lio.length, 1);
  });
  await prueba('5. LIO', 'Agregar enVista (Bausch + Lomb) tórico', async () => {
    const res = await postModeloLio(json('POST', { fabricante: 'B+L', modelo: 'enVista Toric MX60ET', diseno: 'MONOFOCAL', torico: true }));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).fabricante, 'Bausch + Lomb');
  });
  await prueba('5. LIO', 'Enfermería no agrega modelos (403)', async () => {
    sesion.rol = 'enfermero';
    assert.equal((await postModeloLio(json('POST', { fabricante: 'Zeiss', modelo: 'X', diseno: 'MONOFOCAL', torico: false }))).status, 403);
  });
  await prueba('5. LIO', 'Sin Asignar/Solicitar/Compra directa: el lente solo se registra (no inventario, no pedido)', async () => {
    db.cirugia_lentes = [];
    const r = await guardarPlanLentes(CXA, [{ orden: 'PRIMERO', modo: 'SIN_TRAMITE', torico: false, marca: false, fabricante: 'Hoya', modelo: 'iSert 251', poder_d: 21, cilindro: null, inventario_item_id: null }]);
    assert.deepEqual(r, { ok: true });
    const l = db.cirugia_lentes[0];
    assert.equal(l.modo, 'SIN_TRAMITE');
    assert.equal(l.origen, 'HOSPITAL');
    assert.equal(l.estado_logistica, 'LISTO');
    assert.equal(l.inventario_item_id, null);
  });
  await prueba('5. LIO', 'La API de edición acepta el plan «solo registro»', async () => {
    sesion.rol = 'recepcionista';
    const res = await putLentesPlan(json('PUT', { plan: [{ orden: 'PRIMERO', modo: 'SIN_TRAMITE', torico: true, marca: false, fabricante: 'Zeiss', modelo: 'AT TORBI', poder_d: null, cilindro: null, inventario_item_id: null }] }), params(CXA));
    assert.equal(res.status, 200, await res.clone().text());
  });
  await prueba('5. LIO', 'Validación del formulario: modo opcional, potencia opcional en «solo registro»', () => {
    const modelos = [{ id: 'm1', fabricante: 'Hoya', modelo: 'iSert 251', diseno: 'MONOFOCAL', torico: false, verificado: false, origen: 'MANUAL', notas: null, activo: true }] as any;
    const l = lenteVacio('PRIMERO');
    assert.equal(l.modo, 'SIN_TRAMITE', 'por defecto no obliga a elegir');
    assert.equal(validarLente({ ...l, fabricante: 'Hoya', modeloId: 'm1' }, modelos), null);
    assert.match(validarLente({ ...l, fabricante: 'Hoya', modeloId: '' }, modelos)!, /Agregar modelo/);
    assert.match(validarLente({ ...l, modo: 'SOLICITAR', fabricante: 'Hoya', modeloId: 'm1' }, modelos)!, /potencia/);
  });
  await prueba('5. LIO', 'Pantalla: opción opcional, explicación de «Solicitar» y botón para agregar modelo', () => {
    const base = { modelos: [], lios: [], comprometidos: [], itemsEnOtrosLentes: [], inputCls: '', labelCls: '', onChange: () => {} };
    const sin = renderToStaticMarkup(<LenteLogistica {...base} lente={lenteVacio('PRIMERO')} onAgregarModelo={async () => ({} as any)} />);
    assert.ok(sin.includes('(opcional)'));
    assert.ok(sin.includes('Sin opción elegida'));
    assert.ok(sin.includes('¿No aparece la marca o el modelo? Agregarlo'));
    const sol = renderToStaticMarkup(<LenteLogistica {...base} lente={{ ...lenteVacio('PRIMERO'), modo: 'SOLICITAR' }} />);
    assert.ok(sol.includes('Plan de resurtimiento'), 'explica qué pasa con Solicitar');
    const sel = renderToStaticMarkup(<SelectorModeloLio modelos={[]} torico={false} onTorico={() => {}} fabricante="" onFabricante={() => {}} modeloId="" onModelo={() => {}} />);
    assert.ok(!sel.includes('Agregarlo'), 'sin permiso no aparece el alta');
  });

  // ───────────── 6. Hora de terminación ─────────────
  await prueba('6. Hora fin', 'Al completar se guarda el horario real aunque se empalme', async () => {
    sesion.rol = 'recepcionista';
    registro.conflictos = [{ entidad_id: U(98), tipo: 'cirugia' }];
    db.cirugia_lentes = [];
    const res = await patchAgenda(json('PATCH', {
      estado: 'completada', motivo: 'Cirugía completada', hora: '08:10', duracion_min: 45, lentes_requeridos: [],
      diagnostico_definitivo: 'Catarata', cirugia_realizada: 'Faco', complicaciones: 'Sin complicaciones',
    }), params(CXA));
    assert.equal(res.status, 200, await res.clone().text());
    const c = db.agenda_cirugias.find((x) => x.id === CXA)!;
    assert.equal(c.hora, '08:10');
    assert.equal(c.duracion_min, 45);
    assert.equal(c.estado, 'completada');
  });
  await prueba('6. Hora fin', 'El cierre pide hora real de inicio y de terminación', () => {
    const html = renderToStaticMarkup(<CompletarCirugiaLentes cirugiaId={CXA} onConfirm={async () => {}} onCancel={() => {}} />);
    assert.ok(html.includes('Hora real de inicio'));
    assert.ok(html.includes('Hora de terminación'));
    assert.ok(!html.includes('ya no se podrá modificar'));
  });

  // ───────────── 7. Historial: pestaña Cirugías ─────────────
  await prueba('7. Historial', 'El expediente del paciente trae sus cirugías con lentes', async () => {
    sesion.rol = 'recepcionista';
    db.consultas = [];
    db.cirugia_lentes = [{ id: U(95), cirugia_id: CXC, orden: 'PRIMERO', fabricante: 'Alcon', modelo: 'Clareon', poder_d: 22.5, torico: false, estado: 'USADO' }];
    const res = await getPaciente(new Request('http://x'), params(P_CARLOS));
    assert.equal(res.status, 200, await res.clone().text());
    const j = await res.json();
    assert.ok(j.cirugias.length >= 3);
    const c = j.cirugias.find((x: any) => x.id === CXC);
    assert.equal(c.lentes.length, 1);
    assert.equal(c.lentes[0].modelo, 'Clareon');
    assert.equal(c.diagnostico, 'Catarata senil');
  });

  // ───────────── 8. Excel real: historial, anestesiólogo y origen (16 oct) ─────────────
  await prueba('8. Import Excel', 'Cirugía con fecha pasada entra como completada (historial) sin pendientes ni inventario', async () => {
    sesion.rol = 'admin';
    db.agenda_cirugias = []; db.cirugia_lentes = []; db.cirugia_participantes = []; db.agenda_cirugia_doctores = [];
    db.doctores = [
      { id: U(150), alias: 'DR BAYARDO GARZA', activo: true, tipo_personal: 'MEDICO' },
      { id: U(151), alias: 'DRA CRYSTAL', nombre: 'Crystal Ruiz', activo: true, tipo_personal: 'ANESTESIOLOGO' },
    ];
    db.cat_roles_participante = [{ id: U(160), clave: 'cirujano' }, { id: U(161), clave: 'anestesiologo' }];
    const H = 'FECHA,NOMBRE PX,No. Exp,HORA CX,CIRUGÍA,OJO,LIO,CIRUJANO,ANESTESIA';
    const csv8 = [H,
      '2026-08-01,Ana Pasado Uno,7001,08:00,FACO + LIO,OD,22.5 CLAREON,BAYARDO,CRYSTAL',
      '2030-01-10,Beto Futuro Dos,7002,,FACO + LIO,OI,21.0 CLAREON,BAYARDO,CYNTAR',
    ].join('\n');
    const r = await importarCx(csv8, true, false);
    const pasada = db.agenda_cirugias.find((c) => c.nombre_paciente === 'Ana Pasado Uno')!;
    const futura = db.agenda_cirugias.find((c) => c.nombre_paciente === 'Beto Futuro Dos')!;
    assert.equal(pasada.estado, 'completada');
    assert.equal(pasada.cirugia_realizada, 'FACO + LIO');
    assert.equal(futura.estado, 'agendada');
    const lp = db.cirugia_lentes.filter((l) => l.cirugia_id === pasada.id);
    assert.equal(lp.length, 1);
    assert.equal(lp[0].modo, 'SIN_TRAMITE');
    assert.equal(lp[0].estado, 'USADO');
    assert.equal(lp[0].inventario_item_id, null);
    assert.ok(r.avisos.some((a: string) => /CYNTAR/.test(a)), 'avisa del anestesiólogo no registrado');
  });
  await prueba('8. Import Excel', 'CRYSTAL (registrado) queda como anestesiólogo y el cirujano entra al equipo', () => {
    const pasada = db.agenda_cirugias.find((c) => c.nombre_paciente === 'Ana Pasado Uno')!;
    const eq = db.cirugia_participantes.filter((p) => p.cirugia_id === pasada.id);
    assert.ok(eq.some((p) => p.medico_id === U(151) && p.rol_id === U(161)));
    assert.ok(eq.some((p) => p.medico_id === U(150) && p.rol_id === U(160)));
    const futura = db.agenda_cirugias.find((c) => c.nombre_paciente === 'Beto Futuro Dos')!;
    assert.match(String(futura.notas), /CYNTAR/);
  });
  await prueba('8. Import Excel', 'Todo lo importado lleva el origen «IMPORTACION»', () => {
    assert.ok(db.agenda_cirugias.length >= 2 && db.agenda_cirugias.every((c) => c.origen_registro === 'IMPORTACION'));
  });
  await prueba('8. Import Excel', 'Sin anestesia ya no es pendiente; sin hora sí', async () => {
    const { faltantesCirugia } = await import('@/lib/por-completar');
    const futura = db.agenda_cirugias.find((c) => c.nombre_paciente === 'Beto Futuro Dos')!;
    const f = faltantesCirugia({ ...futura, lentes: db.cirugia_lentes.filter((l) => l.cirugia_id === futura.id) as any });
    assert.ok(!f.faltan.includes('anestesia'));
    assert.ok(f.faltan.includes('hora'));
  });

  // ───────────── 9. Cirugías no realizadas (29 oct 2026) ─────────────
  await prueba('9. No realizadas', 'Import: fecha de los últimos 15 días entra agendada («Por cerrar»), no completada', async () => {
    sesion.rol = 'admin';
    db.agenda_cirugias = []; db.cirugia_lentes = []; db.cirugia_participantes = []; db.agenda_cirugia_doctores = [];
    const reciente = sumarDias(hoyTijuana(), -3);
    const csv9 = ['FECHA,NOMBRE PX,No. Exp,HORA CX,CIRUGÍA,OJO,LIO,CIRUJANO,ANESTESIA',
      `${reciente},Carla Reciente Tres,7101,08:00,FACO + LIO,OD,22.5 CLAREON,BAYARDO,`,
    ].join('\n');
    const r = await importarCx(csv9, true, false);
    const c = db.agenda_cirugias.find((x) => x.nombre_paciente === 'Carla Reciente Tres')!;
    assert.ok(c, 'se importó');
    assert.equal(c.estado, 'agendada');
    assert.equal(c.cirugia_realizada ?? null, null, 'no se da por realizada');
    assert.ok(r.avisos.some((a: string) => /Por cerrar/.test(a)), 'avisa que quedan por cerrar');
  });
  const CXN = U(910);
  const completadaPorError = () => {
    db.agenda_cirugias = [{ id: CXN, nombre_paciente: 'Don Prueba', fecha: '2026-10-13', hora: '08:00:00', estado: 'completada', doctor_id: null, origen_registro: 'IMPORTACION', inventario_item_id: null }];
    db.cirugia_lentes = [{ id: U(911), cirugia_id: CXN, orden: 'PRIMERO', origen: 'HOSPITAL', modo: 'SIN_TRAMITE', inventario_item_id: null, estado: 'USADO', requerido: true }];
    db.cirugia_historial = [];
    db.eventos_honorario = [];
    registro.devengos = [];
  };
  await prueba('9. No realizadas', 'Admin, doctor y recepción ven «Anular» en una cirugía completada; enfermería no', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' } as any, 'admin'), ['cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' } as any, 'doctor'), ['cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' } as any, 'recepcionista'), ['cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' } as any, 'enfermero'), []);
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'completada' } as any, 'admin'), []);
  });
  await prueba('9. No realizadas', 'Enfermería no puede anular una completada (403)', async () => {
    completadaPorError();
    sesion.rol = 'enfermero';
    const res = await patchAgenda(json('PATCH', { estado: 'cancelada', motivo: 'No se operó' }), params(CXN));
    assert.equal(res.status, 403);
    assert.equal(db.agenda_cirugias[0].estado, 'completada');
  });
  await prueba('9. No realizadas', 'La doctora puede anular una completada', async () => {
    completadaPorError();
    sesion.rol = 'doctor';
    const res = await patchAgenda(json('PATCH', { estado: 'cancelada', motivo: 'No se operó' }), params(CXN));
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(db.agenda_cirugias[0].estado, 'cancelada');
  });
  await prueba('9. No realizadas', 'Con honorarios pagados no se anula (409)', async () => {
    completadaPorError();
    db.eventos_honorario = [{ id: U(912), origen_tipo: 'OPERACION', origen_id: CXN, estado: 'PAGADO' }];
    sesion.rol = 'admin';
    const res = await patchAgenda(json('PATCH', { estado: 'cancelada', motivo: 'No se operó' }), params(CXN));
    assert.equal(res.status, 409);
    assert.equal(db.agenda_cirugias[0].estado, 'completada');
  });
  await prueba('9. No realizadas', 'Admin anula: cancelada, motivo y usuario en historial, lente liberado, honorarios retirados', async () => {
    completadaPorError();
    sesion.rol = 'admin';
    const sinMotivo = await patchAgenda(json('PATCH', { estado: 'cancelada' }), params(CXN));
    assert.equal(sinMotivo.status, 400, 'el motivo es obligatorio');
    const res = await patchAgenda(json('PATCH', { estado: 'cancelada', motivo: 'El paciente no se presentó' }), params(CXN));
    assert.equal(res.status, 200, await res.clone().text());
    await espera();
    assert.equal(db.agenda_cirugias[0].estado, 'cancelada');
    const h = db.cirugia_historial.find((x) => x.accion === 'ESTADO_CAMBIADO')!;
    assert.equal(h.detalle.a, 'cancelada');
    assert.equal(h.detalle.motivo, 'El paciente no se presentó');
    assert.equal(h.detalle.anulacion, true);
    assert.ok(h.usuario_id, 'queda quién lo anuló');
    const l = db.cirugia_lentes[0];
    assert.equal(l.estado, 'LIBERADO');
    assert.equal(l.motivo_liberacion, 'CIRUGIA_ANULADA');
    assert.equal(l.requerido, false);
    assert.ok(registro.devengos.includes(`cancelar:${CXN}`), 'retira honorarios no pagados');
  });

  // ───────────── Reporte ─────────────
  const fallas = resultados.filter((r) => !r.ok);
  for (const r of resultados) console.log(`${r.ok ? 'PASA' : 'FALLA'} | ${r.punto} | ${r.prueba}${r.error ? ` → ${r.error}` : ''}`);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} pruebas DoD pasaron`);
  if (fallas.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
