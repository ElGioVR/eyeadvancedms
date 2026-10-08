import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disponiblesParaReservar, ORDENES_LENTE } from '../cirugia-lentes-puro';

test('disponiblesParaReservar: stock menos reservas activas, nunca negativo', () => {
  assert.equal(disponiblesParaReservar(5, 0), 5);
  assert.equal(disponiblesParaReservar(5, 3), 2);
  assert.equal(disponiblesParaReservar(2, 2), 0);
  assert.equal(disponiblesParaReservar(1, 4), 0);
  assert.equal(disponiblesParaReservar(0, 0), 0);
});

test('disponiblesParaReservar: trunca valores no enteros', () => {
  assert.equal(disponiblesParaReservar(3.9, 1.2), 2);
});

test('ORDENES_LENTE: exactamente primero, segundo y respaldo, en ese orden', () => {
  assert.deepEqual([...ORDENES_LENTE], ['PRIMERO', 'SEGUNDO', 'RESPALDO']);
});
