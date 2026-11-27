import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esItemLIO } from '../lio-item';

// Bug de producción: al completar la cirugía respondía «El ítem seleccionado no es un LIO» para
// los lentes dados de alta con el formulario actual (potencia en «sphere», sin «tipo»), así que
// la pieza nunca se descontaba del inventario.
describe('esItemLIO (descontar LIO al completar)', () => {
  it('acepta el esquema actual: potencia en sphere y sin tipo', () => {
    assert.equal(esItemLIO({ sphere: 24 }), true);
    assert.equal(esItemLIO({ sphere: null }), true);
  });
  it('sigue aceptando el esquema legacy', () => {
    assert.equal(esItemLIO({ tipo: 'LENTE_INTRAOCULAR' }), true);
    assert.equal(esItemLIO({ tipo: 'LENTE_VISION', tipo_lio: 'MONOFOCAL' }), true);
    assert.equal(esItemLIO({ tipo: 'LENTE_VISION', potencia_dioptrias: 21.5 }), true);
  });
  it('rechaza un lente de visión sin datos de LIO', () => {
    assert.equal(esItemLIO({ tipo: 'LENTE_VISION', tipo_lio: null, potencia_dioptrias: null, sphere: null }), false);
  });
});
