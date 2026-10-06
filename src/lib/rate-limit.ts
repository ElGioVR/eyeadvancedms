/**
 * Límite de intentos en memoria (por instancia). Ventana deslizante simple:
 * los fallos cuentan solo dentro de WINDOW_MS desde el primero; pasado ese
 * tiempo el contador se reinicia (antes se acumulaban indefinidamente).
 */
const attempts = new Map<string, { count: number; blockedUntil: number; firstAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (entry && entry.blockedUntil > 0 && entry.blockedUntil <= now) {
    attempts.delete(key);
  }

  return { allowed: true };
}

/** Evita crecimiento ilimitado del Map en procesos de larga vida. */
function prune(now: number) {
  if (attempts.size < 5000) return;
  attempts.forEach((v, k) => {
    if (v.blockedUntil <= now && now - v.firstAt > WINDOW_MS) attempts.delete(k);
  });
}

export function recordFailedAttempt(
  key: string,
  maxAttempts: number = MAX_ATTEMPTS,
): { blocked: boolean; retryAfter?: number } {
  const now = Date.now();
  prune(now);
  let entry = attempts.get(key);

  // Bloqueo cumplido o ventana vencida → empezar de cero
  if (entry && ((entry.blockedUntil > 0 && entry.blockedUntil <= now) || now - entry.firstAt > WINDOW_MS)) {
    attempts.delete(key);
    entry = undefined;
  }

  if (!entry) {
    entry = { count: 0, blockedUntil: 0, firstAt: now };
  }

  entry.count += 1;

  if (entry.count >= maxAttempts) {
    entry.blockedUntil = now + WINDOW_MS;
    attempts.set(key, entry);
    return { blocked: true, retryAfter: Math.ceil(WINDOW_MS / 1000) };
  }

  attempts.set(key, entry);
  return { blocked: false };
}

export function recordSuccessfulLogin(key: string): void {
  attempts.delete(key);
}

/* ────────────────────────────────────────────────────────────────────────
 * Límite COMPARTIDO entre instancias (Postgres, RPC `limite_tasa` de la
 * migración de performance). En Vercel cada instancia tiene su propio Map,
 * así que el límite en memoria se multiplica por el número de instancias.
 * Si la función aún no existe en la BD, se usa el límite en memoria de arriba.
 * ──────────────────────────────────────────────────────────────────────── */

type Accion = 'consultar' | 'fallo' | 'consumir';
interface ResultadoLimite {
  permitido: boolean;
  reintentarEn: number;
}

let rpcNoDisponibleHasta = 0;

/** Contadores en memoria para `consumir` (respaldo sin BD). */
const usos = new Map<string, { inicio: number; conteo: number; bloqueadoHasta: number }>();

function consumirEnMemoria(clave: string, max: number, ventanaSeg: number): ResultadoLimite {
  const ahora = Date.now();
  let e = usos.get(clave);
  if (e && e.bloqueadoHasta > ahora) return { permitido: false, reintentarEn: Math.ceil((e.bloqueadoHasta - ahora) / 1000) };
  if (!e || ahora - e.inicio > ventanaSeg * 1000) e = { inicio: ahora, conteo: 0, bloqueadoHasta: 0 };
  e.conteo += 1;
  if (e.conteo > max) e.bloqueadoHasta = ahora + ventanaSeg * 1000;
  usos.set(clave, e);
  if (usos.size > 5000) usos.forEach((v, k) => { if (v.bloqueadoHasta <= ahora && ahora - v.inicio > ventanaSeg * 1000) usos.delete(k); });
  return e.bloqueadoHasta > ahora
    ? { permitido: false, reintentarEn: Math.ceil((e.bloqueadoHasta - ahora) / 1000) }
    : { permitido: true, reintentarEn: 0 };
}

async function rpcLimite(clave: string, max: number, ventanaSeg: number, accion: Accion): Promise<ResultadoLimite | null> {
  if (Date.now() < rpcNoDisponibleHasta) return null;
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const { data, error } = await getSupabaseAdmin().rpc('limite_tasa', {
      p_clave: clave,
      p_max: max,
      p_ventana_seg: ventanaSeg,
      p_accion: accion,
    });
    if (error) {
      rpcNoDisponibleHasta = Date.now() + 5 * 60_000;
      return null;
    }
    const fila = (Array.isArray(data) ? data[0] : data) as { permitido?: boolean; reintentar_en?: number } | null;
    if (!fila || typeof fila.permitido !== 'boolean') return null;
    return { permitido: fila.permitido, reintentarEn: Number(fila.reintentar_en) || 0 };
  } catch {
    // BD lenta o caída: no bloquear el login por el limitador.
    rpcNoDisponibleHasta = Date.now() + 60_000;
    return null;
  }
}

/** ¿Alguna de las claves está bloqueada? Devuelve los segundos de espera (0 = libre). */
export async function bloqueoCompartido(claves: string[]): Promise<number> {
  const r = await Promise.all(claves.map((c) => rpcLimite(c, 1, 1, 'consultar')));
  let espera = 0;
  claves.forEach((c, i) => {
    const res = r[i] ?? (() => {
      const m = checkRateLimit(c);
      return { permitido: m.allowed, reintentarEn: m.retryAfter ?? 0 };
    })();
    if (!res.permitido) espera = Math.max(espera, res.reintentarEn);
  });
  return espera;
}

/** Registra un intento fallido; bloquea la clave al llegar a `max` dentro de la ventana. */
export async function falloCompartido(clave: string, max: number, ventanaSeg = 15 * 60): Promise<{ blocked: boolean; retryAfter?: number }> {
  const r = await rpcLimite(clave, max, ventanaSeg, 'fallo');
  if (!r) return recordFailedAttempt(clave, max);
  return r.permitido ? { blocked: false } : { blocked: true, retryAfter: r.reintentarEn };
}

/** Borra el contador de la clave (login exitoso). */
export async function reiniciarCompartido(clave: string): Promise<void> {
  recordSuccessfulLogin(clave);
  if (Date.now() < rpcNoDisponibleHasta) return;
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    await getSupabaseAdmin().rpc('reiniciar_limite', { p_clave: clave });
  } catch {
    // best-effort
  }
}

/**
 * Límite de uso por usuario para endpoints costosos (búsqueda, reportes,
 * import). `compartido = false` usa solo memoria (sin viaje a la BD: para
 * endpoints muy frecuentes y sensibles a la latencia, como la búsqueda).
 */
export async function limitarUso(
  clave: string,
  max: number,
  ventanaSeg: number,
  compartido = true,
): Promise<ResultadoLimite> {
  if (!compartido) return consumirEnMemoria(clave, max, ventanaSeg);
  return (await rpcLimite(clave, max, ventanaSeg, 'consumir')) ?? consumirEnMemoria(clave, max, ventanaSeg);
}
