import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarLio, leerSegmentoLio, planificarLentes, piezaCoincideConMarca, type PiezaInventario } from '../import-lentes-puro';

test('«Isert 21.0/CT LUCIA 22.5» → primero + respaldo', () => {
  const r = interpretarLio('Isert 21.0/CT LUCIA 22.5');
  assert.deepEqual(r.lentes.map((l) => [l.orden, l.marca, l.poder]), [['PRIMERO', 'Isert', 21], ['RESPALDO', 'CT LUCIA', 22.5]]);
  assert.deepEqual(r.pendientes, []);
});

test('segundo lente solo cuando hay tres piezas', () => {
  const r = interpretarLio('A 20/B 21/C 22');
  assert.deepEqual(r.lentes.map((l) => l.orden), ['PRIMERO', 'SEGUNDO', 'RESPALDO']);
});

test('poder sin marca: se lee el poder y queda pendiente la marca', () => {
  const r = interpretarLio('22.5');
  assert.equal(r.lentes[0].poder, 22.5);
  assert.equal(r.lentes[0].marca, '');
  assert.ok(r.pendientes.some((p) => /marca/.test(p)));
});

test('«CITAR CALCULO» no genera lentes y queda pendiente', () => {
  const r = interpretarLio('CITAR CALCULO');
  assert.equal(r.lentes.length, 0);
  assert.deepEqual(r.pendientes, ['cálculo del lente pendiente']);
});

test('horarios en la celda LIO no son lentes', () => {
  for (const t of ['Lunes 28 4 pm', 'Miercoles 30 5', ' Miercoles 30 4:30']) {
    const r = interpretarLio(t);
    assert.equal(r.lentes.length, 0);
    assert.equal(r.textoNoLente, t.trim());
  }
});

test('tóricos: T0–T9, cyl y «x»', () => {
  assert.deepEqual(leerSegmentoLio('24.00 T2'), { marca: '', modelo: 'T2', poder: 24, torico: true, cilindro: null });
  assert.deepEqual(leerSegmentoLio('24.5 CYL 1.25'), { marca: '', modelo: null, poder: 24.5, torico: true, cilindro: 1.25 });
  const mx = leerSegmentoLio('MX60 22.5 X 1.50-1.25')!;
  assert.deepEqual([mx.marca, mx.poder, mx.torico, mx.cilindro], ['MX60', 22.5, true, 1.5]);
  const tor = leerSegmentoLio('TorZCU 25.50 2.25 cyl')!;
  assert.deepEqual([tor.marca, tor.poder, tor.cilindro], ['TorZCU', 25.5, 2.25]);
  const cl = leerSegmentoLio('CLAREON TORICO 17.5')!;
  assert.deepEqual([cl.marca, cl.poder, cl.torico, cl.cilindro], ['Clareon', 17.5, true, null]);
});

test('poder fuera de rango (MA60MA +2.0) no se toma como lente', () => {
  const r = interpretarLio('MA60MA +2.0');
  assert.equal(r.lentes[0].poder, null);
  assert.ok(r.pendientes.some((p) => /poder/.test(p)));
});

test('«pago lente» en MARCA → compra directa', () => {
  const r = interpretarLio('Clareon tórico Calcular', 'pago lente');
  assert.equal(r.compraDirecta, true);
  const { plan } = planificarLentes(r, [], new Map(), true);
  assert.deepEqual(plan.map((p) => [p.modo, p.fabricante, p.poder_d, p.torico]), [['COMPRA_DIRECTA', 'Clareon', null, true]]);
});

test('«CITAR requiere tórico» sin cilindro queda pendiente', () => {
  const r = interpretarLio('Isert 26.5/CT LUCIA 27.5', 'CITAR requiere tórico');
  assert.ok(r.pendientes.some((p) => /tórico/.test(p)));
});

const piezas: PiezaInventario[] = [
  { id: 'a', marca: 'Hoya', modelo: 'iSert 251', potencia: 21, stock: 1 },
  { id: 'b', marca: 'Teleon', modelo: 'CT LUCIA 611P', potencia: 22.5, stock: 0 },
];

test('piezaCoincideConMarca compara por palabras (sin acentos ni espacios)', () => {
  assert.equal(piezaCoincideConMarca(piezas[0], 'Isert'), true);
  assert.equal(piezaCoincideConMarca(piezas[1], 'CT Lucía'), true);
  assert.equal(piezaCoincideConMarca(piezas[0], 'Clareon'), false);
});

test('con stock libre → ASIGNAR; sin stock → SOLICITAR; no se reparte la misma pieza dos veces', () => {
  const libres = new Map([['a', 1], ['b', 0]]);
  const r1 = planificarLentes(interpretarLio('Isert 21.0/CT LUCIA 22.5'), piezas, libres, true);
  assert.deepEqual(r1.plan.map((p) => [p.orden, p.modo, p.inventario_item_id]), [['PRIMERO', 'ASIGNAR', 'a'], ['RESPALDO', 'SOLICITAR', null]]);
  const r2 = planificarLentes(interpretarLio('Isert 21.0'), piezas, libres, true);
  assert.equal(r2.plan[0].modo, 'SOLICITAR');
});

test('sin fecha (reservar=false) todo va a SOLICITAR', () => {
  const r = planificarLentes(interpretarLio('Isert 21.0'), piezas, new Map([['a', 1]]), false);
  assert.equal(r.plan[0].modo, 'SOLICITAR');
});

test('sin poder o sin marca no se guarda el lente', () => {
  const r = planificarLentes(interpretarLio('22.5'), piezas, new Map(), true);
  assert.equal(r.plan.length, 0);
  assert.equal(r.sinGuardar.length, 1);
});
