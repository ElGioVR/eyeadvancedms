'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Check, FileText, Download } from 'lucide-react';

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
          <div className="h-32 rounded-xl bg-gray-200 dark:bg-surface-2" />
          <div className="h-48 rounded-xl bg-gray-200 dark:bg-surface-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
        <div className="border-b border-line/70 px-6 py-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Apariencia</h3>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted mb-6">Selecciona el tema de la aplicación</p>

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
                      : 'border-line bg-surface-2 hover:border-gray-300 dark:hover:border-line-strong'
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-surface-2 text-muted'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-fg'}`}>
                      {t.label}
                    </p>
                    <p className="text-xs text-muted mt-0.5">{t.description}</p>
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

      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
        <div className="border-b border-line/70 px-6 py-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Ayuda y documentación</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-fg">Manual de usuario</p>
              <p className="text-xs text-muted mt-0.5">
                Guía de uso para recepción, doctores y administradores · PDF · v1.0.0
              </p>
            </div>
            <a
              href="/docs/manual-de-usuario.pdf"
              download="Manual_de_Usuario_EyeAdvanced.pdf"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              Descargar manual
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
        <div className="border-b border-line/70 px-6 py-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Información del Sistema</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Versión</span>
            <span className="text-sm font-bold text-fg">1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Framework</span>
            <span className="text-sm font-bold text-fg">Next.js 14.2</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Base de Datos</span>
            <span className="text-sm font-bold text-fg">Supabase PostgreSQL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
