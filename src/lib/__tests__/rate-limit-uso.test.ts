import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitarUso } from '../rate-limit';

test('limitarUso en memoria: permite hasta max y bloquea con tiempo de espera', async () => {
  const clave = `uso:prueba:${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal((await limitarUso(clave, 3, 60, false)).permitido, true);
  const r = await limitarUso(clave, 3, 60, false);
  assert.equal(r.permitido, false);
  assert.ok(r.reintentarEn > 0 && r.reintentarEn <= 60);
});

test('limitarUso: claves distintas no se afectan', async () => {
  const a = `uso:a:${Math.random()}`;
  const b = `uso:b:${Math.random()}`;
  await limitarUso(a, 1, 60, false);
  assert.equal((await limitarUso(a, 1, 60, false)).permitido, false);
  assert.equal((await limitarUso(b, 1, 60, false)).permitido, true);
});
