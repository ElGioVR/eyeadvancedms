'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Building2, Chrome } from 'lucide-react';
import Link from 'next/link';
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

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [activeSlide, setActiveSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % loginSlides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.log('Auth error:', authError);
      setError(authError.message || 'Credenciales incorrectas.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

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

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@clinica.com"
                    className="input-field pl-11"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="input-field pl-11 pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500/20" />
                  <span className="text-sm text-gray-600">Recordar sesión</span>
                </label>
                <Link href="/forgot-password" className="text-sm text-primary-500 hover:text-primary-600">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-50"
              >
                {loading ? 'Iniciando sesión...' : 'INICIAR SESIÓN'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">o continuar con</span>
              </div>
            </div>

            {/* Social buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                <Chrome className="h-4 w-4 text-gray-700" />
                <span className="text-sm font-medium text-gray-700">Google</span>
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                <Building2 className="h-4 w-4 text-gray-700" />
                <span className="text-sm font-medium text-gray-700">Microsoft</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
