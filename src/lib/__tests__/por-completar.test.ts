import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltantesCirugia, faltantesConsulta, requiereLente } from '../por-completar';

const lente = (o: Partial<Parameters<typeof faltantesCirugia>[0] & object> = {}) => o;

test('requiereLente: facoemulsificación, +LIO y catarata; vitrectomía sola no', () => {
  assert.equal(requiereLente('FACO+LIO'), true);
  assert.equal(requiereLente('Facovitrectomía'), true);
  assert.equal(requiereLente('VITRECTOMIA + RETIRO'), false);
  assert.equal(requiereLente(null), false);
});

test('cirugía agendada sin hora ni lente (la anestesia ya no cuenta como pendiente)', () => {
  const r = faltantesCirugia({ ...lente(), fecha: '2026-10-20', hora: null, ojo: 'OD', procedimiento: 'FACO+LIO', anestesia: null, lio: '22.5', lentes: [] });
  assert.deepEqual(r.faltan, ['hora', 'lente']);
  assert.match(r.detalleLente[0], /marca/);
});

test('aplazada: no se exige fecha, hora ni anestesia, solo ojo/procedimiento/lente', () => {
  const r = faltantesCirugia({ estado: 'aplazada', fecha: null, hora: null, ojo: null, procedimiento: 'FACO+LIO', anestesia: null, lentes: [] });
  assert.deepEqual(r.faltan, ['ojo', 'lente']);
});

test('lente solicitado: no falta nada pero queda «por solicitar»', () => {
  const r = faltantesCirugia({
    fecha: '2026-10-20', hora: '08:00:00', ojo: 'OD', procedimiento: 'FACO+LIO', anestesia: 'LOCAL', lio: 'Isert 21.0/CT LUCIA 22.5',
    lentes: [
      { orden: 'PRIMERO', modo: 'ASIGNAR', estado_logistica: 'LISTO', fabricante: 'Hoya', modelo: 'iSert', poder_d: 21, torico: false, cilindro: null },
      { orden: 'RESPALDO', modo: 'SOLICITAR', estado_logistica: 'POR_SOLICITAR', fabricante: 'Teleon', modelo: null, poder_d: 22.5, torico: false, cilindro: null },
    ],
  });
  assert.deepEqual(r.faltan, []);
  assert.deepEqual(r.info, ['por_solicitar']);
});

test('lente sin poder o tórico sin cilindro falta', () => {
  const r = faltantesCirugia({
    fecha: '2026-10-20', hora: '08:00:00', ojo: 'OD', procedimiento: 'FACO+LIO', anestesia: 'LOCAL',
    lentes: [{ orden: 'PRIMERO', modo: 'COMPRA_DIRECTA', estado_logistica: 'POR_COMPRAR', fabricante: 'Clareon', modelo: null, poder_d: null, torico: true, cilindro: null }],
  });
  assert.deepEqual(r.faltan, ['lente']);
  assert.deepEqual(r.info, ['por_comprar']);
  assert.equal(r.detalleLente.length, 2);
});

test('sin lectura de lentes (undefined) no se evalúa el lente', () => {
  const r = faltantesCirugia({ fecha: '2026-10-20', hora: '08:00:00', ojo: 'OD', procedimiento: 'FACO+LIO', anestesia: 'LOCAL' });
  assert.deepEqual(r.faltan, []);
});

test('consulta sin hora, doctor o aseguradora', () => {
  assert.deepEqual(faltantesConsulta({ hora_inicio: null, doctor_id: null, aseguranza_id: null }), ['hora', 'doctor', 'aseguradora']);
  assert.deepEqual(faltantesConsulta({ hora_inicio: '10:00:00', doctor_id: 'd', aseguranza_id: 'a' }), []);
});
