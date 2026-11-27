import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDeNegocio } from '../supabase/handle-error';

// Sentry JAVASCRIPT-NEXTJS-11: «El LIO seleccionado no tiene piezas disponibles» (RAISE del RPC
// crear_cirugia, código P0001) se respondía 500 y se reportaba como error.
describe('mensajeDeNegocio', () => {
  it('validación del RPC (P0001) → mensaje para el usuario', () => {
    const msg = 'El LIO seleccionado no tiene piezas disponibles (stock menos reservas)';
    assert.equal(mensajeDeNegocio({ code: 'P0001', message: msg }), msg);
  });
  it('errores técnicos no se tratan como de negocio', () => {
    assert.equal(mensajeDeNegocio({ code: '23505', message: 'duplicate key value violates unique constraint' }), null);
    assert.equal(mensajeDeNegocio({ code: 'P0001', message: 'relation "x" does not exist' }), null);
    assert.equal(mensajeDeNegocio(null), null);
  });
});
