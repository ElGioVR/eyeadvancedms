import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PESTANA_INACTIVA_MS, decidirPestana, leerRegistro } from '../sesion-pestana';

describe('lib/sesion-pestana', () => {
  const ahora = 1_000_000;
  it('sin registro → activa', () => assert.equal(decidirPestana(null, 'b', ahora), 'activa'));
  it('misma pestaña → activa', () => assert.equal(decidirPestana({ id: 'b', ts: ahora }, 'b', ahora), 'activa'));
  it('otra pestaña con latido reciente → bloqueada (prioridad de la primera)', () =>
    assert.equal(decidirPestana({ id: 'a', ts: ahora - 3_000 }, 'b', ahora), 'bloqueada'));
  it('otra pestaña sin latido → activa', () =>
    assert.equal(decidirPestana({ id: 'a', ts: ahora - PESTANA_INACTIVA_MS - 1 }, 'b', ahora), 'activa'));
  it('registro inválido → null', () => {
    assert.equal(leerRegistro('xx'), null);
    assert.equal(leerRegistro(null), null);
    assert.deepEqual(leerRegistro('{"id":"a","ts":5}'), { id: 'a', ts: 5 });
  });
});
