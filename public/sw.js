/*
 * Service worker EyeAdvanced
 * Seguridad: NUNCA se cachean páginas HTML, payloads RSC ni respuestas /api,
 * porque contienen datos clínicos (PHI) que quedarían en el dispositivo tras
 * cerrar sesión. Solo se cachean assets estáticos públicos y versionados.
 */
const CACHE_NAME = 'ea-v3';
const PRECACHE = ['/icons/icon-192.png', '/icons/icon-512.png', '/images/logo-eye.png'];

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;
background:#0f273d;color:#e6eaf0;text-align:center}p{opacity:.7}button{margin-top:16px;padding:10px 18px;
border:0;border-radius:12px;background:#1f86c2;color:#fff;font-weight:600}</style></head>
<body><div><h1>Sin conexión</h1><p>Revisa tu internet e inténtalo de nuevo.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purga cachés anteriores (ea-v2 guardaba HTML con datos de pacientes)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function cacheFirst(request) {
  return caches.match(request).then(
    (cached) =>
      cached ||
      fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets con hash de contenido: inmutables → cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Imágenes/íconos públicos
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API: siempre red; respuesta JSON clara si no hay conexión
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: 'Sin conexión' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    return;
  }

  // Navegación: siempre red, sin guardar; página offline genérica si falla
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      )
    );
  }
  // Resto (RSC, etc.): comportamiento por defecto del navegador, sin caché del SW
});
