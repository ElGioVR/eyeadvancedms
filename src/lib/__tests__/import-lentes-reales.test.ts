import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarLio } from '../import-lentes-puro';

/** Valores reales de la columna LIO del Excel de cirugías (2026). */
const resumen = (t: string) =>
  interpretarLio(t).lentes.map((a) => `${a.orden[0]}:${a.marca}|${a.poder}|${a.torico ? `T${a.cilindro ?? a.modelo ?? '?'}` : ''}`).join(' ');

test('valores reales con coma decimal, espacios y mayúsculas', () => {
  assert.equal(resumen('ISERT 24,5/CT LUCIA 26,0'), 'P:ISERT|24.5| R:CT LUCIA|26|');
  assert.equal(resumen('Isert 22.5/CT LUCIA  24.0'), 'P:Isert|22.5| R:CT LUCIA|24|');
  assert.equal(resumen('CT LUCIA 23,5'), 'P:CT LUCIA|23.5|');
  assert.equal(resumen('Clareon  25.50 D '), 'P:Clareon|25.5|');
});

test('errores de captura: «Iser», «autonomie», poder 2.05 y +1.5', () => {
  assert.equal(resumen('Iser 21.5/CT LUCIA 23.0'), 'P:Isert|21.5| R:CT LUCIA|23|');
  assert.equal(resumen('20.5 autonomie'), 'P:Autonomy|20.5|');
  assert.ok(interpretarLio('Isert 2.05/CT LUCIA 22.0').pendientes.some((p) => /poder/.test(p)));
  assert.equal(interpretarLio('CT LUCIA +1.5').lentes[0].marca, 'CT LUCIA');
});

test('tóricos reales', () => {
  assert.equal(resumen('MX60 20.0 CYL 2.0'), 'P:MX60|20|T2');
  assert.equal(resumen('MX60 23.5 X 1.25 '), 'P:MX60|23.5|T1.25');
  assert.equal(resumen('CLAREON 20.5 T3'), 'P:Clareon|20.5|TT3');
  assert.ok(interpretarLio('Clareon 21.5, cyl 0@58').pendientes.some((p) => /cilindro/.test(p)));
});

test('texto que no es lente: horarios, notas y celdas vacías', () => {
  assert.equal(interpretarLio('Lunes 28 4 pm').lentes.length, 0);
  assert.equal(interpretarLio('(LA POS US)').lentes.length, 0);
  assert.equal(interpretarLio('Pend. Torico').pendientes[0], 'cálculo del lente pendiente');
  assert.deepEqual(interpretarLio(' ').pendientes, []);
  assert.equal(resumen('21 (peribulbar)'), 'P:|21|');
});
