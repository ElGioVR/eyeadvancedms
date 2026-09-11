'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Activity, Users, FileText } from 'lucide-react';

const MAX_ATTEMPTS = 5;
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

export default function LoginPage() {
  const router = useRouter();
  const [activeSlide, setActiveSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % loginSlides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

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
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

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

      router.push('/bienvenida');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  }, [email, password, isLocked, lockedUntil, attempts, router]);

  return (
    <>
      {/* Left side — Form */}
      <div className="w-full lg:w-1/2 flex flex-col min-h-screen lg:min-h-0 bg-white dark:bg-[#16181C]">
        <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="mb-8 sm:mb-10">
              <img
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced Medical Solutions"
                className="h-10 sm:h-12 w-auto max-w-[200px] sm:max-w-[240px] object-contain"
              />
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#E7E9EA] tracking-tight">
                Bienvenido de nuevo
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Ingresa tus credenciales para acceder al sistema clínico.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@clinica.com"
                    className="input-field pl-11 min-h-[46px] rounded-lg"
                    autoComplete="email"
                    required
                    disabled={loading || isLocked}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-11 pr-11 min-h-[46px] rounded-lg"
                    autoComplete="current-password"
                    required
                    disabled={loading || isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 h-full px-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              <div className="min-h-[20px]" role="alert" aria-live="assertive">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || isLocked}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 min-h-[48px] text-sm font-bold tracking-wide rounded-lg shadow-md shadow-primary-900/15 hover:from-primary-700 hover:to-primary-800 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : (
                  'INICIAR SESIÓN'
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-8 text-center text-xs text-gray-400">
              EyeAdvanced Medical Solutions &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      {/* Right side — Visual panel (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Carousel images */}
        {loginSlides.map((slide, index) => (
          <img
            key={slide.image}
            src={slide.image}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
              index === activeSlide ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ objectPosition: slide.position }}
          />
        ))}
        {/* Overlays */}
        <div className="absolute inset-0 z-10 bg-gradient-to-br from-primary-900/95 via-primary-900/85 to-primary-800/70" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-primary-900/90 to-transparent" />

        {/* Content */}
        <div className="relative z-20 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Top: Headline */}
          <div className="pt-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-6">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold text-white/80">Plataforma Clínica</span>
            </div>
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-4 drop-shadow-lg">
              {loginSlides[activeSlide].title}
            </h2>
            <p className="text-base text-white/60 max-w-sm leading-relaxed drop-shadow-md">
              {loginSlides[activeSlide].subtitle}
            </p>
          </div>

          {/* Center: Floating stats cards */}
          <div className="relative py-10">
            <div className="relative mx-auto max-w-sm">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-2xl mb-3 transform rotate-[-2deg] hover:rotate-0 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Consultas Hoy</span>
                  <FileText className="w-4 h-4 text-accent" />
                </div>
                <div className="text-3xl font-black text-white">24</div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                  +12% vs ayer
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-2xl mb-3 transform translate-x-8 rotate-[1deg] hover:rotate-0 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Pacientes Activos</span>
                  <Users className="w-4 h-4 text-accent-light" />
                </div>
                <div className="text-3xl font-black text-white">1,248</div>
                <div className="mt-2 text-xs text-white/40 font-medium">Registro continuo</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-2xl transform -translate-x-4 rotate-[-1deg] hover:rotate-0 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Inventario</span>
                  <Activity className="w-4 h-4 text-accent" />
                </div>
                <div className="text-3xl font-black text-white">856</div>
                <div className="mt-2 text-xs text-white/40 font-medium">Lentes en stock</div>
              </div>
            </div>
          </div>

          {/* Bottom: Carousel dots + tagline */}
          <div className="pb-2">
            <div className="flex items-center gap-2 mb-4">
              {loginSlides.map((slide, index) => (
                <button
                  key={slide.image}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === activeSlide ? 'w-10 bg-accent' : 'w-5 bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Mostrar slide ${index + 1}`}
                />
              ))}
            </div>
            <p className="text-xs text-white/30 font-medium">
              EyeAdvanced Medical Solutions &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
