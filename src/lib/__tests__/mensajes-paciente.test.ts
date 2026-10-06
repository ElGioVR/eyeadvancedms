import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correoValido, fechaLarga, horaLegible, LINEA_CONFIRMACION, mensajeCita, mensajeConfirmacionCita, normalizarTelefono, urlCorreo, urlWhatsApp } from '../mensajes-paciente';

describe('lib/mensajes-paciente normalizarTelefono', () => {
  it('10 dígitos MX → 52', () => assert.equal(normalizarTelefono('(664) 123-4567'), '526641234567'));
  it('+52 se respeta', () => assert.equal(normalizarTelefono('+52 664 123 4567'), '526641234567'));
  it('521 móvil antiguo → 52', () => assert.equal(normalizarTelefono('5216641234567'), '526641234567'));
  it('EE. UU. 1 + 10', () => assert.equal(normalizarTelefono('+1 619 555 0101'), '16195550101'));
  it('incompleto o vacío → null', () => {
    assert.equal(normalizarTelefono('12345'), null);
    assert.equal(normalizarTelefono(''), null);
    assert.equal(normalizarTelefono(null), null);
  });
});

describe('lib/mensajes-paciente fechas', () => {
  it('fecha larga con día de la semana', () => {
    assert.equal(fechaLarga('2026-10-01'), 'jueves 1 de octubre de 2026');
    assert.equal(fechaLarga('2026-01-04'), 'domingo 4 de enero de 2026');
    assert.equal(fechaLarga('2024-02-29'), 'jueves 29 de febrero de 2024');
  });
  it('hora legible', () => {
    assert.equal(horaLegible('09:30:00'), '9:30 a. m.');
    assert.equal(horaLegible('12:00'), '12:00 p. m.');
    assert.equal(horaLegible('00:15'), '12:15 a. m.');
    assert.equal(horaLegible(null), null);
  });
});

describe('lib/mensajes-paciente mensajes y URLs', () => {
  const cita = { tipo: 'cirugia' as const, paciente: 'María López', fecha: '2026-10-06', hora: '08:00', doctor: 'DR. RUIZ', detalle: 'Facoemulsificación OD' };
  it('el mensaje incluye los datos de la cita y no el diagnóstico', () => {
    const { asunto, cuerpo } = mensajeCita(cita);
    assert.match(asunto, /Cirugía programada — martes 6 de octubre de 2026/);
    assert.match(cuerpo, /Hola, María López\./);
    assert.match(cuerpo, /• Hora: 8:00 a\. m\./);
    assert.match(cuerpo, /• Procedimiento: Facoemulsificación OD/);
    assert.match(cuerpo, /ayuno/);
  });
  it('wa.me con texto codificado', () => {
    const url = urlWhatsApp('6641234567', 'Hola & adiós');
    assert.equal(url, 'https://wa.me/526641234567?text=Hola%20%26%20adi%C3%B3s');
    assert.equal(urlWhatsApp('', 'x'), null);
  });
  it('mailto solo con correo válido', () => {
    assert.equal(correoValido('a@b.mx'), true);
    assert.equal(correoValido('sin-arroba'), false);
    assert.equal(urlCorreo('a@b.mx', 'Asunto', 'Cuerpo'), 'mailto:a@b.mx?subject=Asunto&body=Cuerpo');
    assert.equal(urlCorreo(null, 'a', 'b'), null);
  });
});

describe('lib/mensajes-paciente plantillas', () => {
  const cita = { tipo: 'consulta' as const, paciente: 'Ana', fecha: '2026-10-01', hora: '09:30', doctor: 'DR X', detalle: null, folio: null };
  it('sustituye variables y omite líneas sin dato', async () => {
    const { aplicarPlantilla } = await import('../mensajes-paciente');
    const out = aplicarPlantilla('Hola, {paciente}.\n• Fecha: {fecha} {hora}\n• Folio: {folio}\nGracias {desconocida}', cita);
    assert.equal(out, 'Hola, Ana.\n• Fecha: jueves 1 de octubre de 2026 9:30 a. m.\nGracias {desconocida}');
  });
  it('saludo sin nombre → «Hola.»', async () => {
    const { aplicarPlantilla } = await import('../mensajes-paciente');
    assert.equal(aplicarPlantilla('Hola, {paciente}.\nCita: {fecha}', { ...cita, paciente: '' }), 'Hola.\nCita: jueves 1 de octubre de 2026');
  });
  it('sin plantilla usa el mensaje por defecto', async () => {
    const { mensajeCitaConPlantilla } = await import('../mensajes-paciente');
    assert.deepEqual(mensajeCitaConPlantilla(cita, { consulta: '  ' }), mensajeCita(cita));
    assert.equal(mensajeCitaConPlantilla(cita, { consulta: 'Hola {paciente}' }).cuerpo, 'Hola Ana');
  });
});

it('mensaje de confirmación pide SÍ / NO', () => {
  const m = mensajeConfirmacionCita({ tipo: 'consulta', paciente: 'Ana López', fecha: '2026-10-07', hora: '09:30' });
  assert.ok(m.cuerpo.startsWith('Hola, Ana López.'));
  assert.ok(m.cuerpo.endsWith(LINEA_CONFIRMACION));
});
