import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefonos, telefonoPrincipal, telefonosBusqueda, telefonosWhatsApp } from '../telefonos-paciente';

describe('lib/telefonos-paciente', () => {
  it('máximo 3, sin vacíos ni repetidos, un solo principal', () => {
    const r = normalizarTelefonos([
      { numero: '664 123 4567', etiqueta: 'Celular', principal: false },
      { numero: '' },
      { numero: '(664) 123-4567', etiqueta: 'Casa' },
      { numero: '6640000001', etiqueta: 'Trabajo', principal: true },
      { numero: '6640000002', etiqueta: 'Familiar', principal: true },
      { numero: '6640000003' },
    ]);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((t) => t.principal), [false, true, false]);
    assert.equal(telefonoPrincipal(r), '6640000001');
  });
  it('sin principal marcado → el primero', () => {
    const r = normalizarTelefonos([{ numero: '6641111111' }, { numero: '6642222222' }]);
    assert.equal(r[0].principal, true);
    assert.equal(r[0].etiqueta, 'Celular');
  });
  it('registros anteriores: usa el teléfono suelto', () => {
    assert.deepEqual(normalizarTelefonos([], '6643333333'), [{ numero: '6643333333', etiqueta: 'Celular', principal: true }]);
    assert.deepEqual(normalizarTelefonos(null, null), []);
  });
  it('WhatsApp: principal primero y solo números válidos', () => {
    const lista = normalizarTelefonos([
      { numero: '12345', etiqueta: 'Casa' },
      { numero: '6644444444', etiqueta: 'Familiar' },
      { numero: '6645555555', etiqueta: 'Celular', principal: true },
    ]);
    assert.deepEqual(telefonosWhatsApp(lista).map((t) => t.numero), ['6645555555', '6644444444']);
  });
  it('texto de búsqueda con dígitos', () => {
    assert.equal(telefonosBusqueda(normalizarTelefonos([{ numero: '(664) 123-4567' }, { numero: '664 765 4321' }])), '6641234567 6647654321');
  });
});
