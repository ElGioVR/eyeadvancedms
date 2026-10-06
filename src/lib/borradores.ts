'use client';

/**
 * Borradores de formularios largos (nueva consulta / nueva cirugía) en el
 * navegador, para no perder la captura por un error, recarga o sesión
 * vencida. Caducan a las 12 h y se borran al cerrar sesión manualmente
 * (equipos compartidos de la clínica).
 */
export const PREFIJOS_BORRADOR = ['draft:', 'autosave:'];
export const CADUCIDAD_BORRADOR_MS = 12 * 60 * 60 * 1000;

export interface Borrador<T> {
  v: 1;
  ts: number;
  datos: T;
}

export function leerBorrador<T>(clave: string): Borrador<T> | null {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const b = JSON.parse(raw) as Borrador<T>;
    if (!b || b.v !== 1 || typeof b.ts !== 'number' || Date.now() - b.ts > CADUCIDAD_BORRADOR_MS) {
      localStorage.removeItem(clave);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

export function guardarBorrador<T>(clave: string, datos: T): void {
  try {
    const b: Borrador<T> = { v: 1, ts: Date.now(), datos };
    localStorage.setItem(clave, JSON.stringify(b));
  } catch {
    // Cuota llena o almacenamiento bloqueado: el formulario sigue funcionando.
  }
}

export function borrarBorrador(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento */
  }
}

/** Al cerrar sesión: elimina todos los borradores (pueden tener datos de pacientes). */
export function borrarTodosLosBorradores(): void {
  try {
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PREFIJOS_BORRADOR.some((p) => k.startsWith(p))) claves.push(k);
    }
    claves.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* sin almacenamiento */
  }
}
