/**
 * Notificaciones push en el navegador (solo cliente). Ver src/services/push.ts.
 *
 * Estados del dispositivo:
 * - 'no_soportado': navegador sin Web Push (p. ej. iPhone fuera de la app instalada).
 * - 'sin_configurar': el servidor no tiene claves VAPID.
 * - 'bloqueado': el usuario negó el permiso (solo se reactiva desde el navegador).
 * - 'pendiente': aún no se ha pedido permiso.
 * - 'activo' / 'inactivo': permiso concedido, con o sin suscripción registrada.
 */
export type EstadoPush = 'no_soportado' | 'sin_configurar' | 'bloqueado' | 'pendiente' | 'activo' | 'inactivo';

interface InfoServidor {
  disponible: boolean;
  publicKey: string | null;
  registrada: boolean;
  discreta: boolean;
}

export function soportaPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function esIOS(): boolean {
  return typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

export function esAppInstalada(): boolean {
  return typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true);
}

/** Registro del service worker (en desarrollo no hay SW: null tras 3 s). */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!soportaPush()) return null;
  const existente = await navigator.serviceWorker.getRegistration();
  if (existente?.active) return existente;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 3000)),
  ]);
}

async function infoServidor(endpoint?: string): Promise<InfoServidor | null> {
  try {
    const q = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    const r = await fetch(`/api/notificaciones/push${q}`, { credentials: 'same-origin', cache: 'no-store' });
    return r.ok ? ((await r.json()) as InfoServidor) : null;
  } catch {
    return null;
  }
}

function claveABytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registrarEnServidor(sub: PushSubscription, discreta?: boolean): Promise<void> {
  const r = await fetch('/api/notificaciones/push', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sub.toJSON(), ...(discreta !== undefined ? { discreta } : {}) }),
  });
  if (!r.ok) throw new Error('No se pudo registrar este dispositivo');
}

export async function estadoPush(): Promise<{ estado: EstadoPush; discreta: boolean }> {
  if (!soportaPush()) return { estado: 'no_soportado', discreta: false };
  if (Notification.permission === 'denied') return { estado: 'bloqueado', discreta: false };
  const reg = await registro();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  const info = await infoServidor(sub?.endpoint);
  if (!info?.disponible || !info.publicKey) return { estado: 'sin_configurar', discreta: false };
  if (Notification.permission === 'default') return { estado: 'pendiente', discreta: false };
  return { estado: sub && info.registrada ? 'activo' : 'inactivo', discreta: info.discreta };
}

/**
 * Pide permiso (debe llamarse desde un toque del usuario) y registra el dispositivo.
 * Devuelve el estado final.
 */
export async function activarPush(discreta?: boolean): Promise<EstadoPush> {
  if (!soportaPush()) return 'no_soportado';
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permiso === 'denied') return 'bloqueado';
  if (permiso !== 'granted') return 'pendiente';
  const reg = await registro();
  if (!reg) return 'no_soportado';
  const actual = await reg.pushManager.getSubscription();
  const info = await infoServidor(actual?.endpoint);
  if (!info?.disponible || !info.publicKey) return 'sin_configurar';
  const sub =
    actual ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(info.publicKey) as BufferSource }));
  await registrarEnServidor(sub, discreta);
  return 'activo';
}

/**
 * Con el permiso ya concedido: asegura que este dispositivo esté registrado para
 * el usuario actual (p. ej. tras iniciar sesión con otra cuenta). Silencioso.
 */
export async function sincronizarPush(): Promise<void> {
  try {
    if (!soportaPush() || Notification.permission !== 'granted') return;
    const reg = await registro();
    if (!reg) return;
    const actual = await reg.pushManager.getSubscription();
    const info = await infoServidor(actual?.endpoint);
    if (!info?.disponible || !info.publicKey) return;
    if (actual && info.registrada) return;
    const sub = actual ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(info.publicKey) as BufferSource }));
    await registrarEnServidor(sub);
  } catch {
    // best-effort
  }
}

export async function cambiarModoDiscreto(discreta: boolean): Promise<void> {
  const reg = await registro();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) throw new Error('Este dispositivo no tiene notificaciones activas');
  const r = await fetch('/api/notificaciones/push', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, discreta }),
  });
  if (!r.ok) throw new Error('No se pudo guardar el cambio');
}

/**
 * Da de baja este dispositivo (desactivar o cerrar sesión): deja de recibir
 * avisos con datos de pacientes. `keepalive` para que se complete aunque la
 * página navegue a /login.
 */
export async function desactivarPush(): Promise<void> {
  try {
    if (!soportaPush()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    await fetch('/api/notificaciones/push', {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  } catch {
    // best-effort
  }
}

export async function enviarPrueba(): Promise<void> {
  const r = await fetch('/api/notificaciones/push/prueba', { method: 'POST', credentials: 'same-origin' });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error || 'No se pudo enviar la prueba');
  }
}
