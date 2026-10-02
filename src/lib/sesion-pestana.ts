/**
 * Una sola pestaña activa por navegador (complemento de la sesión única entre
 * dispositivos: las pestañas de un mismo navegador comparten cookie y, por lo
 * tanto, la misma sesión de Supabase; esto se controla en el cliente).
 *
 * Reglas puras (pruebas en src/lib/__tests__/sesion-pestana.test.ts):
 * - La pestaña que llegó primero conserva la prioridad.
 * - Una pestaña nueva queda bloqueada hasta que el usuario elija «Trabajar aquí».
 * - Si la pestaña activa deja de dar señales por más de PESTANA_INACTIVA_MS
 *   (se cerró o el navegador la suspendió), la nueva entra sin preguntar.
 */

export const CLAVE_PESTANA_ACTIVA = 'ea_pestana_activa';
export const LATIDO_PESTANA_MS = 4_000;
/**
 * Holgado a propósito: Chrome reduce los temporizadores de pestañas ocultas a
 * 1 vez por minuto tras 5 min en segundo plano; con menos margen, una pestaña
 * activa pero oculta perdería la prioridad sin que nadie la tomara.
 * El cierre normal (pagehide) libera la prioridad al instante.
 */
export const PESTANA_INACTIVA_MS = 90_000;

export interface RegistroPestana {
  id: string;
  ts: number;
}

export function leerRegistro(valor: string | null): RegistroPestana | null {
  if (!valor) return null;
  try {
    const r = JSON.parse(valor) as Partial<RegistroPestana>;
    return typeof r.id === 'string' && typeof r.ts === 'number' ? { id: r.id, ts: r.ts } : null;
  } catch {
    return null;
  }
}

/** 'activa' = esta pestaña puede trabajar; 'bloqueada' = otra tiene la prioridad. */
export function decidirPestana(registro: RegistroPestana | null, miId: string, ahoraMs: number): 'activa' | 'bloqueada' {
  if (!registro || registro.id === miId) return 'activa';
  return ahoraMs - registro.ts > PESTANA_INACTIVA_MS ? 'activa' : 'bloqueada';
}

/** Segundos que se muestra «Cerrando sesión…» antes de cerrar la ventana desplazada. */
export const AVISO_CIERRE_MS = 3_000;

/** Evento de ventana: el servidor avisó que otro dispositivo tomó la sesión. */
export const EVENTO_SESION_REEMPLAZADA = 'ea:sesion-reemplazada';

/** sessionStorage: esta ventana acaba de iniciar sesión → toma la prioridad sin preguntar. */
export const CLAVE_TOMAR_PESTANA = 'ea_tomar_pestana';
