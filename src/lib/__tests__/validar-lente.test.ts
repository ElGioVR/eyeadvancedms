import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarLente, lenteVacio } from '../../components/cirugia/LenteLogistica';

// Reporte de clínica: al editar una cirugía no aceptaba LIO 24.0 con cilindro 0.00.
const modelos = [{ id: 'm1', fabricante: 'Alcon', modelo: 'AcrySof IQ Toric', torico: true, activo: true, diseno: 'MONOFOCAL' }] as never;
const toricoBase = { ...lenteVacio('PRIMERO'), modeloId: 'm1', fabricante: 'Alcon', torico: true, potencia: '24.0' };

test('tórico 24.0 con cilindro 0.00 es válido en cualquier modo', () => {
  for (const modo of ['SIN_TRAMITE', 'SOLICITAR', 'COMPRA_DIRECTA'] as const) {
    assert.equal(validarLente({ ...toricoBase, modo, cilindro: '0.00' }, modelos), null, modo);
    assert.equal(validarLente({ ...toricoBase, modo, cilindro: '0' }, modelos), null, modo);
    assert.equal(validarLente({ ...toricoBase, modo, cilindro: '0,00' }, modelos), null, modo);
  }
});

test('sigue pidiendo el cilindro si falta al solicitar o comprar', () => {
  assert.match(validarLente({ ...toricoBase, modo: 'SOLICITAR', cilindro: '' }, modelos) ?? '', /captura el cilindro/);
  assert.equal(validarLente({ ...toricoBase, modo: 'SIN_TRAMITE', cilindro: '' }, modelos), null);
});

test('rechaza cilindros fuera de rango o no numéricos', () => {
  assert.match(validarLente({ ...toricoBase, modo: 'SOLICITAR', cilindro: '-1' }, modelos) ?? '', /entre 0 y 12/);
  assert.match(validarLente({ ...toricoBase, modo: 'SOLICITAR', cilindro: '13' }, modelos) ?? '', /entre 0 y 12/);
  assert.match(validarLente({ ...toricoBase, modo: 'SOLICITAR', cilindro: 'abc' }, modelos) ?? '', /captura el cilindro/);
});

test('potencia 24.0 válida sin tórico', () => {
  assert.equal(validarLente({ ...toricoBase, torico: false, modo: 'SOLICITAR', cilindro: '' }, modelos), null);
});
