import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clasificarPieza, coincideConModelo, coincideConModeloInventario } from '../catalogos/modelos-lio';

// Reporte de clínica: los doctores no podían asignar a su paciente lentes dados de alta en el inventario
// porque la cirugía no «reconocía» la pieza: el inventario usa el código del fabricante y el
// nombre comercial en otro campo, y el catálogo usa el nombre oficial.
const catalogo = [
  { fabricante: 'Alcon', modelo: 'Clareon Monofocal', diseno: 'MONOFOCAL' as const, torico: false, activo: true },
  { fabricante: 'Alcon', modelo: 'Clareon Toric', diseno: 'MONOFOCAL' as const, torico: true, activo: true },
  { fabricante: 'Alcon', modelo: 'Clareon PanOptix Toric', diseno: 'TRIFOCAL' as const, torico: true, activo: true },
  { fabricante: 'Johnson & Johnson', modelo: 'Tecnis Eyhance', diseno: 'MONOFOCAL' as const, torico: false, activo: true },
];
const clareonMono = { marca: 'Alcon', modelo: 'CNA0T0', producto: 'Clareon Monofocal IOL' };
const panoptixToric = { marca: 'ALCON', modelo: 'CNWTT3', producto: 'Clareon PanOptix Toric IOL' };
const eyhance = { marca: 'J&J', modelo: 'ICB00', producto: 'TECNIS Eyhance' };

describe('asignar LIO desde inventario', () => {
  it('replica el bug: la regla anterior no reconocía las piezas', () => {
    assert.equal(coincideConModelo(clareonMono, catalogo[0]), false);
    assert.equal(coincideConModelo(panoptixToric, catalogo[2]), false);
    assert.equal(coincideConModelo(eyhance, catalogo[3]), false);
  });
  it('ahora las reconoce por nombre comercial y alias de fabricante', () => {
    assert.equal(coincideConModeloInventario(clareonMono, catalogo[0]), true);
    assert.equal(coincideConModeloInventario(panoptixToric, catalogo[2]), true);
    assert.equal(coincideConModeloInventario(eyhance, catalogo[3]), true);
  });
  it('no confunde modelos distintos', () => {
    assert.equal(coincideConModeloInventario(clareonMono, catalogo[2]), false);
    assert.equal(coincideConModeloInventario(panoptixToric, catalogo[0]), false);
    assert.equal(coincideConModeloInventario(clareonMono, catalogo[3]), false);
    assert.equal(coincideConModeloInventario({ marca: 'Alcon', modelo: null, producto: null }, catalogo[0]), false);
  });
  it('clasifica la pieza (monofocal / trifocal, tórico)', () => {
    assert.deepEqual(clasificarPieza(clareonMono, catalogo), { diseno: 'MONOFOCAL', torico: false });
    assert.deepEqual(clasificarPieza(panoptixToric, catalogo), { diseno: 'TRIFOCAL', torico: true });
    assert.deepEqual(clasificarPieza({ marca: 'Hoya', modelo: 'XY1', producto: 'Vivinex Toric' }, catalogo), { diseno: 'OTRO', torico: true });
    assert.equal(clasificarPieza({ marca: 'Hoya', modelo: 'XY1', producto: null }, catalogo), null);
  });
});
