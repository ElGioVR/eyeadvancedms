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
import { useUser } from '@/hooks/useUser';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Pacientes', href: '/pacientes' },
  { icon: Calendar, label: 'Agenda', href: '/agenda' },
  { icon: Package, label: 'Inventario', href: '/inventario' },
  { icon: TrendingUp, label: 'Productividad', href: '/productividad', adminOnly: true },
  { icon: Settings, label: 'Configuración', href: '/configuracion' },
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

  // Mobile (<lg): 260px when open → show labels
  // Tablet (lg–xl): always 72px → icon-only
  // Desktop (xl+): 260px or 72px depending on collapsed
  const sidebarWide = isDesktop ? !collapsed : isOpen;
  const showLabels = sidebarWide;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-white dark:bg-[#0F1115] border-r border-gray-200 dark:border-[#2F3336] text-gray-900 dark:text-[#E7E9EA] transition-all duration-300 ease-in-out z-50 flex flex-col shadow-2xl lg:shadow-sm dark:lg:shadow-none',
          // Mobile (<lg): overlay, slides in/out
          'max-lg:w-[260px]',
          isOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          // Tablet (lg–xl): always collapsed 72px, always visible
          'lg:w-[72px] lg:translate-x-0',
          // Desktop (xl+): respects collapsed prop
          'xl:translate-x-0',
          collapsed ? 'xl:w-[72px]' : 'xl:w-[260px]'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center justify-center h-[72px] shrink-0', showLabels ? 'px-4' : 'w-full')}>
          {showLabels ? (
            <div className="flex items-center justify-center transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]">
              {/* Light: logo a color sobre fondo blanco; Dark: variante blanca */}
              <Image
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced"
                width={160}
                height={40}
                priority
                className="w-[160px] h-auto dark:hidden"
              />
              <Image
                src="/images/eyeadvanced-logo-white.png"
                alt="EyeAdvanced"
                width={160}
                height={40}
                priority
                className="w-[160px] h-auto hidden dark:block"
              />
            </div>
          ) : (
            <div className="bg-primary-700 dark:bg-primary-600 w-full h-[72px] flex items-center justify-center transition-colors duration-300">
              <Image
                src="/images/logo-eye.png"
                alt="EyeAdvanced"
                width={32}
                height={32}
                priority
                className="w-8 h-8 object-contain"
              />
            </div>
          )}
        </div>

        {/* Toggle button – only visible on xl+ */}
        <button
          onClick={onToggle}
          className="hidden xl:flex absolute -right-3 top-[84px] w-6 h-6 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-full shadow-md items-center justify-center text-gray-500 dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23] hover:text-gray-700 dark:hover:text-[#E7E9EA] hover:scale-110 active:scale-95 transition-all duration-200"
          aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Menu */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {menuItems
            .filter((item) => !('adminOnly' in item && item.adminOnly) || user?.rol === 'admin')
            .map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.98]',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-[#1D9BF0]/10 dark:text-[#1D9BF0]'
                    : 'text-gray-600 dark:text-[#9BA1A6] hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white',
                  !showLabels && 'justify-center px-0'
                )}
                title={!showLabels ? item.label : undefined}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary-600 dark:bg-[#1D9BF0] transition-all duration-300" />
                )}
                <item.icon
                  className={cn(
                    'w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110',
                    isActive ? 'text-primary-600 dark:text-[#1D9BF0]' : 'text-gray-400 dark:text-[#71767B] group-hover:text-gray-700 dark:group-hover:text-[#E7E9EA]'
                  )}
                />
                {showLabels && <span className="font-semibold text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-gray-200 dark:border-[#2F3336]">
          {showLabels && user && (
            <div className="flex items-center gap-3 px-1 py-3 mb-2">
              <Avatar initials={user.iniciales} src={user.avatar_url} className="bg-primary-500 dark:bg-[#202327] text-white dark:text-[#E7E9EA]" />
              <div className="min-w-0">
                <div className="text-sm font-bold leading-5 truncate">{user.nombre || user.email}</div>
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-[#71767B]">
                  <ShieldCheck className="h-3 w-3" />
                  <span className="capitalize">{user.rol}</span>
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full rounded-xl border border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#E7E9EA] hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:border-red-500/30 transition-all duration-200 active:scale-[0.98]',
              !showLabels && 'justify-center px-0'
            )}
            title={!showLabels ? 'Cerrar Sesión' : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {showLabels && <span className="font-semibold text-sm">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)}>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cerrar Sesión</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">¿Estás seguro que deseas cerrar sesión?</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowLogoutModal(false)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
              >
                Cerrar Sesión
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
