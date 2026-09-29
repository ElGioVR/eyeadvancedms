'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, Package, TrendingUp, User, Users, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { useState, useEffect } from 'react';

interface NavItem {
  icon: typeof LayoutDashboard;
  href: string;
  label: string;
}

/** Barra inferior del doctor (y admin en Modo Focus). */
const navItems: NavItem[] = [
  { icon: LayoutDashboard, href: '/dashboard', label: 'Inicio' },
  { icon: Calendar, href: '/agenda', label: 'Agenda' },
  { icon: Package, href: '/inventario', label: 'Inventario' },
  { icon: TrendingUp, href: '/mis-honorarios', label: 'Honorarios' },
  { icon: User, href: '/mi-perfil', label: 'Perfil' },
];

/** Barra inferior para el resto del personal; "Menú" abre el drawer lateral. */
const staffItems: NavItem[] = [
  { icon: LayoutDashboard, href: '/dashboard', label: 'Inicio' },
  { icon: Users, href: '/pacientes', label: 'Pacientes' },
  { icon: Calendar, href: '/agenda', label: 'Agenda' },
  { icon: Package, href: '/inventario', label: 'Inventario' },
];

interface DoctorBottomNavProps {
  onMenuOpen?: () => void;
}

export default function DoctorBottomNav({ onMenuOpen }: DoctorBottomNavProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [isMobile, setIsMobile] = useState(false);
  // Admin con doctor ligado + Modo Focus activo → interfaz de doctor en móvil
  const [focusOverride, setFocusOverride] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setFocusOverride((e as CustomEvent<boolean>).detail === true);
    window.addEventListener('modo-focus-changed', handler);
    return () => window.removeEventListener('modo-focus-changed', handler);
  }, []);

  if (!isMobile || !user) return null;

  const esDoctor = user.rol === 'doctor';
  const adminEnFocus = user.rol === 'admin' && !!user.doctor_id && (focusOverride || user.modo_focus === true);
  const modoDoctor = esDoctor || adminEnFocus;
  const items = modoDoctor ? navItems : staffItems;

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 glass pb-safe lg:hidden"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            // Link (no router.push): Next precarga la ruta → cambio de módulo instantáneo
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-95"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300',
                  active
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-400/15 dark:text-primary-300'
                    : 'text-muted group-hover:text-fg'
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.9} />
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none transition-colors',
                  active ? 'font-semibold text-primary-700 dark:text-primary-300' : 'font-medium text-muted'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        {!modoDoctor && onMenuOpen && (
          <button
            onClick={onMenuOpen}
            className="group relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-95"
            aria-label="Abrir menú"
          >
            <span className="flex h-8 w-14 items-center justify-center rounded-full text-muted transition-colors group-hover:text-fg">
              <Menu className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <span className="text-[11px] font-medium leading-none text-muted">Menú</span>
          </button>
        )}
      </div>
    </nav>
  );
}
