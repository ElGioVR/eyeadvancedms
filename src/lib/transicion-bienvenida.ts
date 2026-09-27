'use client';

/**
 * Transición compartida login → bienvenida («shared element» del logo).
 * El login guarda dónde estaba el ojo en pantalla; la bienvenida lo lee al
 * montarse y lo anima desde ahí hasta su posición final (técnica FLIP).
 */
const CLAVE = 'ea_transicion_logo';
const VIGENCIA_MS = 5000;

export interface RectLogo {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function guardarOrigenLogo(rect: RectLogo): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ ...rect, t: Date.now() }));
  } catch { /* almacenamiento bloqueado: la bienvenida usa su animación normal */ }
}

/** Devuelve (y borra) el origen si es reciente; null si no se llegó desde el login. */
export function tomarOrigenLogo(): RectLogo | null {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    if (!raw) return null;
    sessionStorage.removeItem(CLAVE);
    const d = JSON.parse(raw) as RectLogo & { t: number };
    if (!d || Date.now() - d.t > VIGENCIA_MS || !(d.w > 0 && d.h > 0)) return null;
    return { x: d.x, y: d.y, w: d.w, h: d.h };
  } catch {
    return null;
  }
}
