/**
 * Filtros de privacidad para Sentry (cliente y servidor).
 *
 * La app maneja datos clínicos (PHI). A Sentry solo debe llegar contexto
 * técnico: tipo de error, stack, ruta sin query string, id del usuario.
 * - Sin cuerpos de peticiones, cookies ni headers.
 * - URLs sin query string (las búsquedas llevan nombres de pacientes).
 * - Mensajes de error recortados.
 */
import type { Breadcrumb, ErrorEvent, TransactionEvent } from '@sentry/core';

const HEADERS_PERMITIDOS = new Set(['user-agent', 'content-type', 'x-request-id']);

/** Quita query string y fragmento de una URL (absoluta o relativa). */
export function limpiarUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function limpiarRequest(req: ErrorEvent['request']): ErrorEvent['request'] {
  if (!req) return req;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (HEADERS_PERMITIDOS.has(k.toLowerCase())) headers[k] = v;
  }
  return { url: limpiarUrl(req.url), method: req.method, headers };
}

export function limpiarEvento<E extends ErrorEvent | TransactionEvent>(evento: E): E {
  evento.request = limpiarRequest(evento.request);
  if (evento.user) evento.user = { id: evento.user.id };
  if (evento.transaction) evento.transaction = limpiarUrl(evento.transaction);
  // Los "extra" y contextos libres pueden traer datos de formularios.
  delete evento.extra;
  if (evento.contexts) {
    delete (evento.contexts as Record<string, unknown>).state;
    delete (evento.contexts as Record<string, unknown>).redux;
  }
  for (const ex of evento.exception?.values || []) {
    if (ex.value && ex.value.length > 300) ex.value = `${ex.value.slice(0, 300)}…`;
  }
  if (evento.breadcrumbs) evento.breadcrumbs = evento.breadcrumbs.map(limpiarBreadcrumb).filter(Boolean) as Breadcrumb[];
  if ('spans' in evento && Array.isArray(evento.spans)) {
    for (const s of evento.spans) {
      const d = s.data as Record<string, unknown> | undefined;
      if (!d) continue;
      for (const k of ['url', 'http.url', 'http.query', 'url.full', 'url.query', 'db.statement']) {
        if (typeof d[k] === 'string') d[k] = k.includes('query') || k === 'db.statement' ? '[filtrado]' : limpiarUrl(d[k] as string);
      }
      if (typeof s.description === 'string') s.description = limpiarUrl(s.description);
    }
  }
  return evento;
}

export function limpiarBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  // console.* puede imprimir objetos con datos de pacientes.
  if (b.category === 'console') return null;
  // Texto de elementos clicados/escritos (nombres, diagnósticos).
  if (b.category === 'ui.input') return null;
  if (b.category === 'ui.click' && b.message) b.message = b.message.replace(/"[^"]*"/g, '"…"');
  if (b.data) {
    const d = { ...b.data };
    if (typeof d.url === 'string') d.url = limpiarUrl(d.url);
    if (typeof d.from === 'string') d.from = limpiarUrl(d.from);
    if (typeof d.to === 'string') d.to = limpiarUrl(d.to);
    b.data = d;
  }
  return b;
}

/** Opciones comunes de Sentry.init (DSN vacío = Sentry desactivado). */
export function opcionesSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '';
  return {
    dsn,
    enabled: !!dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_RATE ?? '0.1'),
    maxBreadcrumbs: 30,
    beforeSend: (e: ErrorEvent) => limpiarEvento(e),
    beforeSendTransaction: (e: TransactionEvent) => limpiarEvento(e),
    beforeBreadcrumb: (b: Breadcrumb) => limpiarBreadcrumb(b),
    ignoreErrors: [
      // Ruido del navegador / extensiones, no son fallos de la app
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      /^AbortError/,
    ],
  };
}
