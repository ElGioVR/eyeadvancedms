import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarBreadcrumb, limpiarEvento, limpiarUrl } from '../sentry-privacidad';

test('limpiarUrl quita query string y fragmento (búsquedas con nombres de pacientes)', () => {
  assert.equal(limpiarUrl('/api/search?q=Juan%20P%C3%A9rez'), '/api/search');
  assert.equal(limpiarUrl('https://x.app/pacientes/1#datos'), 'https://x.app/pacientes/1');
  assert.equal(limpiarUrl('/agenda'), '/agenda');
  assert.equal(limpiarUrl(undefined), undefined);
});

test('limpiarEvento elimina cuerpo, cookies, headers sensibles, extra y datos del usuario', () => {
  const e = limpiarEvento({
    type: undefined,
    request: {
      url: '/api/pacientes?search=Ana',
      method: 'POST',
      data: { nombre_completo: 'Ana López' },
      cookies: { sb: 'token' },
      headers: { authorization: 'Bearer x', 'user-agent': 'Chrome', cookie: 'a=b' },
      query_string: 'search=Ana',
    },
    user: { id: 'u1', email: 'ana@x.com', ip_address: '1.2.3.4' },
    extra: { formulario: { diagnostico: 'Catarata' } },
    exception: { values: [{ type: 'Error', value: 'x'.repeat(500) }] },
    breadcrumbs: [
      { category: 'console', message: 'paciente Ana' },
      { category: 'fetch', data: { url: '/api/search?q=Ana' } },
    ],
  } as never) as unknown as Record<string, any>;
  assert.deepEqual(e.request, { url: '/api/pacientes', method: 'POST', headers: { 'user-agent': 'Chrome' } });
  assert.deepEqual(e.user, { id: 'u1' });
  assert.equal(e.extra, undefined);
  assert.ok(e.exception.values[0].value.length <= 301);
  assert.equal(e.breadcrumbs.length, 1);
  assert.equal(e.breadcrumbs[0].data.url, '/api/search');
});

test('limpiarBreadcrumb descarta console e inputs y oculta textos clicados', () => {
  assert.equal(limpiarBreadcrumb({ category: 'console', message: 'x' }), null);
  assert.equal(limpiarBreadcrumb({ category: 'ui.input', message: 'x' }), null);
  const b = limpiarBreadcrumb({ category: 'ui.click', message: 'button[aria-label="Ver consulta de Ana López"]' });
  assert.equal(b?.message, 'button[aria-label="…"]');
  const nav = limpiarBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b?q=Ana' } });
  assert.deepEqual(nav?.data, { from: '/a', to: '/b' });
});
