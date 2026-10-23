'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { clearUserCache } from '@/hooks/useUser';
import { guardarOrigenLogo, type RectLogo } from '@/lib/transicion-bienvenida';
import { CLAVE_TOMAR_PESTANA } from '@/lib/sesion-pestana';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Activity, Users, FileText, ArrowRight, ShieldCheck, Check, MonitorSmartphone, Loader2 } from 'lucide-react';

const MAX_ATTEMPTS = 5;
// «Recordarme»: guarda el correo en este dispositivo y mantiene la sesión abierta.
const LS_RECORDAR = 'ea_login_recordar';
const LS_EMAIL = 'ea_login_email';

function leerLS(clave: string): string | null {
  try { return window.localStorage.getItem(clave); } catch { return null; }
}
function escribirLS(clave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch { /* modo privado / almacenamiento bloqueado */ }
}
const LOCKOUT_MS = 30_000;

const loginSlides = [
  {
    image: '/images/login-eyeadvanced.png',
    title: 'EyeAdvanced Medical Solutions',
    subtitle: 'Sistema de Gestión Clínica integral optimizado para especialistas oftalmológicos en Tijuana.',
    position: 'center',
  },
  {
    image: '/images/login-eyeadvanced-alt.png',
    title: 'Atención clínica especializada',
    subtitle: 'Una plataforma pensada para acompañar consultas, pacientes e inventario con precisión.',
    position: 'center',
  },
  {
    image: '/images/login-dr-felix.png',
    title: 'Equipo médico experto',
    subtitle: 'Operación diaria clara para una clínica oftalmológica moderna y confiable.',
    position: 'center',
  },
  {
    image: '/images/login-dr-bayardo.png',
    title: 'Gestión visual más simple',
    subtitle: 'Agenda, cobros, reportes y lentes en una experiencia limpia para el equipo clínico.',
    position: 'center',
  },
];

type ResumenPublico = {
  consultasHoy: number | null;
  consultasAyer: number | null;
  pacientesRegistrados: number | null;
  personalActivo: number | null;
  personalPorTipo: { medicos: number; enfermeros: number; anestesiologos: number } | null;
};

const formatoCifra = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-MX');

export default function LoginPage() {
  const [resumen, setResumen] = useState<ResumenPublico | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/publico/resumen-clinica', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ResumenPublico>) : null))
      .then((d) => { if (vivo && d) setResumen(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const variacion =
    resumen?.consultasHoy != null && resumen.consultasAyer
      ? Math.round(((resumen.consultasHoy - resumen.consultasAyer) / resumen.consultasAyer) * 100)
      : null;

  const router = useRouter();
  const [activeSlide, setActiveSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  // false hasta que React toma el control: antes de eso el botón queda deshabilitado
  // para que el navegador NUNCA envíe el formulario por su cuenta (lo mandaba por GET
  // con el correo y la contraseña en la URL cuando el JS aún no cargaba).
  const [hidratado, setHidratado] = useState(false);
  const [error, setError] = useState('');
  // Sesión única: aviso al volver por sesión tomada en otro dispositivo y
  // confirmación «Trabajar aquí» cuando la cuenta está abierta en otro lado.
  const [aviso, setAviso] = useState('');
  const [sesionPendiente, setSesionPendiente] = useState<{ dispositivo: string; desde: string | null } | null>(null);
  const [tomando, setTomando] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [footerYear, setFooterYear] = useState('');
  // Transición a /bienvenida: el fondo de la bienvenida se abre en círculo desde
  // el logo (móvil) o desde el botón (escritorio); el logo queda encima y la
  // bienvenida lo recoge en su lugar (ver lib/transicion-bienvenida).
  const [transicion, setTransicion] = useState<{ x: number; y: number; logo: RectLogo | null } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const marcaRef = useRef<HTMLDivElement>(null);
  // Escritorio (≥ lg): misma transición compartida desde la marca de la izquierda.
  const logoEscritorioRef = useRef<HTMLImageElement>(null);
  const marcaEscritorioRef = useRef<HTMLDivElement>(null);
  const [marcaRect, setMarcaRect] = useState<(RectLogo & { izquierda: boolean }) | null>(null);

  useEffect(() => {
    setHidratado(true);
    // Si alguna vez quedaron credenciales en la URL, se quitan de la barra y del historial.
    const qs = new URLSearchParams(window.location.search);
    if (qs.has('password') || qs.has('email')) {
      qs.delete('password');
      qs.delete('email');
      const limpia = qs.toString();
      window.history.replaceState(null, '', window.location.pathname + (limpia ? `?${limpia}` : ''));
    }
    setFooterYear(String(new Date().getFullYear()));
    // Preferencias guardadas (solo cliente, tras el montaje → sin problemas de hidratación)
    if (leerLS(LS_RECORDAR) === '1') {
      setRememberMe(true);
      const guardado = leerLS(LS_EMAIL);
      if (guardado) setEmail(guardado);
    }
    // Descarga anticipada de la pantalla de bienvenida: la transición tras login es inmediata
    router.prefetch('/bienvenida');
    const motivo = new URLSearchParams(window.location.search).get('motivo');
    if (motivo === 'otra-sesion') {
      setAviso('Tu sesión se cerró porque se inició en otro dispositivo.');
    } else if (motivo === 'otra-ventana') {
      setAviso('Tu sesión se cerró en esta ventana porque se está trabajando en otra. Si entras aquí, la otra se cerrará.');
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % loginSlides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  /** Tras un login aceptado: preferencias, transición y paso a /bienvenida. */
  const completarEntrada = useCallback(() => {
    if (rememberMe) {
      escribirLS(LS_RECORDAR, '1');
      escribirLS(LS_EMAIL, email.trim().toLowerCase());
    } else {
      escribirLS(LS_RECORDAR, null);
      escribirLS(LS_EMAIL, null);
    }
    clearUserCache();
    // Entrar con usuario y contraseña es elegir esta ventana: toma la prioridad
    // al llegar al panel (las demás ventanas del navegador se cierran).
    try { window.sessionStorage.setItem(CLAVE_TOMAR_PESTANA, '1'); } catch { /* sin storage */ }
    // Logo visible (cabecera móvil o marca de escritorio) → origen de la transición compartida.
    const rectVisible = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    };
    const logo = rectVisible(logoRef.current) ?? rectVisible(logoEscritorioRef.current);
    const marcaMovil = rectVisible(marcaRef.current);
    const marcaEscritorio = rectVisible(marcaEscritorioRef.current);
    setMarcaRect(
      marcaMovil ? { ...marcaMovil, izquierda: false } : marcaEscritorio ? { ...marcaEscritorio, izquierda: true } : null,
    );
    const b = submitRef.current?.getBoundingClientRect();
    setTransicion({
      x: logo ? logo.x + logo.w / 2 : b ? b.left + b.width / 2 : window.innerWidth / 2,
      y: logo ? logo.y + logo.h / 2 : b ? b.top + b.height / 2 : window.innerHeight / 2,
      logo,
    });
    if (logo) guardarOrigenLogo(logo);
    // Se navega cuando el círculo ya cubre la pantalla; la capa sigue visible
    // hasta que la bienvenida (mismo fondo) la reemplaza → sin salto.
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Con «reducir movimiento» la transición es un desvanecimiento (más corta).
    window.setTimeout(() => router.replace('/bienvenida'), reducido ? 520 : 820);
  }, [email, rememberMe, router]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLocked) {
      const remaining = Math.ceil((lockedUntil! - Date.now()) / 1000);
      setError(`Demasiados intentos. Espera ${remaining} segundos.`);
      return;
    }

    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, recordarme: rememberMe }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        if (data?.requiereConfirmacion) {
          // La cuenta está abierta en otro dispositivo: la primera sesión tiene prioridad.
          const desde = typeof data.desde === 'string' && data.desde
            ? new Date(data.desde).toLocaleString('es-MX', { timeZone: 'America/Tijuana', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
            : null;
          setSesionPendiente({ dispositivo: data.dispositivo || 'otro dispositivo', desde });
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS);
          setAttempts(0);
          setError(`Demasiados intentos. Espera 30 segundos.`);
        } else {
          setError(data?.error || 'Error al iniciar sesión. Intenta de nuevo.');
        }

        setLoading(false);
        return;
      }

      completarEntrada();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  }, [email, password, rememberMe, isLocked, lockedUntil, attempts, completarEntrada]);

  /** «Trabajar aquí»: esta sesión toma la prioridad y la otra se cierra sola. */
  const trabajarAqui = useCallback(async () => {
    if (tomando) return;
    setTomando(true);
    try {
      const res = await fetch('/api/auth/sesion/tomar', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'No se pudo activar la sesión.');
      }
      setSesionPendiente(null);
      setLoading(true);
      completarEntrada();
    } catch (err) {
      setSesionPendiente(null);
      setError(err instanceof Error ? err.message : 'No se pudo activar la sesión.');
    } finally {
      setTomando(false);
    }
  }, [tomando, completarEntrada]);

  /** Cancelar: se cierra solo esta sesión nueva; la otra sigue intacta. */
  const cancelarSesionNueva = useCallback(async () => {
    setSesionPendiente(null);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  }, []);

  const exito = transicion !== null;

  return (
    <>
      {sesionPendiente && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sesion-titulo">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <MonitorSmartphone className="h-6 w-6" />
            </div>
            <h2 id="sesion-titulo" className="text-lg font-extrabold text-slate-900 dark:text-white">Tu cuenta está abierta en otro dispositivo</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Sesión activa en <span className="font-bold">{sesionPendiente.dispositivo}</span>
              {sesionPendiente.desde ? <> desde el {sesionPendiente.desde}</> : null}.
              Si trabajas aquí, esa sesión se cerrará automáticamente.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={trabajarAqui}
                disabled={tomando}
                autoFocus
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {tomando && <Loader2 className="h-4 w-4 animate-spin" />}
                Trabajar aquí
              </button>
              <button
                type="button"
                onClick={cancelarSesionNueva}
                disabled={tomando}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {exito && (
        <div
          aria-hidden
          className="login-reveal welcome-bg"
          style={{ '--rx': `${transicion.x}px`, '--ry': `${transicion.y}px` } as React.CSSProperties}
        >
          <div className="welcome-grid absolute inset-0" />
          {!transicion.logo && <span className="login-reveal-glow" />}
        </div>
      )}
      {/* El logo y la marca quedan por encima del círculo, en su sitio exacto:
          el ojo espera a la bienvenida y los textos se despiden hacia arriba. */}
      {transicion?.logo && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[101]">
          <span
            className="login-onda"
            style={{ left: transicion.logo.x + transicion.logo.w / 2, top: transicion.logo.y + transicion.logo.h / 2 }}
          />
          <span
            className="login-onda"
            style={{ left: transicion.logo.x + transicion.logo.w / 2, top: transicion.logo.y + transicion.logo.h / 2, animationDelay: '0.32s' }}
          />
          <span
            className="login-logo-halo"
            style={{
              left: transicion.logo.x - transicion.logo.w * 0.6,
              top: transicion.logo.y - transicion.logo.h * 0.6,
              width: transicion.logo.w * 2.2,
              height: transicion.logo.h * 2.2,
            }}
          />
          <img
            src="/images/logo-eye.png"
            alt=""
            className="absolute select-none object-contain drop-shadow-[0_6px_20px_rgba(125,211,252,0.35)]"
            style={{ left: transicion.logo.x, top: transicion.logo.y, width: transicion.logo.w, height: transicion.logo.h }}
            draggable={false}
          />
          {marcaRect && (
            <div
              className={`login-marca-salida absolute flex flex-col ${marcaRect.izquierda ? 'items-start text-left' : 'items-center text-center'}`}
              style={{ left: marcaRect.x, top: marcaRect.y, width: marcaRect.w }}
            >
              <p className="text-xl font-extrabold tracking-tight text-white">EyeAdvanced</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Medical Solutions</p>
            </div>
          )}
        </div>
      )}

      {/* Escritorio (≥ lg): fondo de marca a pantalla completa, el MISMO de la
          bienvenida (luces, retícula) → la transición entre pantallas es continua. */}
      <div aria-hidden className={`welcome-bg pointer-events-none fixed inset-0 hidden overflow-hidden lg:block ${exito ? 'login-fondo-salida' : ''}`}>
        <div className="welcome-blob welcome-blob--a absolute -left-48 -top-48 h-[40rem] w-[40rem]" />
        <div className="welcome-blob welcome-blob--alt absolute -bottom-56 left-1/4 h-[44rem] w-[44rem]" />
        <div className="login-grid-escritorio absolute inset-0" />
      </div>

      {/* Left side — Form. Móvil: cabecera de marca + hoja inferior a pantalla completa.
          ≥ sm: tarjeta centrada como antes. */}
      <div className="relative z-10 w-full lg:w-[46%] xl:w-[44%] flex flex-col min-h-[100dvh] lg:min-h-screen bg-white dark:bg-canvas sm:bg-slate-50 sm:dark:bg-canvas lg:bg-transparent lg:dark:bg-transparent">
        {/* Cabecera de marca (solo móvil) */}
        <div className="login-hero relative shrink-0 overflow-hidden px-6 pb-14 pt-[calc(2.5rem+env(safe-area-inset-top))] sm:hidden">
          <div className="login-hero-grid pointer-events-none absolute inset-0" />
          <div className="relative flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
              <span className="login-hero-halo absolute inset-0 rounded-full" />
              <img
                ref={logoRef}
                src="/images/logo-eye.png"
                alt=""
                aria-hidden
                className="login-ojo-movil relative h-14 w-14 select-none object-contain drop-shadow-[0_6px_20px_rgba(125,211,252,0.35)]"
                draggable={false}
              />
            </div>
            <div ref={marcaRef} className="login-marca-movil flex flex-col items-center">
              <p className="text-xl font-extrabold tracking-tight text-white">EyeAdvanced</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Medical Solutions</p>
            </div>
          </div>
        </div>

        <div className="relative -mt-8 flex flex-1 items-start justify-center sm:mt-0 sm:items-center sm:overflow-y-auto sm:p-8 lg:flex-col lg:px-10 lg:py-10 xl:px-14">
          <div className="login-glow pointer-events-none absolute left-1/2 top-1/4 hidden h-72 w-72 -translate-x-1/2 rounded-full sm:block lg:hidden" />

          {/* Marca de escritorio: el ojo es el elemento compartido con la bienvenida */}
          <div className="login-entrada mb-8 hidden w-full max-w-[26rem] items-center gap-4 lg:flex" style={{ animationDelay: '0.05s' }}>
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <span className="login-hero-halo welcome-halo absolute -inset-2 rounded-full" />
              <img
                ref={logoEscritorioRef}
                src="/images/logo-eye.png"
                alt=""
                aria-hidden
                className="relative h-12 w-12 select-none object-contain drop-shadow-[0_6px_20px_rgba(125,211,252,0.35)]"
                draggable={false}
              />
            </div>
            <div ref={marcaEscritorioRef} className="flex flex-col">
              <p className="text-xl font-extrabold tracking-tight text-white">EyeAdvanced</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Medical Solutions</p>
            </div>
          </div>

          <div className={`login-tarjeta relative flex min-h-full w-full max-w-md flex-col rounded-t-[28px] bg-white px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8 dark:bg-canvas sm:min-h-0 sm:rounded-2xl sm:border sm:border-gray-200/80 sm:bg-white/95 sm:p-8 sm:shadow-xl sm:shadow-slate-900/5 sm:dark:border-white/10 sm:dark:bg-surface/95 sm:dark:shadow-black/30 lg:max-w-[26rem] lg:rounded-[28px] lg:border-white/60 lg:p-9 lg:shadow-2xl lg:shadow-black/40 lg:dark:border-white/10 lg:dark:bg-[#0c1e2e]/85 lg:dark:backdrop-blur-xl ${exito ? 'login-tarjeta-salida' : ''}`}>
            {/* Logo (sm–lg; en móvil va en la cabecera y en escritorio arriba de la tarjeta) */}
            <div className="mb-9 hidden sm:block lg:hidden">
              <img
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced Medical Solutions"
                className="h-11 w-auto max-w-[220px] object-contain block dark:hidden"
              />
              <img
                src="/images/eyeadvanced-logo-white.png"
                alt="EyeAdvanced Medical Solutions"
                className="h-11 w-auto max-w-[220px] object-contain hidden dark:block"
              />
            </div>

            {/* Heading */}
            <div className="login-entrada mb-7 sm:mb-8" style={{ animationDelay: '0.12s' }}>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-fg tracking-tight">
                Bienvenido de nuevo<span className="hidden text-primary-500 lg:inline">.</span>
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Ingresa tus credenciales para acceder al sistema clínico.
              </p>
            </div>

            {/* Form */}
            <form
              method="post"
              action="/login"
              onSubmit={handleSubmit}
              className={`login-form flex flex-col gap-4 transition-all duration-500 ease-out sm:gap-5 ${exito ? 'login-form-salida' : ''}`}
              noValidate
            >
              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300 sm:text-xs sm:font-bold sm:uppercase sm:tracking-wide sm:text-slate-600">
                  Correo electrónico
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-500 dark:text-slate-500" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@clinica.com"
                    className="login-input pl-12"
                    autoComplete="email"
                    required
                    disabled={loading || isLocked}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300 sm:text-xs sm:font-bold sm:uppercase sm:tracking-wide sm:text-slate-600">
                  Contraseña
                </label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-500 dark:text-slate-500" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="login-input pl-12 pr-12"
                    autoComplete="current-password"
                    required
                    disabled={loading || isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Recordarme (interruptor) */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <label htmlFor="remember-me" className="inline-flex cursor-pointer select-none items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    role="switch"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                    disabled={loading || isLocked}
                  />
                  <span
                    aria-hidden
                    className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary-500/25 peer-disabled:opacity-50 ${rememberMe ? 'bg-primary-600' : 'bg-slate-200 dark:bg-white/10'}`}
                  >
                    <span className={`ml-[3px] inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${rememberMe ? 'translate-x-4' : ''}`} />
                  </span>
                  Recordarme
                </label>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sesión segura
                </span>
              </div>

              {/* Error */}
              <div role="alert" aria-live="assertive">
                {aviso && !error && (
                  <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                    <MonitorSmartphone className="w-5 h-5 shrink-0" />
                    <span>{aviso}</span>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                ref={submitRef}
                type="submit"
                disabled={!hidratado || loading || isLocked}
                className="login-boton group relative mt-2 inline-flex min-h-[56px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-primary-500 to-primary-700 text-base font-bold text-white shadow-lg shadow-primary-900/20 transition-all hover:from-primary-600 hover:to-primary-800 hover:shadow-primary-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:mt-2 sm:min-h-[52px] sm:text-sm"
              >
                {exito ? (
                  <span className="inline-flex items-center gap-2 animate-popIn">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    ¡Listo!
                  </span>
                ) : loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    Iniciar sesión
                    <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-auto pt-8 text-center text-xs text-slate-400 dark:text-slate-500 sm:mt-7 sm:pt-0">
               EyeAdvanced Medical Solutions &copy; {footerYear}
            </p>
          </div>
        </div>
      </div>

      {/* Right side — Visual panel (desktop only): ventana redondeada sobre el fondo
          de marca, foto con acercamiento lento, titular animado y tarjetas flotantes. */}
      <div className={`relative z-10 hidden lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-[54%] xl:w-[56%] lg:p-5 xl:p-6 ${exito ? 'login-panel-salida' : ''}`}>
        <div className="login-entrada relative flex flex-1 overflow-hidden rounded-[32px] shadow-2xl shadow-black/50 ring-1 ring-white/10" style={{ animationDelay: '0.1s' }}>
          {/* next/image: AVIF/WebP redimensionado (antes ~2.6 MB en PNG) */}
          {loginSlides.map((slide, index) => (
            <Image
              key={slide.image}
              src={slide.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 56vw, 1px"
              priority={index === 0}
              quality={70}
              className={`object-cover transition-opacity duration-1000 ease-out ${
                index === activeSlide ? 'login-kenburns opacity-100' : 'opacity-0'
              }`}
              style={{ objectPosition: slide.position }}
            />
          ))}
          {/* Overlays */}
          <div className="absolute inset-0 z-10 bg-gradient-to-br from-[#0f273d]/95 via-primary-900/75 to-primary-800/40" />
          <div className="absolute inset-x-0 bottom-0 z-10 h-1/2 bg-gradient-to-t from-[#07131f]/95 via-[#0f273d]/60 to-transparent" />
          <div className="login-barrido absolute inset-0 z-10" />

          {/* Content */}
          <div className="relative z-20 flex w-full flex-col justify-between gap-6 p-10 xl:p-12">
            {/* Top: Headline (cambia con cada foto) */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
                </span>
                <span className="text-xs font-semibold text-white/80">Plataforma clínica en línea</span>
              </div>
              <div key={activeSlide} className="max-w-lg">
                <h2 className="text-3xl font-black leading-tight text-white drop-shadow-lg xl:text-[2.6rem]">
                  {loginSlides[activeSlide].title.split(' ').map((palabra, i) => (
                    <span key={i} className="welcome-word mr-[0.28em]" style={{ animationDelay: `${0.05 + i * 0.06}s` }}>
                      {palabra}
                    </span>
                  ))}
                </h2>
                <p className="welcome-fade mt-4 max-w-sm text-base leading-relaxed text-white/65" style={{ animationDelay: '0.35s' }}>
                  {loginSlides[activeSlide].subtitle}
                </p>
              </div>
            </div>

            {/* Center: tarjetas flotantes con los datos del día */}
            <div className="relative">
              <div className="relative mx-auto grid max-w-md gap-2.5">
                <div className="login-flotar" style={{ animationDelay: '0s' }}>
                  <div className="login-entrada -rotate-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 shadow-2xl backdrop-blur-md transition-transform duration-300 hover:rotate-0" style={{ animationDelay: '0.35s' }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Consultas hoy</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300/15"><FileText className="h-4 w-4 text-cyan-200" /></span>
                    </div>
                    <div className="text-3xl font-black tabular-nums text-white xl:text-4xl">{formatoCifra(resumen?.consultasHoy)}</div>
                    <div
                      className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
                        variacion == null ? 'text-white/40' : variacion >= 0 ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {variacion == null ? (
                        'Consultas programadas hoy'
                      ) : (
                        <>
                          <svg className={`h-3 w-3 ${variacion < 0 ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          {variacion >= 0 ? '+' : ''}{variacion}% vs ayer
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="login-flotar ml-10" style={{ animationDelay: '-2s' }}>
                  <div className="login-entrada rotate-1 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 shadow-2xl backdrop-blur-md transition-transform duration-300 hover:rotate-0" style={{ animationDelay: '0.45s' }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Pacientes registrados</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300/15"><Users className="h-4 w-4 text-cyan-200" /></span>
                    </div>
                    <div className="text-3xl font-black tabular-nums text-white xl:text-4xl">{formatoCifra(resumen?.pacientesRegistrados)}</div>
                    <div className="mt-2 text-xs font-medium text-white/40">Expedientes en el sistema</div>
                  </div>
                </div>
                <div className="login-flotar mr-8 [@media(max-height:760px)]:hidden" style={{ animationDelay: '-4s' }}>
                  <div className="login-entrada -rotate-1 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 shadow-2xl backdrop-blur-md transition-transform duration-300 hover:rotate-0" style={{ animationDelay: '0.55s' }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Personal clínico</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300/15"><Activity className="h-4 w-4 text-cyan-200" /></span>
                    </div>
                    <div className="text-3xl font-black tabular-nums text-white xl:text-4xl">{formatoCifra(resumen?.personalActivo)}</div>
                    <div className="mt-2 text-xs font-medium text-white/40">
                      {resumen?.personalPorTipo
                        ? `${resumen.personalPorTipo.medicos} médicos · ${resumen.personalPorTipo.enfermeros} enfermeros · ${resumen.personalPorTipo.anestesiologos} anestesiólogos`
                        : 'Activos en la clínica'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: indicadores del carrusel (se llenan mientras corre la foto) */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {loginSlides.map((slide, index) => (
                  <button
                    key={slide.image}
                    type="button"
                    onClick={() => setActiveSlide(index)}
                    className={`relative h-1.5 overflow-hidden rounded-full transition-all duration-500 ${
                      index === activeSlide ? 'w-12 bg-white/20' : 'w-5 bg-white/25 hover:bg-white/45'
                    }`}
                    aria-label={`Mostrar slide ${index + 1}`}
                  >
                    {index === activeSlide && <span key={activeSlide} className="login-dot-progreso absolute inset-y-0 left-0 rounded-full bg-cyan-300" />}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-white/35">EyeAdvanced Medical Solutions &copy; {footerYear}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
