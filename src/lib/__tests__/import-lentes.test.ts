import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearLio, claveLente } from '../import-lentes-puro';

test('parsearLio: "23.00 CLAREON" → primero, poder 23 y marca CLAREON', () => {
  assert.deepEqual(parsearLio('23.00 CLAREON'), [{ orden: 'PRIMERO', poder: 23, marca: 'CLAREON' }]);
});

test('parsearLio: "ISERT 21.0/CT LUCIA 22.5" → primero ISERT 21 y segundo CT LUCIA 22.5', () => {
  assert.deepEqual(parsearLio('ISERT 21.0/CT LUCIA 22.5'), [
    { orden: 'PRIMERO', poder: 21, marca: 'ISERT' },
    { orden: 'SEGUNDO', poder: 22.5, marca: 'CT LUCIA' },
  ]);
});

test('parsearLio: sin poder usa la columna MARCA cuando hay un solo lente', () => {
  assert.deepEqual(parsearLio('22,5', 'HOYA'), [{ orden: 'PRIMERO', poder: 22.5, marca: 'HOYA' }]);
});

test('parsearLio: vacío o nulo → sin lentes; máximo tres lentes', () => {
  assert.deepEqual(parsearLio(null), []);
  assert.deepEqual(parsearLio('  '), []);
  assert.equal(parsearLio('A 20/B 21/C 22/D 23').length, 3);
});

test('claveLente: misma marca y poder dan la misma clave aunque cambie mayúsculas o acentos', () => {
  assert.equal(claveLente('Ct Lucía', 22.5), claveLente('CT LUCIA', 22.5));
  assert.notEqual(claveLente('CLAREON', 22.5), claveLente('CLAREON', 23));
});
