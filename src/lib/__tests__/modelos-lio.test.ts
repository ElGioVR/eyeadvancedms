import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coincideConModelo, etiquetaModeloLio, filtrarModelosPorTipo, parsearCsvModelosLio, PLANTILLA_CSV_MODELOS_LIO } from '../catalogos/modelos-lio';

describe('catálogo de modelos de LIO', () => {
  it('parsea la plantilla oficial', () => {
    const r = parsearCsvModelosLio(PLANTILLA_CSV_MODELOS_LIO);
    assert.deepEqual(r.errores, []);
    assert.deepEqual(r.filas, [{ fabricante: 'Alcon', modelo: 'Clareon PanOptix Toric CNATT2', diseno: 'TRIFOCAL', torico: true }]);
  });

  it('acepta «;» de Excel, acentos, mayúsculas, columnas en otro orden y comillas', () => {
    const csv = '﻿Tórico;Modelo;Diseño;Marca\nNo;"AcrySof; SA60AT";MONOFOCAL;Alcon\nsí;AT LISA tri toric 939MP;Trifocal;Zeiss\n';
    const r = parsearCsvModelosLio(csv);
    assert.deepEqual(r.errores, []);
    assert.deepEqual(r.filas.map((f) => [f.fabricante, f.modelo, f.diseno, f.torico]), [
      ['Alcon', 'AcrySof; SA60AT', 'MONOFOCAL', false],
      ['Zeiss', 'AT LISA tri toric 939MP', 'TRIFOCAL', true],
    ]);
  });

  it('reporta errores por línea sin detener el resto', () => {
    const r = parsearCsvModelosLio('fabricante,modelo,diseno,torico\n,X,mono,no\nA,B,xyz,no\nA,C,edof,quizá\nA,D,mono,no\nA,d,mono,no\n');
    assert.equal(r.filas.length, 1);
    assert.equal(r.errores.length, 4);
    assert.match(r.errores[0], /Línea 2/);
    assert.match(r.errores[3], /repetida/);
  });

  it('exige las 4 columnas', () => {
    assert.match(parsearCsvModelosLio('fabricante,modelo\nA,B').errores[0], /Faltan columnas: diseno, torico/);
    assert.match(parsearCsvModelosLio('').errores[0], /vacío/);
  });

  it('filtra por tipo de LIO de la cirugía (diseño × tórico) y solo activos', () => {
    const ms = [
      { id: '1', diseno: 'TRIFOCAL', torico: true, activo: true },
      { id: '2', diseno: 'TRIFOCAL', torico: false, activo: true },
      { id: '3', diseno: 'MONOFOCAL', torico: true, activo: true },
      { id: '4', diseno: 'TRIFOCAL', torico: true, activo: false },
    ] as const;
    assert.deepEqual(filtrarModelosPorTipo([...ms], 'TRIFOCAL', true).map((m) => m.id), ['1']);
    assert.deepEqual(filtrarModelosPorTipo([...ms], 'MONOFOCAL', false).map((m) => m.id), []);
  });

  it('etiqueta: añade «(tórico)» solo si el nombre no lo dice', () => {
    assert.equal(etiquetaModeloLio({ fabricante: 'Alcon', modelo: 'PanOptix Toric', torico: true }), 'Alcon — PanOptix Toric');
    assert.equal(etiquetaModeloLio({ fabricante: 'Zeiss', modelo: 'AT LISA tri 939MP', torico: true }), 'Zeiss — AT LISA tri 939MP (tórico)');
  });
});

describe('pieza del inventario ↔ modelo del catálogo', () => {
  const envista = { fabricante: 'Bausch + Lomb', modelo: 'enVista Aspire MX60ET Toric' };
  it('coincide por fabricante y código aunque cambien espacios y símbolos', () => {
    assert.equal(coincideConModelo({ marca: 'Bausch & Lomb', modelo: 'MX60ET' }, envista), true);
    assert.equal(coincideConModelo({ marca: 'BAUSCH+LOMB', modelo: 'mx60et' }, envista), true);
    assert.equal(coincideConModelo({ marca: 'Alcon', modelo: 'CNATT2' }, { fabricante: 'Alcon', modelo: 'Clareon PanOptix Toric CNATT2' }), true);
  });
  it('no coincide con otro modelo o fabricante', () => {
    assert.equal(coincideConModelo({ marca: 'Alcon', modelo: 'CNATT2' }, envista), false);
    assert.equal(coincideConModelo({ marca: 'Bausch + Lomb', modelo: 'MX60E' + 'Z' }, envista), false);
    assert.equal(coincideConModelo({ marca: 'Bausch + Lomb', modelo: null }, envista), false);
  });
});
