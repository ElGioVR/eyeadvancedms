import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accionesConConfirmar } from '../agenda-acciones';
import { estaConfirmada, puedeConfirmarse, MEDIOS_CONFIRMACION } from '../confirmacion-cita';

describe('confirmación de citas', () => {
  it('solo se confirman citas abiertas', () => {
    assert.equal(puedeConfirmarse('agendada'), true);
    assert.equal(puedeConfirmarse('reagendada'), true);
    assert.equal(puedeConfirmarse('completada'), false);
    assert.equal(puedeConfirmarse('cancelada'), false);
  });
  it('estaConfirmada exige estado abierto', () => {
    assert.equal(estaConfirmada({ estado: 'agendada', confirmacion: 'confirmada' }), true);
    assert.equal(estaConfirmada({ estado: 'agendada', confirmacion: 'enviada' }), false);
    assert.equal(estaConfirmada({ estado: 'cancelada', confirmacion: 'confirmada' }), false);
  });
  it('medios disponibles', () => {
    assert.deepEqual([...MEDIOS_CONFIRMACION], ['whatsapp', 'telefono', 'correo', 'presencial']);
  });
  it('«Confirmar» va primero en consulta, estudio y cirugía agendadas', () => {
    for (const tipo of ['consulta', 'estudio', 'cirugia'] as const) {
      assert.deepEqual(accionesConConfirmar({ tipo, estado: 'agendada', confirmacion: null }, 'admin'), ['confirmar', 'reagendar', 'cancelar']);
    }
  });
  it('no ofrece Confirmar si ya está confirmada, cerrada o el rol no gestiona', () => {
    assert.deepEqual(accionesConConfirmar({ tipo: 'cirugia', estado: 'agendada', confirmacion: 'confirmada' }, 'admin'), ['reagendar', 'cancelar']);
    assert.deepEqual(accionesConConfirmar({ tipo: 'cirugia', estado: 'completada', confirmacion: null }, 'admin'), []);
    assert.deepEqual(accionesConConfirmar({ tipo: 'consulta', estado: 'agendada', confirmacion: null }, 'paciente'), []);
  });
});
