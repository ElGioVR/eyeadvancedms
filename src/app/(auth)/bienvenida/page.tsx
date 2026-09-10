'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BienvenidaPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      router.push('/dashboard');
    }, 3200);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex items-center justify-center w-full min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900">
      <div
        className={`flex flex-col items-center gap-8 transition-all duration-700 ease-out ${
          mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        {/* Logo */}
        <div
          className={`transition-all duration-700 ease-out delay-100 ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <img
            src="/images/eyeadvanced-logo-white.png"
            alt="EyeAdvanced Medical Solutions"
            className="h-14 sm:h-16 w-auto drop-shadow-lg"
          />
        </div>

        {/* Loader */}
        <div
          className={`transition-all duration-500 ease-out delay-500 ${
            mounted ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-white/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin" />
          </div>
        </div>

        {/* Text */}
        <div
          className={`text-center transition-all duration-500 ease-out delay-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <p className="text-sm font-semibold text-white/80 tracking-wide">
            Preparando tu espacio de trabajo...
          </p>
        </div>
      </div>
    </div>
  );
}
