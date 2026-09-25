import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNombre, parseCsv, formatBytes, getInitials } from '../text';
import { handleSupabaseError } from '../supabase/handle-error';

describe('lib/text normalizeNombre', () => {
  it('minúsculas sin acentos', () => {
    assert.equal(normalizeNombre('María de los Ángeles'), 'maria de los angeles');
  });
  it('colapsa espacios dobles y recorta extremos', () => {
    assert.equal(normalizeNombre('  NOMBRE  DE PACIENTE '), 'nombre de paciente');
  });
  it('elimina diacríticos descompuestos', () => {
    assert.equal(normalizeNombre('Iñigo\u0301'), 'inigo');
  });
});

describe('lib/text parseCsv', () => {
  it('parsea filas simples con coma', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('soporta separador ;', () => {
    assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  });
  it('respeta comillas con coma dentro', () => {
    assert.deepEqual(parseCsv('"Servicio, con coma",B'), [['Servicio, con coma', 'B']]);
  });
  it('comilla escapada "" dentro de campo', () => {
    assert.deepEqual(parseCsv('"dijo ""hola""",x'), [['dijo "hola"', 'x']]);
  });
  it('elimina BOM UTF-8', () => {
    assert.deepEqual(parseCsv('\uFEFFa,b'), [['a', 'b']]);
  });
  it('CRLF y filas vacías se descartan', () => {
    assert.deepEqual(parseCsv('a,b\r\n\r\n1,2\n\n'), [['a', 'b'], ['1', '2']]);
  });
  it('archivo solo con espacios se descarta', () => {
    assert.deepEqual(parseCsv('   \n   '), []);
  });
  it('CR sin LF corta fila', () => {
    assert.deepEqual(parseCsv('a,b\rc,d'), [['a', 'b'], ['c', 'd']]);
  });
  it('campo vacío en medio se conserva', () => {
    assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
  });
});

describe('lib/text formatBytes', () => {
  it('0 → 0 B', () => assert.equal(formatBytes(0), '0 B'));
  it('KB y MB con 2 decimales', () => {
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(23267), '22.72 KB');
    assert.equal(formatBytes(1048576), '1 MB');
  });
});

describe('lib/text getInitials', () => {
  it('dos palabras', () => assert.equal(getInitials('Juan Pérez'), 'JP'));
  it('una palabra', () => assert.equal(getInitials('Bayardo'), 'B'));
  it('null → fallback', () => assert.equal(getInitials(null), '??'));
  it('string vacío → fallback', () => assert.equal(getInitials(''), '??'));
  it('fallback custom', () => assert.equal(getInitials(undefined, '--'), '--'));
});

describe('lib/supabase/handle-error', () => {
  it('traduce errores conocidos', () => {
    const r = handleSupabaseError({ message: 'duplicate key value violates unique constraint' }, 'test');
    assert.equal(r.traducido, true);
  });
  it('errores desconocidos → mensaje genérico + log con contexto', () => {
    const r = handleSupabaseError({ message: ' XYZ raro', code: 'P0001' }, 'modulo.x');
    assert.equal(r.traducido, false);
    assert.equal(r.mensaje, 'Error interno del servidor');
  });
  it('error null/undefined no revienta', () => {
    const r = handleSupabaseError(null, 'test');
    assert.equal(r.mensaje, 'Error interno del servidor');
  });
});
