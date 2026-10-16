import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CIRUGIAS_OFICIALES, esProcedimientoConLio, tipoLioDesdeProcedimiento } from '../catalogos/cirugia';
import { puedeEditarCirugia, cirugiaCancelada } from '../permisos-edicion';

/** Documento «Agenda de cirugía» (16 oct 2026). */
describe('catálogo oficial de cirugías', () => {
  it('son 8 y ninguno lleva el ojo en el nombre', () => {
    assert.equal(CIRUGIAS_OFICIALES.length, 8);
    for (const n of CIRUGIAS_OFICIALES) assert.ok(!/\b(OD|OI|OS|OU)\b|\(O[DIUS]\)/.test(n), n);
  });
  it('las 4 de facoemulsificación activan el bloque de LIO; las de pterigión no', () => {
    const faco = CIRUGIAS_OFICIALES.filter((n) => n.startsWith('Faco'));
    const pter = CIRUGIAS_OFICIALES.filter((n) => n.startsWith('Resección'));
    assert.equal(faco.length, 4);
    assert.equal(pter.length, 4);
    for (const n of faco) assert.equal(esProcedimientoConLio(n), true, n);
    for (const n of pter) assert.equal(esProcedimientoConLio(n), false, n);
  });
  it('el nombre indica diseño y toricidad del LIO («no tórico» antes que «tórico»)', () => {
    assert.deepEqual(tipoLioDesdeProcedimiento('Facoemulsificación del cristalino + LIO monofocal no tórico'), { diseno: 'MONOFOCAL', torico: false });
    assert.deepEqual(tipoLioDesdeProcedimiento('Facoemulsificación del cristalino + LIO monofocal tórico'), { diseno: 'MONOFOCAL', torico: true });
    assert.deepEqual(tipoLioDesdeProcedimiento('Facoemulsificación del cristalino + LIO trifocal no tórico'), { diseno: 'TRIFOCAL', torico: false });
    assert.deepEqual(tipoLioDesdeProcedimiento('FACOEMULSIFICACION + LIO TRIFOCAL TORICO'), { diseno: 'TRIFOCAL', torico: true });
    assert.equal(tipoLioDesdeProcedimiento('Resección de pterigión + autoinjerto conjuntival'), null);
    assert.equal(tipoLioDesdeProcedimiento(null), null);
  });
});

describe('editar cirugía después de completarla', () => {
  it('completada: la corrigen admin, recepción y doctor; enfermería no', () => {
    for (const rol of ['admin', 'recepcionista', 'doctor']) assert.equal(puedeEditarCirugia('completada', rol), true, rol);
    assert.equal(puedeEditarCirugia('completada', 'enfermero'), false);
    assert.equal(puedeEditarCirugia('completada', null), false);
  });
  it('cancelada no se edita; agendada/aplazada sí', () => {
    assert.equal(puedeEditarCirugia('cancelada', 'admin'), false);
    assert.equal(cirugiaCancelada('cancelada'), true);
    assert.equal(cirugiaCancelada('completada'), false);
    for (const e of ['agendada', 'aplazada', 'reagendada']) assert.equal(puedeEditarCirugia(e, 'enfermero'), true, e);
  });
});
