import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACION_CITA_MIN,
  aMinutos,
  alinearASlot,
  deMinutos,
  duracionEntre,
  generarSlots,
  slotOcupado,
  sumarMinutos,
} from '../agenda-slots';
import { accionesDisponibles } from '../agenda-acciones';

describe('agenda-slots (intervalos de 15 min)', () => {
  it('la duración estándar es 15 min', () => {
    assert.equal(DURACION_CITA_MIN, 15);
  });

  it('convierte horas y minutos', () => {
    assert.equal(aMinutos('10:15'), 615);
    assert.equal(aMinutos('10:15:00'), 615);
    assert.equal(deMinutos(615), '10:15');
    assert.equal(deMinutos(615, true), '10:15:00');
    assert.equal(sumarMinutos('10:50', 15), '11:05');
  });

  it('duracionEntre usa 15 min si falta la hora fin o es inválida', () => {
    assert.equal(duracionEntre('10:00', null), 15);
    assert.equal(duracionEntre('10:00', '09:00'), 15);
    assert.equal(duracionEntre('10:00', '10:45'), 45);
  });

  it('genera la rejilla cada 15 min y alinea horas sueltas', () => {
    const slots = generarSlots();
    assert.equal(slots[0], '07:00');
    assert.equal(slots[1], '07:15');
    assert.ok(slots.every((s) => aMinutos(s) % 15 === 0));
    assert.equal(alinearASlot('10:07'), '10:00');
  });

  it('detecta empalmes; las citas contiguas no chocan', () => {
    const ocupados = [{ hora_inicio: '10:00', hora_fin: '10:15' }];
    assert.equal(slotOcupado('10:00', ocupados), true);
    assert.equal(slotOcupado('09:45', ocupados), false);
    assert.equal(slotOcupado('10:15', ocupados), false);
    // Una cirugía de 60 min que empieza a las 09:30 choca con 10:00
    assert.equal(slotOcupado('09:30', ocupados, 60), true);
  });
});

describe('agenda-acciones (aplazar / reagendar / cancelar)', () => {
  it('consultas y estudios activos admiten las tres acciones para cualquier rol', () => {
    for (const rol of ['admin', 'recepcionista', 'doctor']) {
      assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, rol), ['aplazar', 'reagendar', 'cancelar']);
      assert.deepEqual(accionesDisponibles({ tipo: 'estudio', estado: 'aplazada' }, rol), ['aplazar', 'reagendar', 'cancelar']);
    }
  });

  it('completadas y canceladas no tienen acciones', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'completada' }, 'admin'), []);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'cancelada' }, 'admin'), []);
  });

  it('enfermería (rol restringido) solo consulta su agenda', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'consulta', estado: 'agendada' }, 'enfermero'), []);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'enfermero'), []);
  });

  it('cirugías respetan la máquina de estados y el rol', () => {
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'recepcionista'), ['aplazar', 'reagendar', 'cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'reagendada' }, 'admin'), ['reagendar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'aplazada' }, 'admin'), []);
    // Doctor con acceso total a la agenda (oct 2026); enfermería solo consulta.
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'doctor'), ['aplazar', 'reagendar', 'cancelar']);
    assert.deepEqual(accionesDisponibles({ tipo: 'cirugia', estado: 'agendada' }, 'enfermero'), []);
    assert.deepEqual(accionesDisponibles({ estado: 'agendada' }, 'admin'), ['aplazar', 'reagendar', 'cancelar']);
  });
});
