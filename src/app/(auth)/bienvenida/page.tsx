'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { refreshUser } from '@/hooks/useUser';
import { prefetchJSON } from '@/lib/prefetch';
import { cn } from '@/lib/utils';
import { tomarOrigenLogo } from '@/lib/transicion-bienvenida';

// useLayoutEffect solo en el cliente (en SSR React avisa si se usa).
const useLayoutEffectCliente = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Tiempo mínimo en pantalla (deja ver la animación) y máximo (nunca bloquea). */
const MIN_MS = 1600;
const MAX_MS = 12000;
const TAREA_TIMEOUT_MS = 8000;
/** Tras este tiempo se ofrece "Entrar ahora" por si la red está lenta. */
const MOSTRAR_ATAJO_MS = 5000;

type Estado = 'pendiente' | 'cargando' | 'listo';

const PASOS = [
  { id: 'sesion', label: 'Verificando tu sesión' },
  { id: 'panel', label: 'Cargando tu panel' },
  { id: 'modulos', label: 'Precargando módulos' },
  { id: 'datos', label: 'Sincronizando indicadores' },
] as const;
type PasoId = (typeof PASOS)[number]['id'];

const ESTADO_INICIAL: Record<PasoId, Estado> = {
  sesion: 'cargando',
  panel: 'pendiente',
  modulos: 'pendiente',
  datos: 'pendiente',
};

interface PerfilMin {
  rol: string;
  modo_focus: boolean;
}

/** Módulos (rutas) que ve cada rol en el menú. El dashboard va en su propio paso. */
function modulosPara(u: PerfilMin | null): string[] {
  const rutas = ['/pacientes', '/agenda', '/inventario', '/configuracion'];
  if (!u) return rutas;
  if (u.rol === 'enfermero') return ['/agenda', '/pacientes', '/configuracion', '/mi-perfil'];
  if (u.rol === 'admin') rutas.push('/productividad');
  if (u.rol === 'doctor' || u.modo_focus) rutas.push('/mis-honorarios', '/mi-perfil');
  return rutas;
}

/**
 * Datos iniciales de cada módulo, con la MISMA URL que piden al montar
 * (useFetch / fetch) para que la consuman con takePrefetched() sin repetir la request.
 */
function datosPara(u: PerfilMin | null): string[] {
  // Enfermería: solo lo que puede abrir (sin dashboard, inventario condicionado ni aseguranzas)
  if (u?.rol === 'enfermero') return ['/api/notificaciones/unread-count', '/api/pacientes?page=1&pageSize=15'];
  const urls = [
    '/api/dashboard/charts',
    '/api/notificaciones/unread-count',
    '/api/pacientes?page=1&pageSize=15',
    '/api/inventario?page=1&pageSize=15',
    '/api/configuracion/aseguranzas',
  ];
  if (u?.rol === 'admin' || u?.rol === 'recepcionista') urls.push('/api/consultas?page=1&pageSize=15');
  return urls;
}

/** ¿La entrada de Performance corresponde al prefetch RSC de `ruta`? */
function esPrefetchDe(ruta: string) {
  return (url: string) => {
    try {
      const u = new URL(url, window.location.origin);
      return u.pathname === ruta && u.searchParams.has('_rsc');
    } catch {
      return false;
    }
  };
}

/** Ejecuta tareas con concurrencia limitada. */
async function enLotes<T>(items: T[], limite: number, fn: (item: T) => Promise<void>) {
  const cola = [...items];
  const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    while (cola.length) {
      const item = cola.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(trabajadores);
}

const TIMEOUT = Symbol('timeout');
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Resuelve cuando el navegador termina de descargar un recurso que cumple `match`
 * (se usa para saber cuándo terminó el prefetch RSC de una ruta en producción).
 */
function esperarRecurso(match: (url: string) => boolean, ms: number): Promise<boolean> {
  if (typeof PerformanceObserver === 'undefined') return esperar(ms).then(() => false);
  return new Promise((resolve) => {
    let hecho = false;
    let obs: PerformanceObserver | null = null;
    const fin = (ok: boolean) => {
      if (hecho) return;
      hecho = true;
      obs?.disconnect();
      clearTimeout(t);
      resolve(ok);
    };
    const t = setTimeout(() => fin(false), ms);
    try {
      obs = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => match(e.name))) fin(true);
      });
      obs.observe({ type: 'resource', buffered: true });
    } catch {
      fin(false);
    }
  });
}

/**
 * Pantalla de bienvenida = precarga real antes de entrar:
 * 1) Sesión + perfil (queda en la caché compartida de useUser → el shell pinta al instante).
 * 2) Panel: en producción, prefetch completo del RSC de /dashboard (Next lo guarda 5 min);
 *    en desarrollo (donde Next no hace prefetch) se pide la página para que compile antes.
 * 3) Módulos del menú según rol (pacientes, agenda, inventario, configuración, productividad…).
 * 4) Datos iniciales que cada módulo pide al montar (listas, gráficas, notificaciones).
 * La barra avanza de forma continua hacia el siguiente hito aunque un paso tarde;
 * nunca se queda atorada (MAX_MS + botón "Entrar ahora").
 */
export default function BienvenidaPage() {
  const router = useRouter();
  const [estados, setEstados] = useState<Record<PasoId, Estado>>(ESTADO_INICIAL);
  const [saliendo, setSaliendo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [progreso, setProgreso] = useState(0.04);
  const [mostrarAtajo, setMostrarAtajo] = useState(false);
  const [modulos, setModulos] = useState({ hechos: 0, total: 0 });
  const iniciado = useRef(false);
  const navegoRef = useRef(false);
  const estadosRef = useRef(estados);
  estadosRef.current = estados;
  const ojoRef = useRef<HTMLDivElement>(null);
  const flipHecho = useRef(false);

  // Llegada desde el login: el ojo arranca exactamente donde estaba el logo del
  // login y vuela a su lugar (FLIP) antes del primer pintado → sin saltos.
  useLayoutEffectCliente(() => {
    if (flipHecho.current) return;
    flipHecho.current = true;
    const origen = tomarOrigenLogo();
    const el = ojoRef.current;
    if (!origen || !el || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.style.animation = 'none'; // sin la apertura normal: el ojo ya viene abierto
    const destino = el.getBoundingClientRect();
    const escala = origen.w / destino.width;
    const dx = origen.x + origen.w / 2 - (destino.left + destino.width / 2);
    const dy = origen.y + origen.h / 2 - (destino.top + destino.height / 2);
    const vuelo = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${escala})` },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: 850, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
    vuelo.onfinish = () => {
      el.style.animation = 'welcomeBlink 3.2s ease-in-out 0.4s both';
    };
  }, []);

  const entrar = useCallback(
    (destino = '/dashboard') => {
      if (navegoRef.current) return;
      navegoRef.current = true;
      setProgreso(1);
      setSaliendo(true);
      setTimeout(() => router.replace(destino), 280);
      // Red de seguridad: si la navegación del cliente no termina (en desarrollo la
      // primera compilación del panel puede tardar o fallar) la pantalla quedaba en
      // negro sobre /bienvenida. Pasados 6 s se hace una navegación completa.
      setTimeout(() => {
        if (window.location.pathname.startsWith('/bienvenida')) window.location.assign(destino);
      }, 6000);
    },
    [router],
  );

  // Barra "viva": se acerca suavemente al siguiente hito mientras el paso actual carga
  useEffect(() => {
    const id = setInterval(() => {
      const hechos = PASOS.filter((p) => estadosRef.current[p.id] === 'listo').length;
      const tope = hechos === PASOS.length ? 1 : (hechos + 0.85) / PASOS.length;
      setProgreso((prev) => (prev >= tope ? prev : prev + Math.max(0.004, (tope - prev) * 0.08)));
    }, 120);
    const atajo = setTimeout(() => setMostrarAtajo(true), MOSTRAR_ATAJO_MS);
    return () => {
      clearInterval(id);
      clearTimeout(atajo);
    };
  }, []);

  useEffect(() => {
    // Red de seguridad: se programa siempre (también tras el doble montaje de StrictMode)
    const tope = setTimeout(() => entrar(), MAX_MS);
    if (iniciado.current) return () => clearTimeout(tope);
    iniciado.current = true;

    const marcar = (id: PasoId, e: Estado) => setEstados((prev) => ({ ...prev, [id]: e }));
    const inicio = Date.now();
    const esProduccion = process.env.NODE_ENV === 'production';

    (async () => {
      // 1. Sesión y perfil
      const user = await conTimeout(refreshUser(), TAREA_TIMEOUT_MS);
      if (user === null) {
        // 401 explícito: no hay sesión
        entrar('/login');
        return;
      }
      if (user !== TIMEOUT) setNombre(user.nombre.split(' ')[0] || '');
      marcar('sesion', 'listo');

      // 2, 3 y 4 en paralelo
      marcar('panel', 'cargando');
      marcar('modulos', 'cargando');
      marcar('datos', 'cargando');

      const perfil: PerfilMin | null = user === TIMEOUT ? null : user;

      /**
       * Precarga una ruta:
       * - Producción: prefetch completo del RSC (JS + payload del servidor, en caché 5 min);
       *   se espera a que el navegador termine de descargarlo.
       * - Desarrollo: Next no hace prefetch → se pide la página para que compile ya.
       */
      const precargarRuta = (ruta: string): Promise<unknown> => {
        if (esProduccion) {
          const listo = esperarRecurso(esPrefetchDe(ruta), TAREA_TIMEOUT_MS);
          router.prefetch(ruta);
          return listo;
        }
        return fetch(ruta, { credentials: 'same-origin' }).catch(() => null);
      };

      const panel = (async () => {
        await Promise.all([
          conTimeout(precargarRuta('/dashboard'), TAREA_TIMEOUT_MS),
          import('@/components/dashboard/DashboardCharts').catch(() => null),
        ]);
        marcar('panel', 'listo');
      })();

      const rutas = modulosPara(perfil);
      setModulos({ hechos: 0, total: rutas.length });
      const modulosListos = (async () => {
        // En dev compilar es pesado: de 2 en 2 para no saturar el servidor
        const trabajo = enLotes(rutas, esProduccion ? rutas.length : 2, async (ruta) => {
          await precargarRuta(ruta);
          setModulos((m) => ({ ...m, hechos: Math.min(m.total, m.hechos + 1) }));
        });
        // No bloquea más de TAREA_TIMEOUT_MS: lo que falte sigue en segundo plano
        await conTimeout(trabajo, TAREA_TIMEOUT_MS);
        marcar('modulos', 'listo');
      })();

      const datos = (async () => {
        await conTimeout(Promise.all(datosPara(perfil).map((u) => prefetchJSON(u))), TAREA_TIMEOUT_MS);
        marcar('datos', 'listo');
      })();

      await Promise.all([panel, modulosListos, datos]);
      const restante = MIN_MS - (Date.now() - inicio);
      if (restante > 0) await esperar(restante);
      entrar();
    })();

    return () => clearTimeout(tope);
  }, [router, entrar]);

  const completados = PASOS.filter((p) => estados[p.id] === 'listo').length;

  return (
    <div
      className={cn(
        'welcome-bg relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden transition-opacity duration-300',
        saliendo && 'opacity-0',
      )}
    >
      {/* Luces ambientales */}
      {/* Degradados radiales en vez de `blur-3xl`: en iOS Safari un filter: blur()
          animado debajo del texto deja recuadros oscuros alrededor de cada línea. */}
      {/* Aparecen suaves (solo opacidad): al llegar desde el login el fondo base
          ya es el mismo, así que las luces se «encienden» sobre él. */}
      <div className="welcome-fade-soft pointer-events-none absolute inset-0">
        <div className="welcome-blob welcome-blob--a absolute -left-40 -top-40 h-[34rem] w-[34rem]" />
        <div className="welcome-blob welcome-blob--alt absolute -bottom-48 -right-32 h-[38rem] w-[38rem]" />
      </div>
      <div className="welcome-grid pointer-events-none absolute inset-0" />

      <div className="relative flex flex-col items-center px-6">
        {/* Ojo + ondas */}
        <div className="relative flex h-48 w-48 items-center justify-center sm:h-60 sm:w-60">
          <span className="welcome-ring" />
          <span className="welcome-ring" style={{ animationDelay: '0.9s' }} />
          <span className="welcome-ring" style={{ animationDelay: '1.8s' }} />
          <span className="welcome-halo absolute inset-6 rounded-full" />

          <div ref={ojoRef} className="welcome-eye relative h-28 w-28 sm:h-32 sm:w-32">
            <img
              src="/images/logo-eye.png"
              alt="EyeAdvanced"
              className="h-full w-full select-none object-contain drop-shadow-[0_6px_24px_rgba(125,211,252,0.35)]"
              draggable={false}
            />
            <span aria-hidden className="welcome-shine absolute inset-0" />
          </div>
        </div>

        <div className="welcome-fade mt-4 flex flex-col items-center gap-5 text-center" style={{ animationDelay: '0.6s' }}>
          <div>
            {/* Palabra por palabra; el nombre entra cuando llega el perfil */}
            <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              <span className="welcome-word" style={{ animationDelay: '0.65s' }}>
                {nombre ? 'Bienvenido,' : 'Bienvenido'}
              </span>
              {nombre && (
                <>
                  {' '}
                  <span key={nombre} className="welcome-word text-cyan-200" style={{ animationDelay: '0.8s' }}>
                    {nombre}
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-sm text-white/60">
              <span className="welcome-word" style={{ animationDelay: '0.9s' }}>Preparando tu espacio de trabajo</span>
            </p>
          </div>

          {/* Progreso real de la precarga */}
          <div
            className="h-1 w-56 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Cargando"
            aria-valuemin={0}
            aria-valuemax={PASOS.length}
            aria-valuenow={completados}
          >
            <div
              className="h-full origin-left rounded-full bg-gradient-to-r from-cyan-300 to-white transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${progreso})` }}
            />
          </div>

          <ul className="flex flex-col gap-2 text-left" aria-live="polite">
            {PASOS.map((p) => {
              const e = estados[p.id];
              return (
                <li
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 text-[13px] transition-colors duration-300',
                    e === 'listo' ? 'text-white/85' : e === 'cargando' ? 'text-white/70' : 'text-white/35',
                  )}
                >
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                    {e === 'listo' ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300 text-primary-950 animate-popIn">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : e === 'cargando' ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                    )}
                  </span>
                  {p.label}
                  {p.id === 'modulos' && modulos.total > 0 && (
                    <span className="tabular-nums text-white/40">
                      {modulos.hechos}/{modulos.total}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => entrar()}
            className={cn(
              'text-xs font-medium text-white/50 underline-offset-4 transition-opacity duration-500 hover:text-white hover:underline',
              mostrarAtajo && !saliendo ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            ¿Tarda mucho? Entrar ahora
          </button>
        </div>
      </div>

      <p
        className="welcome-fade absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] text-[11px] font-medium uppercase tracking-[0.25em] text-white/35"
        style={{ animationDelay: '1s' }}
      >
        EyeAdvanced · Medical Solutions
      </p>
    </div>
  );
}
