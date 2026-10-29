import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agendaSoloPropia, puedeFiltrarSoloMio, puedeGestionarAgenda } from '../permisos-agenda';
import { accionesDisponibles } from '../agenda-acciones';

describe('lib/permisos-agenda', () => {
  it('todos los roles gestionan la agenda', () => {
    for (const rol of ['admin', 'recepcionista', 'doctor', 'enfermero']) assert.equal(puedeGestionarAgenda(rol), true, rol);
  });
  it('roles desconocidos no la gestionan', () => {
    for (const rol of ['', null, undefined, 'otro']) assert.equal(puedeGestionarAgenda(rol), false, String(rol));
  });
  it('nadie está limitado a su agenda propia', () => {
    for (const rol of ['enfermero', 'doctor', 'admin', 'recepcionista']) assert.equal(agendaSoloPropia(rol), false, rol);
  });
  it('solo doctor y enfermería tienen el check «Solo lo mío»', () => {
    assert.equal(puedeFiltrarSoloMio('doctor'), true);
    assert.equal(puedeFiltrarSoloMio('enfermero'), true);
    assert.equal(puedeFiltrarSoloMio('admin'), false);
    assert.equal(puedeFiltrarSoloMio('recepcionista'), false);
  });
});

describe('lib/agenda-acciones accionesDisponibles (doctor con acceso total)', () => {
  it('doctor: acciones sobre cirugías agendadas', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'doctor'), ['reagendar', 'cancelar']);
  });
  it('doctor: reagendar una cirugía reagendada', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'reagendada' }, 'doctor'), ['reagendar']);
  });
  it('doctor: acciones sobre consultas', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, 'doctor'), ['reagendar', 'cancelar']);
  });
  it('enfermería: mismas acciones que el resto', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'enfermero'), ['reagendar', 'cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, 'enfermero'), ['reagendar', 'cancelar']);
  });
  it('estados finales: sin acciones', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'completada' }, 'admin'), ['cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'cancelada' }, 'doctor'), []);
  });
});
