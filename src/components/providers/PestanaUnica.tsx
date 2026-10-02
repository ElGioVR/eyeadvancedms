'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SWRConfig } from 'swr';
import { Loader2, LogIn, LogOut, MonitorSmartphone } from 'lucide-react';
import {
  AVISO_CIERRE_MS,
  CLAVE_PESTANA_ACTIVA,
  CLAVE_TOMAR_PESTANA,
  EVENTO_SESION_REEMPLAZADA,
  LATIDO_PESTANA_MS,
  decidirPestana,
  leerRegistro,
  type RegistroPestana,
} from '@/lib/sesion-pestana';

/**
 * - activa: se trabaja normalmente.
 * - bloqueada: pestaña nueva mientras otra tiene la prioridad → «Trabajar aquí».
 * - cerrando: otra pestaña (o dispositivo) tomó la sesión → aviso unos segundos.
 * - cerrada: la app se desmonta en esta ventana (sin datos ni peticiones).
 */
type Estado = 'activa' | 'bloqueada' | 'cerrando' | 'cerrada';
type Motivo = 'pestana' | 'dispositivo';

function nuevoId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* sin crypto */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** undefined = el navegador no deja usar localStorage (modo privado estricto): sin control. */
function leer(): RegistroPestana | null | undefined {
  try {
    return leerRegistro(window.localStorage.getItem(CLAVE_PESTANA_ACTIVA));
  } catch {
    return undefined;
  }
}

function escribir(id: string): void {
  try {
    window.localStorage.setItem(CLAVE_PESTANA_ACTIVA, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* sin storage */
  }
}

/**
 * Una sola ventana/pestaña activa del sistema por navegador («Trabajar aquí»).
 * La primera conserva la prioridad; una nueva queda en espera hasta que el
 * usuario la elija. Entonces la anterior muestra «Cerrando sesión…» y se
 * cierra: la app se desmonta en esa ventana (sin datos visibles ni peticiones).
 * La cookie no se borra porque la comparten todas las pestañas del navegador;
 * borrarla cerraría también la ventana nueva.
 * También muestra el aviso cuando el servidor informa que OTRO dispositivo
 * tomó la sesión (lib/fetcher.ts → EVENTO_SESION_REEMPLAZADA).
 *
 * Hidratación: el primer render siempre es 'activa' (igual en servidor y
 * cliente); el estado real se decide en useEffect.
 */
export default function PestanaUnica({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>('activa');
  const [motivo, setMotivo] = useState<Motivo>('pestana');
  const estadoRef = useRef<Estado>('activa');
  const idRef = useRef('');
  const cierreRef = useRef<number | null>(null);

  const cambiar = useCallback((e: Estado) => {
    estadoRef.current = e;
    setEstado(e);
  }, []);

  /** Otra ventana tomó la sesión: aviso y cierre de esta. */
  const cerrarEstaVentana = useCallback(
    (m: Motivo) => {
      if (estadoRef.current === 'cerrando' || estadoRef.current === 'cerrada') return;
      setMotivo(m);
      cambiar('cerrando');
      if (m === 'dispositivo') return; // fetcher.ts cierra la sesión y lleva al login
      cierreRef.current = window.setTimeout(() => {
        cambiar('cerrada');
        // Solo funciona si la ventana la abrió un script; si no, queda la pantalla de cierre.
        try {
          window.close();
        } catch {
          /* el navegador no lo permite */
        }
      }, AVISO_CIERRE_MS);
    },
    [cambiar],
  );

  const [tomando, setTomando] = useState(false);

  /**
   * «Trabajar aquí»: 1) esta ventana toma la prioridad (la otra se pausa al
   * instante y se cierra); 2) el servidor emite una sesión nueva para esta
   * ventana y revoca la anterior, así la ventana desplazada queda sin token
   * válido. Desde 'cerrada' la app vuelve a montarse y SWR revalida: datos al día.
   */
  const trabajarAqui = useCallback(async () => {
    if (!idRef.current || tomando) return;
    setTomando(true);
    escribir(idRef.current);
    try {
      const res = await fetch('/api/auth/sesion/ventana', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) console.error('[pestana] no se pudo renovar la sesión', res.status);
    } catch (err) {
      console.error('[pestana] no se pudo renovar la sesión', err);
    }
    setTomando(false);
    cambiar('activa');
  }, [cambiar, tomando]);

  /** Ventana cerrada → login (la sesión de esta ventana ya fue revocada). */
  const irALogin = useCallback(() => {
    window.location.assign('/login?motivo=otra-ventana');
  }, []);

  useEffect(() => {
    const id = nuevoId();
    idRef.current = id;

    const evaluar = () => {
      const r = leer();
      if (r === undefined) return; // sin storage: no se controla
      // Recién iniciada la sesión en esta ventana (login): toma la prioridad.
      let recienEntro = false;
      try {
        recienEntro = window.sessionStorage.getItem(CLAVE_TOMAR_PESTANA) === '1';
        if (recienEntro) window.sessionStorage.removeItem(CLAVE_TOMAR_PESTANA);
      } catch {
        /* sin storage */
      }
      if (recienEntro || decidirPestana(r, id, Date.now()) === 'activa') {
        escribir(id);
        cambiar('activa');
      } else {
        cambiar('bloqueada');
      }
    };
    evaluar();

    const otraTomo = () => {
      const r = leer();
      return !!r && r.id !== id && decidirPestana(r, id, Date.now()) === 'bloqueada';
    };

    // Latido de la pestaña activa; si otra tomó el control, esta se cierra.
    const latido = window.setInterval(() => {
      if (estadoRef.current !== 'activa') return;
      if (leer() === undefined) return;
      if (otraTomo()) cerrarEstaVentana('pestana');
      else escribir(id);
    }, LATIDO_PESTANA_MS);

    const alCambiarStorage = (e: StorageEvent) => {
      if (e.key !== CLAVE_PESTANA_ACTIVA && e.key !== null) return;
      const r = leerRegistro(e.newValue);
      if (estadoRef.current === 'activa') {
        if (r && r.id !== id) cerrarEstaVentana('pestana');
      } else if (estadoRef.current === 'bloqueada' && !r) {
        // La ventana con prioridad se cerró: esta sigue sin preguntar.
        escribir(id);
        cambiar('activa');
      }
    };

    // Al cerrar o recargar, se libera la prioridad (la recarga la vuelve a tomar).
    const alOcultar = () => {
      if (estadoRef.current !== 'activa') return;
      try {
        if (leer()?.id === id) window.localStorage.removeItem(CLAVE_PESTANA_ACTIVA);
      } catch {
        /* sin storage */
      }
    };
    const alMostrar = (e: PageTransitionEvent) => {
      if (e.persisted && estadoRef.current === 'activa') evaluar(); // volvió desde la caché atrás/adelante
    };
    // Al volver a la pestaña: latido inmediato (los temporizadores ocultos se frenan).
    const alVisibilidad = () => {
      if (document.visibilityState !== 'visible' || estadoRef.current !== 'activa') return;
      if (otraTomo()) cerrarEstaVentana('pestana');
      else if (leer() !== undefined) escribir(id);
    };
    const alReemplazoDispositivo = () => cerrarEstaVentana('dispositivo');

    window.addEventListener('storage', alCambiarStorage);
    window.addEventListener('pagehide', alOcultar);
    window.addEventListener('pageshow', alMostrar);
    window.addEventListener(EVENTO_SESION_REEMPLAZADA, alReemplazoDispositivo);
    document.addEventListener('visibilitychange', alVisibilidad);
    return () => {
      window.clearInterval(latido);
      if (cierreRef.current) window.clearTimeout(cierreRef.current);
      window.removeEventListener('storage', alCambiarStorage);
      window.removeEventListener('pagehide', alOcultar);
      window.removeEventListener('pageshow', alMostrar);
      window.removeEventListener(EVENTO_SESION_REEMPLAZADA, alReemplazoDispositivo);
      document.removeEventListener('visibilitychange', alVisibilidad);
      alOcultar();
    };
  }, [cambiar, cerrarEstaVentana]);

  const donde = motivo === 'dispositivo' ? 'otro dispositivo' : 'otra ventana';

  // Ventana cerrada: la app se desmonta (no quedan datos de pacientes en pantalla).
  if (estado === 'cerrada') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
            <LogOut className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-extrabold text-fg">Sesión cerrada en esta ventana</h1>
          <p className="mt-2 text-sm text-muted">
            Se está trabajando en {donde}, por eso tu sesión aquí se cerró. Ya puedes cerrar esta pestaña.
          </p>
          <button
            type="button"
            onClick={irALogin}
            autoFocus
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700"
          >
            <LogIn className="h-4 w-4" /> Ir a iniciar sesión
          </button>
          <button
            type="button"
            onClick={trabajarAqui}
            disabled={tomando}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 text-sm font-bold text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            {tomando && <Loader2 className="h-4 w-4 animate-spin" />} Trabajar aquí
          </button>
        </div>
      </div>
    );
  }

  return (
    <SWRConfig value={{ isPaused: () => estadoRef.current !== 'activa' }}>
      {children}
      {estado === 'cerrando' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cierre-titulo"
          aria-live="assertive"
        >
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary-600" />
            <h2 id="cierre-titulo" className="text-lg font-extrabold text-fg">Cerrando sesión…</h2>
            <p className="mt-2 text-sm text-muted">
              Se está trabajando en {donde}. Esta ventana se cerrará en unos segundos.
            </p>
          </div>
        </div>
      )}
      {estado === 'bloqueada' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pestana-titulo"
        >
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <MonitorSmartphone className="h-6 w-6" />
            </div>
            <h2 id="pestana-titulo" className="text-lg font-extrabold text-fg">El sistema ya está abierto en otra ventana</h2>
            <p className="mt-2 text-sm text-muted">
              Solo se puede trabajar en una a la vez. Si trabajas aquí, la sesión de la otra se cerrará automáticamente.
            </p>
            <button
              type="button"
              onClick={trabajarAqui}
              disabled={tomando}
              autoFocus
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {tomando && <Loader2 className="h-4 w-4 animate-spin" />} Trabajar aquí
            </button>
          </div>
        </div>
      )}
    </SWRConfig>
  );
}
