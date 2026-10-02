import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { edadDetallada, edadLegible, fechaNacimientoLegible, resumenFicha, sexoLegible } from '../ficha-paciente';

describe('lib/ficha-paciente', () => {
  it('edad en años, meses y días (ejemplo de la ficha)', () => {
    assert.equal(edadLegible('1943-02-28', '2026-10-03'), '83 años, 7 meses y 5 días');
  });
  it('omite meses y días en cero y usa singular', () => {
    assert.equal(edadLegible('2000-10-03', '2026-10-03'), '26 años');
    assert.equal(edadLegible('2025-09-02', '2026-10-03'), '1 año, 1 mes y 1 día');
  });
  it('cumpleaños aún no llegado', () => {
    assert.deepEqual(edadDetallada('1990-12-15', '2026-10-03'), { anios: 35, meses: 9, dias: 18 });
  });
  it('fecha inválida o futura → null', () => {
    assert.equal(edadLegible(null, '2026-10-03'), null);
    assert.equal(edadLegible('2030-01-01', '2026-10-03'), null);
  });
  it('fecha de nacimiento y sexo legibles', () => {
    assert.equal(fechaNacimientoLegible('1943-02-28'), '28 de febrero de 1943');
    assert.equal(sexoLegible('MASCULINO'), 'Hombre');
    assert.equal(sexoLegible('H'), 'Hombre');
    assert.equal(sexoLegible('FEMENINO'), 'Mujer');
    assert.equal(sexoLegible(''), null);
  });
  it('resumen compacto', () => {
    assert.equal(resumenFicha({ expediente: '1136', sexo: 'MASCULINO', fechaNacimiento: '1943-02-28' }, '2026-10-03'), 'Exp. 1136 · Hombre · 83 años');
    assert.equal(resumenFicha({ sexo: 'M', edad: 40 }, ''), 'Mujer · 40 años');
  });
});
