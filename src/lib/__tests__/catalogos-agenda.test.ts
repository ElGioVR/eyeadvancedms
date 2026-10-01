import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESPECIALIDADES_BASE, buscarEspecialidad } from '../catalogos/especialidades';
import { TIPOS_CONSULTA_AGENDA, etiquetaTipoConsulta, opcionTipoConsulta, tipoAgendaDesdeBd, valoresBdTipoConsulta } from '../catalogos/tipos-consulta';
import { ANESTESIAS, VALORES_ANESTESIA, etiquetaAnestesia, etiquetaOjo, OJOS_CIRUGIA, TIPOS_LIO, tipoLioDe, esProcedimientoConLio, ROLES_PERSONAL } from '../catalogos/cirugia';

describe('especialidades (punto II)', () => {
  it('incluye las del documento: Retina, Glaucoma, Córnea, Catarata', () => {
    const nombres = ESPECIALIDADES_BASE.map((e) => e.nombre).join('|');
    for (const n of ['Retina', 'Glaucoma', 'Córnea', 'Catarata']) assert.match(nombres, new RegExp(n));
  });
  it('encuentra el valor antiguo sin acento de doctores', () => {
    assert.equal(buscarEspecialidad(ESPECIALIDADES_BASE, 'Cornea y Superficie Ocular')?.clave, 'cornea');
    assert.equal(buscarEspecialidad(ESPECIALIDADES_BASE, 'RETINA')?.clave, 'retina');
    assert.equal(buscarEspecialidad(ESPECIALIDADES_BASE, null), undefined);
  });
});

describe('tipo de consulta (punto II)', () => {
  it('ofrece exactamente los 4 tipos del documento', () => {
    assert.deepEqual(TIPOS_CONSULTA_AGENDA.map((t) => t.label), ['Primera consulta', 'Subsecuente', 'Estudios', 'Procedimientos']);
  });
  it('mapea a tipo_consulta / tipo_visita existentes (costos y honorarios)', () => {
    assert.deepEqual([opcionTipoConsulta('PRIMERA').tipo, opcionTipoConsulta('PRIMERA').tipoVisita], ['Consulta', 'Primera Vez']);
    assert.deepEqual([opcionTipoConsulta('SUBSECUENTE').tipo, opcionTipoConsulta('SUBSECUENTE').tipoVisita], ['Consulta', 'Visita de Retorno']);
    assert.equal(opcionTipoConsulta('ESTUDIOS').tipo, 'Estudio');
    assert.equal(opcionTipoConsulta('PROCEDIMIENTOS').tipo, 'Procedimiento');
    assert.equal(opcionTipoConsulta('desconocido').value, 'PRIMERA');
  });
  it('etiqueta lo guardado en BD, incluidos históricos', () => {
    assert.equal(etiquetaTipoConsulta('CONSULTA', 'PRIMERA_VEZ'), 'Primera consulta');
    assert.equal(etiquetaTipoConsulta('REVISION', 'SUBSECUENTE'), 'Subsecuente');
    assert.equal(etiquetaTipoConsulta('ESTUDIO', 'PRIMERA_VEZ'), 'Estudios');
    assert.equal(etiquetaTipoConsulta('PROCEDIMIENTO', null), 'Procedimientos');
    assert.equal(etiquetaTipoConsulta(null, null), 'Primera consulta');
  });
});

describe('cirugía (punto I)', () => {
  it('anestesia: local con sedación, local, general', () => {
    assert.deepEqual(ANESTESIAS.map((a) => a.label), ['Local con sedación', 'Local', 'General']);
    assert.deepEqual(VALORES_ANESTESIA, ['LOCAL_SEDACION', 'LOCAL', 'GENERAL']);
    assert.equal(etiquetaAnestesia('LOCAL'), 'Local');
    assert.equal(etiquetaAnestesia(null), null);
  });
  it('ojo se muestra OD / OS / OU conservando el código OI', () => {
    assert.equal(etiquetaOjo('OI'), 'OS');
    assert.equal(etiquetaOjo('OD'), 'OD');
    assert.equal(etiquetaOjo(null), '');
    assert.deepEqual(OJOS_CIRUGIA.map((o) => o.value), ['OD', 'OI', 'OU']);
    assert.match(OJOS_CIRUGIA[1].label, /^OS/);
  });
});

describe('cirugía (punto I.2)', () => {
  it('tipo de LIO: las 4 combinaciones del documento', () => {
    assert.deepEqual(TIPOS_LIO.map((t) => t.label), ['Monofocal tórico', 'Monofocal no tórico', 'Trifocal tórico', 'Trifocal no tórico']);
    assert.equal(tipoLioDe('TRIFOCAL', true)?.value, 'TRIFOCAL_TORICO');
    assert.equal(tipoLioDe('MONOFOCAL', false)?.value, 'MONOFOCAL_NO_TORICO');
    assert.equal(tipoLioDe(null, true), undefined);
    assert.equal(tipoLioDe('MONOFOCAL', null), undefined);
  });
  it('detecta procedimientos con LIO por nombre', () => {
    for (const n of ['FACO + LIO', 'Facoemulsificación con LIO', 'Cirugía de catarata', 'faco']) assert.equal(esProcedimientoConLio(n), true, n);
    for (const n of ['Vitrectomía', 'Revisión Bajo Anestesia por Ojo', 'Trabeculectomía', null]) assert.equal(esProcedimientoConLio(n), false, String(n));
  });
  it('personal de apoyo: instrumentista, enfermero, circulante', () => {
    assert.deepEqual(ROLES_PERSONAL.map((r) => r.value), ['instrumentista', 'enfermero', 'circulante']);
  });
});

describe('tipo de consulta: edición en el detalle', () => {
  it('ida y vuelta BD ↔ tipo de la agenda', () => {
    for (const t of TIPOS_CONSULTA_AGENDA) {
      const bd = valoresBdTipoConsulta(t.value);
      assert.equal(tipoAgendaDesdeBd(bd.tipo_consulta, bd.tipo_visita), t.value);
    }
    assert.deepEqual(valoresBdTipoConsulta('SUBSECUENTE'), { tipo_consulta: 'CONSULTA', tipo_visita: 'SUBSECUENTE' });
    assert.equal(tipoAgendaDesdeBd('REVISION', 'PRIMERA_VEZ'), 'PRIMERA');
  });
});
