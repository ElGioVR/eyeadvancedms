import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INACTIVIDAD_MS, decidirSesion, etiquetaDispositivo, sesionVigente, sessionIdDeToken } from '../sesion-unica';

const AHORA = Date.parse('2026-10-01T18:00:00Z');
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

describe('lib/sesion-unica decidirSesion', () => {
  it('sin sesión registrada → libre', () => {
    assert.equal(decidirSesion({ activaId: null, vistaAt: null, nuevaId: 'b', ahoraMs: AHORA }), 'libre');
  });
  it('misma sesión → misma', () => {
    assert.equal(decidirSesion({ activaId: 'a', vistaAt: hace(1000), nuevaId: 'a', ahoraMs: AHORA }), 'misma');
  });
  it('otra sesión activa reciente → ocupada (la primera tiene prioridad)', () => {
    assert.equal(decidirSesion({ activaId: 'a', vistaAt: hace(60_000), nuevaId: 'b', ahoraMs: AHORA }), 'ocupada');
  });
  it('otra sesión inactiva más de 15 min → libre', () => {
    assert.equal(decidirSesion({ activaId: 'a', vistaAt: hace(INACTIVIDAD_MS + 1), nuevaId: 'b', ahoraMs: AHORA }), 'libre');
  });
  it('sin registro de actividad → libre', () => {
    assert.equal(decidirSesion({ activaId: 'a', vistaAt: null, nuevaId: 'b', ahoraMs: AHORA }), 'libre');
  });
});

describe('lib/sesion-unica sesionVigente', () => {
  it('acepta sin registro o sin claim', () => {
    assert.equal(sesionVigente(null, 'x'), true);
    assert.equal(sesionVigente('a', null), true);
  });
  it('rechaza una sesión reemplazada', () => {
    assert.equal(sesionVigente('a', 'b'), false);
    assert.equal(sesionVigente('a', 'a'), true);
  });
});

describe('lib/sesion-unica utilidades', () => {
  it('lee session_id del JWT', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', session_id: 'abc-123' })).toString('base64url');
    assert.equal(sessionIdDeToken(`h.${payload}.f`), 'abc-123');
    assert.equal(sessionIdDeToken('basura'), null);
  });
  it('etiqueta de dispositivo', () => {
    assert.equal(
      etiquetaDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'),
      'Chrome · Windows'
    );
    assert.equal(
      etiquetaDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
      'Safari · iPhone/iPad'
    );
  });
});
