'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';

const themes = [
  { id: 'light', label: 'Claro', icon: Sun, description: 'Tema claro para uso diurno' },
  { id: 'dark', label: 'Oscuro', icon: Moon, description: 'Total black para uso nocturno' },
];

export default function SistemaPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-32 rounded-xl bg-gray-200 dark:bg-[#202327]" />
          <div className="h-48 rounded-xl bg-gray-200 dark:bg-[#202327]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
        <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Apariencia</h3>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500 dark:text-[#71767B] mb-6">Selecciona el tema de la aplicación</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {themes.map((t) => {
              const Icon = t.icon;
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                    isActive
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] hover:border-gray-300 dark:hover:border-[#536471]'
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-[#202327] text-gray-500 dark:text-[#71767B]'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-[#E7E9EA]'}`}>
                      {t.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[#71767B] mt-0.5">{t.description}</p>
                  </div>
                  {isActive && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
        <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Información del Sistema</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-[#71767B]">Versión</span>
            <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-[#71767B]">Framework</span>
            <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Next.js 14.2</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-[#71767B]">Base de Datos</span>
            <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Supabase PostgreSQL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
