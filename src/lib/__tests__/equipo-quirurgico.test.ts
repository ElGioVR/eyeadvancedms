import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES_POR_DEFECTO, equipoPorDefecto, esRolApoyo, horarioCirugia, sincronizarHorario, validarEquipo } from '../catalogos/equipo-quirurgico';

const fila = (rol: string, personaId: string, horaInicio = '08:00', horaFin = '09:00') => ({ rol, personaId, horaInicio, horaFin });

describe('equipo quirúrgico homologado', () => {
  it('precarga los 5 roles por defecto con el horario de la cirugía', () => {
    let n = 0;
    const eq = equipoPorDefecto('08:00', 90, () => `id${n++}`);
    assert.deepEqual(eq.map((m) => m.rol), [...ROLES_POR_DEFECTO]);
    assert.deepEqual(eq.map((m) => m.rol), ['cirujano', 'anestesiologo', 'instrumentista', 'enfermero', 'circulante']);
    assert.ok(eq.every((m) => m.horaInicio === '08:00' && m.horaFin === '09:30' && !m.personaId && !m.horarioEditado));
    assert.deepEqual(eq.map((m) => m.id), ['id0', 'id1', 'id2', 'id3', 'id4']);
  });

  it('distingue roles de apoyo (personal clínico) de roles médicos', () => {
    assert.equal(esRolApoyo('circulante'), true);
    assert.equal(esRolApoyo('enfermero'), true);
    assert.equal(esRolApoyo('cirujano'), false);
    assert.equal(esRolApoyo(''), false);
  });

  it('el horario sigue a la cirugía salvo en filas editadas a mano', () => {
    let n = 0;
    const eq = equipoPorDefecto('08:00', 60, () => `id${n++}`);
    eq[1] = { ...eq[1], horaInicio: '07:45', horaFin: '08:30', horarioEditado: true };
    const s = sincronizarHorario(eq, '10:00', 30);
    assert.equal(s[0].horaInicio, '10:00');
    assert.equal(s[0].horaFin, '10:30');
    assert.equal(s[1].horaInicio, '07:45');
    assert.equal(sincronizarHorario(s, '10:00', 30), s, 'sin cambios devuelve la misma referencia');
    assert.deepEqual(horarioCirugia('', 60), { inicio: '', fin: '' });
  });

  it('solo el cirujano es obligatorio; filas vacías se ignoran', () => {
    assert.equal(validarEquipo([fila('anestesiologo', 'd1'), fila('enfermero', '')]), 'Debe asignar al menos un cirujano');
    assert.equal(validarEquipo([fila('cirujano', 'd1'), fila('enfermero', ''), fila('circulante', '')]), null);
  });

  it('la misma persona no puede estar en un rol médico y uno de apoyo a la vez (personal unificado)', () => {
    assert.match(validarEquipo([fila('cirujano', 'd1'), fila('anestesiologo', 'e1'), fila('circulante', 'e1')])!, /empalman/);
  });

  it('valida horarios y empalmes de la misma persona dentro del equipo', () => {
    assert.match(validarEquipo([fila('cirujano', 'd1', '09:00', '08:00')])!, /terminar después/);
    assert.match(validarEquipo([fila('cirujano', 'd1', '', '')])!, /Indica el horario/);
    assert.match(validarEquipo([fila('cirujano', 'd1'), fila('enfermero', 'p1'), fila('circulante', 'p1', '08:30', '09:30')])!, /empalman/);
    // Misma persona en horarios consecutivos: válido
    assert.equal(validarEquipo([fila('cirujano', 'd1'), fila('enfermero', 'p1', '08:00', '08:30'), fila('circulante', 'p1', '08:30', '09:00')]), null);
    // Varias personas en el mismo rol (abierto): válido
    assert.equal(validarEquipo([fila('cirujano', 'd1'), fila('enfermero', 'p1'), fila('enfermero', 'p2')]), null);
  });
});
