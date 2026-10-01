import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarCie10,
  nombresEnTexto,
  construirIndiceCie10,
  insertarDiagnostico,
  normalizarCodigo,
  segmentoActual,
  ALIAS_CIE10,
} from '../catalogos/cie10';
import { DIAGNOSTICOS_CIE10, GRUPOS_CIE10 } from '../catalogos/cie10-oftalmologia-datos';

const indice = construirIndiceCie10(DIAGNOSTICOS_CIE10, GRUPOS_CIE10);
const codigos = (q: string, n = 5) => buscarCie10(indice, q, n).map((d) => d.codigo);

describe('catálogo CIE-10 H00-H59', () => {
  it('tiene los 307 registros, sin códigos repetidos y todos en H00-H59', () => {
    assert.equal(DIAGNOSTICOS_CIE10.length, 307);
    assert.equal(new Set(DIAGNOSTICOS_CIE10.map((r) => r[0])).size, 307);
    for (const [c, n, g] of DIAGNOSTICOS_CIE10) {
      assert.match(c, /^H[0-5]\d(\.\d)?\*?$/);
      assert.ok(n.length > 3 && !n.endsWith(','), `nombre inválido en ${c}`);
      assert.ok(GRUPOS_CIE10[g], `grupo inválido en ${c}`);
    }
  });
  it('corrige nombres partidos/truncados del documento fuente', () => {
    const nombre = (c: string) => DIAGNOSTICOS_CIE10.find((r) => r[0] === c)?.[1] ?? '';
    assert.ok(!DIAGNOSTICOS_CIE10.some((r) => /clasifi cadas|clasifica das/.test(r[1])));
    assert.match(nombre('H06*'), /clasificadas en otra parte$/);
    assert.match(nombre('H04.3'), /vías lagrimales$/);
    assert.match(nombre('H54.3'), /ambos ojos$/);
  });
  it('todos los alias apuntan a códigos existentes', () => {
    const existentes = new Set(DIAGNOSTICOS_CIE10.map((r) => r[0].replace('*', '')));
    for (const c of Object.keys(ALIAS_CIE10)) assert.ok(existentes.has(c), `alias sin código: ${c}`);
  });
});

describe('buscarCie10', () => {
  it('por código exacto, con o sin punto, y por prefijo', () => {
    assert.equal(codigos('H25.1')[0], 'H25.1');
    assert.equal(codigos('h251')[0], 'H25.1');
    assert.deepEqual(codigos('H40', 3), ['H40', 'H40.0', 'H40.1']);
    assert.equal(normalizarCodigo('H36.0*'), 'h360');
  });
  it('por texto sin acentos, en cualquier orden y en plural', () => {
    assert.equal(codigos('catarata nuclear')[0], 'H25.1');
    assert.equal(codigos('nuclear catarata')[0], 'H25.1');
    assert.equal(codigos('miopia')[0], 'H52.1');
    assert.equal(codigos('pterigion')[0], 'H11.0');
    assert.ok(codigos('cataratas seniles', 10).includes('H25'));
  });
  it('por prefijo de palabra mientras se escribe', () => {
    assert.ok(codigos('glauc angulo abie')[0] === 'H40.1');
    assert.ok(codigos('desprend retina', 10).includes('H33.0'));
  });
  it('términos de uso diario (alias)', () => {
    assert.equal(codigos('ojo seco')[0], 'H04.1');
    assert.equal(codigos('DMAE')[0], 'H35.3');
    assert.equal(codigos('opacidad capsular')[0], 'H26.4');
    assert.equal(codigos('chalazion')[0], 'H00.1');
    assert.equal(codigos('retinopatia diabetica')[0], 'H36.0*');
  });
  it('vacío o sin coincidencias devuelve []', () => {
    assert.deepEqual(buscarCie10(indice, '   '), []);
    assert.deepEqual(buscarCie10(indice, 'xyzzy'), []);
  });
  it('respeta el límite', () => {
    assert.equal(buscarCie10(indice, 'trastorno', 4).length, 4);
  });
});

describe('inserción en el campo de texto', () => {
  const d = { codigo: 'H25.1', nombre: 'Catarata senil nuclear' };
  it('segmentoActual toma la línea actual (o lo que sigue a un ; escrito a mano)', () => {
    assert.equal(segmentoActual('Miopía\ncatar').consulta, 'catar');
    assert.equal(segmentoActual('Miopía; catar').consulta, 'catar');
    assert.equal(segmentoActual('catar').consulta, 'catar');
  });
  it('inserta solo el nombre, sin código ni separador', () => {
    assert.deepEqual(insertarDiagnostico('catar', d), { texto: 'Catarata senil nuclear', cursor: 22 });
    assert.equal(insertarDiagnostico('Miopía\ncatar', d).texto, 'Miopía\nCatarata senil nuclear');
  });
  it('reemplaza una línea intermedia sin tocar el resto', () => {
    const t = 'catar\nMiopía';
    assert.equal(insertarDiagnostico(t, d, 3).texto, 'Catarata senil nuclear\nMiopía');
  });
  it('no excede el máximo de la columna', () => {
    const largo = 'x'.repeat(490) + '\ncatar';
    assert.ok(insertarDiagnostico(largo, d, largo.length, 500).texto.length <= 500);
  });
  it('nombresEnTexto detecta los ya elegidos', () => {
    const s = nombresEnTexto('Catarata senil nuclear\nMiopía');
    assert.ok(s.has('catarata senil nuclear') && s.has('miopia'));
  });
});
