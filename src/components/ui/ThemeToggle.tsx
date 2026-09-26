'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  /** Muestra etiqueta de texto junto al icono */
  withLabel?: boolean;
}

/**
 * Alterna light/dark. Renderiza un placeholder determinista hasta el montaje
 * para no romper la hidratación (el tema solo se conoce en el cliente).
 */
export default function ThemeToggle({ className, withLabel = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = !mounted ? 'Tema' : isDark ? 'Modo claro' : 'Modo oscuro';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        withLabel ? 'h-10 px-3 text-sm font-medium' : 'h-10 w-10',
        className
      )}
    >
      <span className="relative h-5 w-5">
        <Sun
          className={cn(
            'absolute inset-0 h-5 w-5 transition-all duration-300',
            isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
          )}
        />
        <Moon
          className={cn(
            'absolute inset-0 h-5 w-5 transition-all duration-300',
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
          )}
        />
      </span>
      {withLabel && <span>{label}</span>}
    </button>
  );
}
