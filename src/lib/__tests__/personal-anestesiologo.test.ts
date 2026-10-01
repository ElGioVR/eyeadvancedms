import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esMedicoTratante, puedeOcuparRol } from '../catalogos/personal';
import { ROLES_APOYO } from '../catalogos/equipo-quirurgico';

const medico = { tipo_personal: 'MEDICO' };
const enfermera = { tipo_personal: 'ENFERMERO' };
const anest = { tipo_personal: 'ANESTESIOLOGO' };

describe('anestesiólogos: solo ejercen la anestesia', () => {
  it('el rol anestesiólogo solo admite anestesiólogos', () => {
    assert.equal(puedeOcuparRol(anest, 'anestesiologo', ROLES_APOYO), true);
    assert.equal(puedeOcuparRol(medico, 'anestesiologo', ROLES_APOYO), false);
    assert.equal(puedeOcuparRol(enfermera, 'anestesiologo', ROLES_APOYO), false);
  });
  it('un anestesiólogo no puede ser cirujano, ayudante ni apoyo', () => {
    for (const rol of ['cirujano', 'ayudante', 'instrumentista', 'enfermero', 'circulante']) {
      assert.equal(puedeOcuparRol(anest, rol, ROLES_APOYO), false, rol);
    }
  });
  it('médicos y enfermería conservan sus roles', () => {
    assert.equal(puedeOcuparRol(medico, 'cirujano', ROLES_APOYO), true);
    assert.equal(puedeOcuparRol(enfermera, 'cirujano', ROLES_APOYO), false);
    assert.equal(puedeOcuparRol(enfermera, 'circulante', ROLES_APOYO), true);
    assert.equal(puedeOcuparRol(medico, 'instrumentista', ROLES_APOYO), true);
  });
  it('los anestesiólogos no son médicos tratantes (fuera de consultas)', () => {
    assert.equal(esMedicoTratante(anest), false);
    assert.equal(esMedicoTratante(medico), true);
    assert.equal(esMedicoTratante({ tipo_personal: null }), true);
  });
});
