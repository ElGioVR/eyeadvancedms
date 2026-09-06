'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [activeSlide, setActiveSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      }
    });
  }, [supabase, router]);

  // Slide timer
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

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setAttempts(0);
        setError(`Demasiados intentos fallidos. Bloqueado por 30 segundos.`);
      } else {
        // Generic error message — don't leak Supabase details
        const remaining = MAX_ATTEMPTS - newAttempts;
        setError(
          authError.message.includes('Invalid login credentials')
            ? `Correo o contraseña incorrectos. (${remaining} intentos restantes)`
            : 'Error al iniciar sesión. Intenta de nuevo.'
        );
      }

      setLoading(false);
      return;
    }

    // Success
    router.push('/dashboard');
    router.refresh();
  }, [email, password, isLocked, lockedUntil, attempts, supabase, router]);

  return (
    <>
      {/* Left side - Image */}
      <div className="login-visual hidden lg:flex lg:w-1/2 relative overflow-hidden">
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
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-primary-700/88 via-primary-900/72 to-primary-900/48" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-2/5 bg-gradient-to-t from-primary-900 via-primary-900/70 to-transparent" />

        <div className="relative z-20 flex flex-col justify-end p-16 text-white">
          <h1 className="mb-5 text-5xl font-black leading-tight">
            {loginSlides[activeSlide].title}
          </h1>
          <p className="max-w-lg text-lg font-medium text-accent">
            {loginSlides[activeSlide].subtitle}
          </p>
          <div className="mt-7 flex items-center gap-2">
            {loginSlides.map((slide, index) => (
              <button
                key={slide.image}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeSlide ? 'w-12 bg-accent' : 'w-5 bg-white/35 hover:bg-white/55'
                }`}
                aria-label={`Mostrar slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 bg-[#f5f7f9]">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg shadow-gray-900/10 p-8 sm:p-10">
            {/* Logo */}
            <div className="mb-7 flex justify-center">
              <img
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced Medical Solutions"
                className="h-14 w-auto max-w-[280px] object-contain"
              />
            </div>

            <h2 className="text-2xl font-extrabold text-center text-gray-900 mb-2">
              Bienvenido al Sistema
            </h2>
            <p className="text-gray-500 text-center mb-8 text-sm">
              Ingresa tus credenciales clínicas para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@clinica.com"
                    className="input-field pl-11"
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-11 pr-11"
                    autoComplete="current-password"
                    required
                    disabled={loading || isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || isLocked}
                className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      </div>
    </>
  );
}
