import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leerPorLotes } from '../supabase/leer-por-lotes';

/** Simula PostgREST: corta cada petición a `maxRows` filas aunque el rango pida más. */
function fuente(total: number, maxRows = 1000) {
  const filas = Array.from({ length: total }, (_, i) => i);
  const llamadas: Array<[number, number]> = [];
  const construir = () => ({
    range: async (desde: number, hasta: number) => {
      llamadas.push([desde, hasta]);
      return { data: filas.slice(desde, Math.min(hasta + 1, desde + maxRows)), error: null };
    },
  });
  return { construir, llamadas };
}

describe('lib/supabase/leer-por-lotes', () => {
  it('lee más de 1000 filas sin perder ninguna (antes se cortaba en 1000)', async () => {
    const { construir, llamadas } = fuente(2345);
    const r = await leerPorLotes(construir);
    assert.equal(r.data.length, 2345);
    assert.deepEqual(r.data.slice(-1), [2344]);
    assert.equal(r.truncado, false);
    assert.equal(llamadas.length, 3);
  });
  it('múltiplo exacto del lote: una petición extra vacía y sin truncar', async () => {
    const { construir, llamadas } = fuente(2000);
    const r = await leerPorLotes(construir);
    assert.equal(r.data.length, 2000);
    assert.equal(r.truncado, false);
    assert.equal(llamadas.length, 3);
  });
  it('respeta el tope pedido y marca truncado', async () => {
    const { construir } = fuente(5000);
    const r = await leerPorLotes(construir, 1500);
    assert.equal(r.data.length, 1500);
    assert.equal(r.truncado, true);
  });
  it('fuente pequeña: una sola petición', async () => {
    const { construir, llamadas } = fuente(37);
    const r = await leerPorLotes(construir, 100);
    assert.equal(r.data.length, 37);
    assert.equal(llamadas.length, 1);
  });
  it('propaga el error de Supabase', async () => {
    const r = await leerPorLotes(() => ({ range: async () => ({ data: null, error: { message: 'x' } }) }));
    assert.deepEqual(r.error, { message: 'x' });
  });
});
