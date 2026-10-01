'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import {
  LayoutDashboard,
  Users,
  Package,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useUser, clearUserCache } from '@/hooks/useUser';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import ThemeToggle from '@/components/ui/ThemeToggle';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', section: 'Principal' },
  { icon: Users, label: 'Pacientes', href: '/pacientes', section: 'Principal' },
  { icon: Calendar, label: 'Agenda', href: '/agenda', section: 'Principal' },
  { icon: Package, label: 'Inventario', href: '/inventario', section: 'Operación' },
  { icon: TrendingUp, label: 'Productividad', href: '/productividad', section: 'Operación', adminOnly: true },
  { icon: Settings, label: 'Configuración', href: '/configuracion', section: 'Sistema' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export default function Sidebar({ collapsed, onToggle, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const isDesktop = useIsDesktop();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Mobile (<lg): 272px cuando está abierto → muestra etiquetas
  // Tablet (lg–xl): siempre 76px → solo iconos
  // Desktop (xl+): 272px o 76px según `collapsed`
  const sidebarWide = isDesktop ? !collapsed : isOpen;
  const showLabels = sidebarWide;

  const visibleItems = menuItems.filter((item) => {
    // Enfermería (rol restringido): agenda, pacientes (lectura), configuración
    // (Perfil y Sistema) e inventario solo con honorarios activos.
    if (user?.rol === 'enfermero') {
      if (item.href === '/inventario') return user.cobra_honorarios === true;
      return item.href === '/agenda' || item.href === '/pacientes' || item.href === '/configuracion';
    }
    return !('adminOnly' in item && item.adminOnly) || user?.rol === 'admin';
  });
  const sections = visibleItems.reduce<Record<string, typeof visibleItems>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop móvil */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-[100dvh] flex-col border-r border-line bg-surface text-fg transition-all duration-300 ease-out',
          // Mobile (<lg): drawer
          'max-lg:w-[272px] max-lg:rounded-r-3xl max-lg:shadow-pop',
          isOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          // Tablet (lg–xl): 76px fijo
          'lg:w-[76px] lg:translate-x-0',
          // Desktop (xl+)
          'xl:translate-x-0',
          collapsed ? 'xl:w-[76px]' : 'xl:w-[272px]'
        )}
      >
        {/* Logo */}
        <div className={cn('flex h-16 shrink-0 items-center', showLabels ? 'px-5' : 'justify-center')}>
          {showLabels ? (
            <Link href="/dashboard" className="flex items-center transition-opacity hover:opacity-80" onClick={() => { if (window.innerWidth < 1024) onClose(); }}>
              <Image
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced"
                width={148}
                height={37}
                priority
                className="h-auto w-[148px] dark:hidden"
              />
              <Image
                src="/images/eyeadvanced-logo-white.png"
                alt="EyeAdvanced"
                width={148}
                height={37}
                priority
                className="hidden h-auto w-[148px] dark:block"
              />
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm shadow-primary-900/30 transition-transform hover:scale-105"
            >
              <Image src="/images/logo-eye.png" alt="EyeAdvanced" width={24} height={24} priority className="h-6 w-6 object-contain" />
            </Link>
          )}
        </div>

        {/* Botón colapsar – solo xl+ */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[52px] hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-soft transition-all hover:scale-110 hover:text-fg xl:flex"
          aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Menú */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-2">
          {Object.entries(sections).map(([section, items], idx) => (
            <div key={section} className={cn(idx > 0 && 'mt-5')}>
              {showLabels ? (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/80">
                  {section}
                </p>
              ) : (
                idx > 0 && <div className="mx-auto mb-3 h-px w-8 bg-line" />
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300'
                          : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                        !showLabels && 'mx-auto h-11 w-11 justify-center px-0'
                      )}
                      title={!showLabels ? item.label : undefined}
                      aria-label={!showLabels ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                    >
                      {isActive && showLabels && (
                        <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-600 dark:bg-primary-400" />
                      )}
                      <item.icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          isActive ? 'text-primary-600 dark:text-primary-300' : 'text-muted group-hover:text-fg'
                        )}
                        strokeWidth={isActive ? 2.2 : 1.9}
                      />
                      {showLabels && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Usuario */}
        <div className="border-t border-line p-3">
          {showLabels ? (
            <div className="rounded-2xl bg-surface-2/70 p-2.5">
              {user && (
                <Link
                  href="/mi-perfil"
                  onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                  className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface-3/60"
                >
                  <Avatar
                    initials={user.iniciales}
                    src={user.avatar_url}
                    size="sm"
                    className="h-9 w-9 bg-gradient-to-br from-primary-500 to-primary-700 text-white ring-2 ring-surface"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold leading-5">{user.nombre || user.email}</div>
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <ShieldCheck className="h-3 w-3" />
                      <span className="capitalize">{user.rol}</span>
                    </div>
                  </div>
                </Link>
              )}
              <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
                <ThemeToggle withLabel className="h-9 flex-1 justify-start text-xs" />
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </button>
              {user && (
                <Link href="/mi-perfil" className="mt-1" title={user.nombre || user.email}>
                  <Avatar
                    initials={user.iniciales}
                    src={user.avatar_url}
                    size="sm"
                    className="h-9 w-9 bg-gradient-to-br from-primary-500 to-primary-700 text-white"
                  />
                </Link>
              )}
            </div>
          )}
        </div>
      </aside>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} maxWidth="max-w-sm">
        <div className="space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <LogOut className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-fg">Cerrar sesión</h3>
            <p className="mt-1 text-sm text-muted">¿Estás seguro que deseas cerrar sesión?</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setShowLogoutModal(false)} className="btn-secondary">
              Cancelar
            </button>
            <form action={logout} onSubmit={() => clearUserCache()}>
              <button type="submit" className="btn-danger w-full">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
