// Prueba de integración: plan de resurtimiento → recibir lente → asignación
// automática al paciente + notificación a quien lo pidió y a quien lo recibió.
// BD en memoria (no toca Supabase). Ejecutar: npm run test:lentes
import assert from 'node:assert/strict';
import { db, opciones } from './fake-admin';
import { sesion } from './fake-server';
import { registro } from './stubs';
import { guardarPlanLentes } from '@/lib/cirugia-lentes';
import { GET, PATCH } from '@/app/api/inventario/plan-resurtimiento/route';

const U_CREA = '11111111-1111-4111-8111-111111111111';   // coordinadora que agenda la cirugía y pide el lente
const U_SOLICITA = '22222222-2222-4222-8222-222222222222'; // recepción que lo pide al proveedor
const U_RECIBE = '33333333-3333-4333-8333-333333333333';   // almacén que lo recibe

let ok = 0;
const caso = async (nombre: string, fn: () => Promise<void>) => {
  reiniciar();
  try { await fn(); ok++; console.log(`  ✔ ${nombre}`); }
  catch (e) { console.error(`  ✘ ${nombre}\n`, e); process.exitCode = 1; }
};

function reiniciar() {
  for (const k of Object.keys(db)) delete db[k];
  registro.push.length = 0;
  opciones.sinColumnaCreadoPor = false;
  db.usuarios = [
    { id: U_CREA, nombre: 'Ana Coordinación', rol: 'recepcionista', activo: true },
    { id: U_SOLICITA, nombre: 'Beto Recepción', rol: 'recepcionista', activo: true },
    { id: U_RECIBE, nombre: 'Carla Almacén', rol: 'admin', activo: true },
  ];
  db.notificacion_preferencias = [];
  db.inventario_items = [];
  db.agenda_cirugias = [
    { id: 'cx-1', nombre_paciente: 'María López Ruiz', expediente: '776', fecha: '2026-11-03', hora: '08:30:00', ojo: 'OD', estado: 'programada', created_by: U_CREA },
    { id: 'cx-2', nombre_paciente: 'José Pérez Soto', expediente: '901', fecha: '2026-11-01', hora: '07:00:00', ojo: 'OI', estado: 'programada', created_by: U_CREA },
  ];
}

const como = (id: string, rol: 'admin' | 'recepcionista' | 'doctor' = 'admin') => { sesion.id = id; sesion.rol = rol; };
const pedir = async (body: unknown) => {
  const res = await PATCH(new Request('http://x/api/inventario/plan-resurtimiento', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
};
const plan = async () => (await (await GET()).json()) as any[];
const solicitarLente = (cx: string, usuarioId: string | null, extra: Record<string, unknown> = {}) =>
  guardarPlanLentes(cx, [{ orden: 'PRIMERO', modo: 'SOLICITAR', torico: false, marca: true, fabricante: 'Alcon', modelo: 'Clareon CNA0T0', poder_d: 21.5, ...extra } as any], { usuarioId });
const lenteDe = (cx: string) => db.cirugia_lentes.find((l) => l.cirugia_id === cx && l.orden === 'PRIMERO')!;
const notifs = () => db.notificaciones ?? [];

async function main() {
  console.log('Plan de resurtimiento → recepción → asignación + notificación');

  await caso('Flujo completo: pedir → solicitar → recibir asigna al paciente y avisa a los 3', async () => {
    // 1) La coordinadora agenda la cirugía y pide el lente.
    const g = await solicitarLente('cx-1', U_CREA);
    assert.equal(g.ok, true);
    assert.equal(lenteDe('cx-1').creado_por, U_CREA, 'se guarda quién pidió el lente');
    assert.equal(lenteDe('cx-1').estado_logistica, 'POR_SOLICITAR');

    // 2) Aparece en el plan con el paciente.
    como(U_SOLICITA, 'recepcionista');
    let p = await plan();
    assert.equal(p.length, 1);
    assert.equal(p[0].paciente, 'María López Ruiz');
    assert.equal(p[0].estado_logistica, 'POR_SOLICITAR');

    // 3) Recepción lo marca como solicitado al proveedor.
    const s = await pedir({ accion: 'SOLICITAR', ids: [lenteDe('cx-1').id] });
    assert.equal(s.status, 200); assert.equal(s.json.actualizados, 1);
    assert.equal(lenteDe('cx-1').solicitado_por, U_SOLICITA);
    assert.equal(notifs().length, 0, 'marcar solicitado no notifica');

    // 4) Almacén lo recibe.
    como(U_RECIBE, 'admin');
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id, lote: 'L-889', serial_number: 'SN-12345', expiration_date: '2029-05-01' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.paciente, 'María López Ruiz');
    assert.equal(r.json.notificados, 3);

    // Asignación automática.
    const l = lenteDe('cx-1');
    assert.equal(l.estado_logistica, 'LISTO');
    assert.equal(l.estado, 'RESERVADO', 'queda comprometido a la cirugía');
    assert.equal(l.recibido_por, U_RECIBE);
    assert.ok(l.inventario_item_id);
    const item = db.inventario_items.find((i) => i.id === l.inventario_item_id)!;
    assert.equal(item.model, 'Clareon CNA0T0'); assert.equal(item.sphere, 21.5); assert.equal(item.stock, 1);
    assert.equal(item.serial_number, 'SN-12345');
    const mov = db.inventario_movimientos.filter((m) => m.inventario_item_id === item.id);
    assert.equal(mov.length, 1); assert.equal(mov[0].tipo, 'ENTRADA'); assert.equal(mov[0].referencia_id, 'cx-1');

    // Notificaciones.
    const n = notifs();
    assert.deepEqual(n.map((x) => x.user_id).sort(), [U_CREA, U_SOLICITA, U_RECIBE].sort());
    for (const x of n) {
      assert.equal(x.titulo, 'Lente recibido y asignado — María López Ruiz');
      assert.match(x.mensaje, /Alcon Clareon CNA0T0 21\.5D \(primer lente\) quedó asignado a la cirugía de María López Ruiz · 03\/11\/2026 08:30\. Recibió: Carla Almacén\./);
      assert.equal(x.entidad_tipo, 'agenda_cirugia'); assert.equal(x.entidad_id, 'cx-1');
    }
    assert.equal(registro.push.length, 3, 'push a los 3');
    assert.ok(registro.push.every((x) => x.url === '/cirugias/cx-1'), 'el aviso abre la cirugía');

    // Sale del plan.
    assert.equal((await plan()).length, 0);
  });

  await caso('Tórico: el aviso incluye el cilindro y el ítem se crea con cilindro', async () => {
    await solicitarLente('cx-1', U_CREA, { torico: true, modelo: 'Clareon Toric CNW0T4', cilindro: 2.25 });
    como(U_RECIBE);
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.equal(r.status, 200);
    assert.match(notifs()[0].mensaje, /21\.5D cil\. 2\.25/);
    assert.equal(db.inventario_items[0].cylinder, 2.25);
  });

  await caso('Si el mismo lente ya existe en inventario, suma stock y asigna esa pieza', async () => {
    db.inventario_items.push({ id: 'it-existente', folio: 'LEN-26-00001', manufacturer: 'Alcon', model: 'Clareon CNA0T0', sphere: 21.5, cylinder: null, stock: 2 });
    await solicitarLente('cx-1', U_CREA);
    como(U_RECIBE);
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.equal(r.status, 200);
    assert.equal(lenteDe('cx-1').inventario_item_id, 'it-existente');
    assert.equal(db.inventario_items.length, 1, 'no duplica el ítem');
    assert.equal(db.inventario_items[0].stock, 3);
  });

  await caso('Cada lente se asigna a SU paciente (dos cirugías con el mismo lente)', async () => {
    await solicitarLente('cx-1', U_CREA);
    await solicitarLente('cx-2', U_SOLICITA);
    como(U_RECIBE);
    const p = await plan();
    assert.deepEqual(p.map((f) => f.paciente), ['José Pérez Soto', 'María López Ruiz'], 'prioriza la cirugía más próxima');
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-2').id });
    assert.equal(r.json.paciente, 'José Pérez Soto');
    assert.equal(lenteDe('cx-2').estado_logistica, 'LISTO');
    assert.equal(lenteDe('cx-1').estado_logistica, 'POR_SOLICITAR', 'el otro paciente sigue pendiente');
    assert.ok(!lenteDe('cx-1').inventario_item_id);
    assert.ok(notifs().every((x) => x.entidad_id === 'cx-2' && /José Pérez Soto/.test(x.titulo)));
    assert.deepEqual(notifs().map((x) => x.user_id).sort(), [U_SOLICITA, U_RECIBE].sort(), 'avisa a quien pidió ese lente, no a todos');
  });

  await caso('Misma persona pide y recibe: un solo aviso (sin duplicados)', async () => {
    await solicitarLente('cx-1', U_RECIBE);
    como(U_RECIBE);
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.equal(r.json.notificados, 1);
    assert.equal(notifs().length, 1);
  });

  await caso('BD sin columna creado_por: guardar no falla y avisa a quien creó la cirugía', async () => {
    opciones.sinColumnaCreadoPor = true;
    const g = await solicitarLente('cx-1', U_SOLICITA);
    assert.equal(g.ok, true, 'guardar el plan no se rompe');
    como(U_RECIBE);
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(notifs().map((x) => x.user_id).sort(), [U_CREA, U_RECIBE].sort());
  });

  await caso('Lente antiguo sin creado_por (antes del cambio): avisa a quien creó la cirugía', async () => {
    await solicitarLente('cx-1', null);
    como(U_RECIBE);
    await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.ok(notifs().some((x) => x.user_id === U_CREA));
  });

  await caso('Doble clic / dos usuarios: el segundo «Recibir» se rechaza y no re-notifica', async () => {
    await solicitarLente('cx-1', U_CREA);
    como(U_RECIBE);
    const id = lenteDe('cx-1').id;
    const [a, b] = await Promise.all([pedir({ accion: 'RECIBIR', id }), pedir({ accion: 'RECIBIR', id })]);
    const estados = [a.status, b.status].sort();
    assert.equal(estados[0], 200);
    assert.equal(estados[1], 409);
    const c = await pedir({ accion: 'RECIBIR', id });
    assert.equal(c.status, 409);
    assert.equal(notifs().length, 2, 'solo una ronda de avisos (creador + receptor)');
  });

  await caso('Preferencias: con campanita apagada no se avisa; con push apagado solo campanita', async () => {
    db.notificacion_preferencias.push(
      { user_id: U_CREA, tipo_evento: 'LENTE_RECIBIDO', canal: 'IN_APP', activo: false },
      { user_id: U_SOLICITA, tipo_evento: 'LENTE_RECIBIDO', canal: 'PUSH', activo: false },
    );
    await solicitarLente('cx-1', U_CREA);
    como(U_SOLICITA, 'recepcionista');
    await pedir({ accion: 'SOLICITAR', ids: [lenteDe('cx-1').id] });
    como(U_RECIBE);
    await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.deepEqual(notifs().map((x) => x.user_id).sort(), [U_SOLICITA, U_RECIBE].sort());
    assert.deepEqual(registro.push.map((x) => x.userId), [U_RECIBE]);
  });

  await caso('Permisos: un doctor no puede recibir lentes', async () => {
    await solicitarLente('cx-1', U_CREA);
    como(U_CREA, 'doctor');
    const r = await pedir({ accion: 'RECIBIR', id: lenteDe('cx-1').id });
    assert.equal(r.status, 403);
    assert.equal(lenteDe('cx-1').estado_logistica, 'POR_SOLICITAR');
    assert.equal(notifs().length, 0);
  });

  await caso('Cirugía cancelada: el lente no aparece en el plan', async () => {
    await solicitarLente('cx-1', U_CREA);
    db.agenda_cirugias[0].estado = 'cancelada';
    assert.equal((await plan()).length, 0);
  });

  console.log(`\n${ok} caso(s) correcto(s)${process.exitCode ? ' — HAY FALLAS' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
