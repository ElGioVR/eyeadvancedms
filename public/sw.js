/*
 * Service worker EyeAdvanced
 * Seguridad: NUNCA se cachean páginas HTML, payloads RSC ni respuestas /api,
 * porque contienen datos clínicos (PHI) que quedarían en el dispositivo tras
 * cerrar sesión. Solo se cachean assets estáticos públicos y versionados.
 */
const CACHE_NAME = 'ea-v4';
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
  // Purga cachés anteriores (ea-v2 guardaba HTML con datos de pacientes; ea-v3 podía
  // guardar chunks sin hash)
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

  // Assets con hash de contenido: inmutables → cache-first.
  // Solo archivos realmente versionados (hash en el nombre o /media/): los chunks
  // sin hash (p. ej. webpack.js en desarrollo) nunca se sirven desde caché, o se
  // mezclarían versiones viejas y nuevas ("Cannot read properties of undefined (reading 'call')").
  if (url.pathname.startsWith('/_next/static/')) {
    const versionado =
      url.pathname.startsWith('/_next/static/media/') ||
      /[/.-][0-9a-f]{8,}\.(?:js|css|woff2?)$/i.test(url.pathname);
    if (versionado) event.respondWith(cacheFirst(request));
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

/* ───────────── Notificaciones push ─────────────
 * El servidor (src/services/push.ts) manda { titulo, cuerpo, url, tag, id, urgente }.
 * Al tocarla: se marca como leída y se abre la pantalla de la cita/cirugía,
 * reutilizando la ventana de la app si ya está abierta.
 */
self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch (e) {
    datos = { cuerpo: event.data ? event.data.text() : '' };
  }
  const titulo = datos.titulo || 'EyeAdvanced';
  const opciones = {
    body: datos.cuerpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: datos.tag || undefined,
    // Con el mismo tag (misma cita) reemplaza la anterior, pero vuelve a sonar.
    renotify: !!datos.tag,
    // Recordatorios de cita: se quedan en pantalla hasta que se atiendan.
    requireInteraction: !!datos.urgente,
    vibrate: datos.urgente ? [200, 100, 200] : [120],
    timestamp: Date.now(),
    data: { url: datos.url || '/dashboard', id: datos.id || null },
    actions: [{ action: 'abrir', title: 'Ver detalle' }],
  };
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const datos = event.notification.data || {};
  const destino = new URL(datos.url || '/dashboard', self.location.origin).href;

  const marcarLeida = datos.id
    ? fetch('/api/notificaciones', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [datos.id] }),
      }).catch(() => undefined)
    : Promise.resolve();

  const abrir = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (propia) {
      return propia
        .focus()
        .then((v) => (v && 'navigate' in v ? v.navigate(destino) : null))
        .catch(() => self.clients.openWindow(destino));
    }
    return self.clients.openWindow(destino);
  });

  event.waitUntil(Promise.all([marcarLeida, abrir]));
});

// El navegador renovó la suscripción (caducó o cambió la clave): se vuelve a registrar.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    fetch('/api/notificaciones/push', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((info) => {
        if (!info || !info.publicKey) return null;
        const pad = '='.repeat((4 - (info.publicKey.length % 4)) % 4);
        const raw = atob((info.publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
        const clave = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        return self.registration.pushManager
          .subscribe({ userVisibleOnly: true, applicationServerKey: clave })
          .then((sub) =>
            fetch('/api/notificaciones/push', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sub.toJSON()),
            })
          );
      })
      .catch(() => undefined)
  );
});
