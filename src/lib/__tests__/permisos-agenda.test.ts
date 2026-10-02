import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agendaSoloPropia, puedeGestionarAgenda } from '../permisos-agenda';
import { accionesDisponibles } from '../agenda-acciones';

describe('lib/permisos-agenda', () => {
  it('admin, recepción y doctor gestionan la agenda', () => {
    for (const rol of ['admin', 'recepcionista', 'doctor']) assert.equal(puedeGestionarAgenda(rol), true, rol);
  });
  it('enfermería y roles desconocidos no la gestionan', () => {
    for (const rol of ['enfermero', '', null, undefined, 'otro']) assert.equal(puedeGestionarAgenda(rol), false, String(rol));
  });
  it('solo enfermería está limitada a su agenda propia', () => {
    assert.equal(agendaSoloPropia('enfermero'), true);
    assert.equal(agendaSoloPropia('doctor'), false);
    assert.equal(agendaSoloPropia('admin'), false);
  });
});

describe('lib/agenda-acciones accionesDisponibles (doctor con acceso total)', () => {
  it('doctor: acciones sobre cirugías agendadas', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'doctor'), ['aplazar', 'reagendar', 'cancelar']);
  });
  it('doctor: reagendar una cirugía reagendada', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'reagendada' }, 'doctor'), ['reagendar']);
  });
  it('doctor: acciones sobre consultas', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, 'doctor'), ['aplazar', 'reagendar', 'cancelar']);
  });
  it('enfermería: sin acciones', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'enfermero'), []);
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, 'enfermero'), []);
  });
  it('estados finales: sin acciones', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' }, 'admin'), []);
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'cancelada' }, 'doctor'), []);
  });
});
