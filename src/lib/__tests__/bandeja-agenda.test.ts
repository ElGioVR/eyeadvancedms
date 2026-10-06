import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ahoraClinica, clasificarBandeja, detalleEvento, etiquetaTiempo, finCitaMin, sumarDias } from '../bandeja-agenda';

const ahora = { fecha: '2026-10-06', minutos: 12 * 60 }; // 6 oct, 12:00

test('ahoraClinica usa hora de Tijuana', () => {
  // 2026-10-06T19:30Z = 12:30 en Tijuana (UTC-7)
  assert.deepEqual(ahoraClinica(new Date('2026-10-06T19:30:00Z')), { fecha: '2026-10-06', minutos: 12 * 60 + 30 });
  // 2026-10-07T03:00Z = 6 oct 20:00 en Tijuana
  assert.equal(ahoraClinica(new Date('2026-10-07T03:00:00Z')).fecha, '2026-10-06');
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
});

test('fin de la cita: hora fin, duración o por defecto', () => {
  assert.equal(finCitaMin({ tipo: 'consulta', fecha: 'x', hora: '10:00', hora_fin: '10:30' }), 630);
  assert.equal(finCitaMin({ tipo: 'cirugia', fecha: 'x', hora: '10:00', duracion_min: 90 }), 690);
  assert.equal(finCitaMin({ tipo: 'consulta', fecha: 'x', hora: '10:00' }), 660);
  assert.equal(finCitaMin({ tipo: 'consulta', fecha: 'x', hora: null }), null);
});

test('clasificación: por confirmar, por cerrar o nada', () => {
  const c = (fecha: string, hora: string | null, extra = {}) => clasificarBandeja({ tipo: 'consulta', fecha, hora, ...extra }, ahora);
  assert.equal(c('2026-10-06', '15:00'), 'por_confirmar'); // hoy más tarde
  assert.equal(c('2026-10-07', '09:00'), 'por_confirmar'); // mañana
  assert.equal(c('2026-10-07', '09:00', { confirmacion: 'confirmada' }), null);
  assert.equal(c('2026-10-07', '09:00', { confirmacion: 'enviada' }), 'por_confirmar');
  assert.equal(c('2026-10-08', '09:00'), null); // pasado mañana
  assert.equal(c('2026-10-06', '10:00', { hora_fin: '10:30' }), 'por_cerrar'); // terminó hoy
  assert.equal(c('2026-10-06', '11:30', { hora_fin: '12:30' }), null); // en curso
  assert.equal(c('2026-10-06', null), 'por_confirmar'); // hoy sin hora: se cierra al terminar el día
  assert.equal(c('2026-10-05', '09:00', { confirmacion: 'confirmada' }), 'por_cerrar'); // ayer
  assert.equal(c('2026-09-01', '09:00'), null); // fuera de los 15 días
  assert.equal(clasificarBandeja({ tipo: 'cirugia', fecha: null, hora: null }, ahora), null);
});

test('etiqueta de tiempo', () => {
  assert.equal(etiquetaTiempo({ tipo: 'consulta', fecha: '2026-10-06', hora: '12:30' }, ahora), 'Hoy, en 30 min');
  assert.equal(etiquetaTiempo({ tipo: 'consulta', fecha: '2026-10-06', hora: '09:00', hora_fin: '09:30' }, ahora), 'Terminó hace 2 h');
  assert.equal(etiquetaTiempo({ tipo: 'consulta', fecha: '2026-10-07', hora: '09:00' }, ahora), 'Mañana');
  assert.equal(etiquetaTiempo({ tipo: 'consulta', fecha: '2026-10-03', hora: '09:00' }, ahora), 'Hace 3 días');
});

test('detalle de la tarjeta según el tipo', () => {
  assert.equal(detalleEvento({ tipo: 'cirugia', procedimiento: 'FACO + LIO', ojo: 'OD' }), 'FACO + LIO OD');
  assert.equal(detalleEvento({ tipo: 'estudio', estudios: ['OCT macular', null, ' Campimetría '] }), 'OCT macular, Campimetría');
  assert.equal(detalleEvento({ tipo: 'estudio', estudios: [] }), 'Estudio');
  assert.equal(detalleEvento({ tipo: 'consulta', tipo_consulta: 'PROCEDIMIENTO', procedimiento: 'Fotocoagulación' }), 'Fotocoagulación');
  assert.equal(detalleEvento({ tipo: 'consulta', tipo_consulta: 'CONSULTA', tipo_consulta_label: 'Subsecuente', especialidad: 'Retina' }), 'Subsecuente · Retina');
  assert.equal(detalleEvento({ tipo: 'consulta', tipo_consulta_label: 'Primera consulta' }), 'Primera consulta');
});

test('seguimiento: resultado de la cita', async () => {
  const { resultadoCita } = await import('../bandeja-agenda');
  const r = (tipo: 'cirugia' | 'consulta', estado: string, fecha: string | null, hora: string | null = '09:00') =>
    resultadoCita({ tipo, estado, fecha, hora }, ahora);
  assert.equal(r('consulta', 'COMPLETADA', '2026-10-01').clave, 'completada');
  assert.equal(r('consulta', 'PROCESADA', '2026-10-01').clave, 'completada');
  assert.equal(r('consulta', 'AGENDADA', '2026-10-01').clave, 'sin_cerrar');
  assert.equal(r('consulta', 'AGENDADA', '2026-10-07').clave, 'proxima');
  assert.deepEqual(r('consulta', 'PENDIENTE_ESTUDIO', '2026-10-01'), { clave: 'pendiente', detalle: 'Pendiente de estudio' });
  assert.equal(r('cirugia', 'cancelada', '2026-10-01').clave, 'cancelada');
  assert.deepEqual(r('cirugia', 'aplazada', null, null), { clave: 'aplazada', detalle: 'Sin fecha nueva' });
  assert.equal(r('cirugia', 'reagendada', '2026-10-02').clave, 'sin_cerrar');
});

test('seguimiento: historial legible', async () => {
  const { describirEventoHistorial: d } = await import('../bandeja-agenda');
  assert.deepEqual(d('cirugia', 'ESTADO_CAMBIADO', { de: 'agendada', a: 'cancelada', motivo: 'No se presentó' }), { titulo: 'Agendada → Cancelada', motivo: 'No se presentó' });
  assert.deepEqual(d('consulta', 'REAGENDADO', { accion: 'reagendar', motivo: 'Paciente pidió cambio', fecha_anterior: '2026-10-01', hora_anterior: '09:00:00', fecha_nueva: '2026-10-08', hora_nueva: '10:30' }), { titulo: 'Reagendada: 01/10/2026 09:00 → 08/10/2026 10:30', motivo: 'Paciente pidió cambio' });
  assert.deepEqual(d('consulta', 'CAMBIO_ESTATUS', { de: 'AGENDADA', a: 'COMPLETADA' }), { titulo: 'Agendada → Completada', motivo: null });
  assert.equal(d('cirugia', 'ARCHIVO_AGREGADO', {}), null);
});
