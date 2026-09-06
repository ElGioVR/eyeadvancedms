'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  DollarSign,
  Package,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/ui/ConfirmModal';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Pacientes', href: '/pacientes' },
  { icon: Stethoscope, label: 'Consultas', href: '/consultas' },
  { icon: DollarSign, label: 'Cobros', href: '/cobros' },
  { icon: Package, label: 'Inventario', href: '/inventario' },
  { icon: BarChart3, label: 'Reportes', href: '/reportes' },
  { icon: Settings, label: 'Configuración', href: '/configuracion' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1280px)').matches;
  });
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
  const router = useRouter();
  const { user } = useUser();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isDesktop = useIsDesktop();
  const supabase = createClient();

  // Mobile (<lg): 260px when open → show labels
  // Tablet (lg–xl): always 72px → icon-only
  // Desktop (xl+): 260px or 72px depending on collapsed
  const sidebarWide = isDesktop ? !collapsed : isOpen;
  const showLabels = sidebarWide;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error);
    }
    // Force full page reload to clear all client state
    window.location.href = '/login';
  };

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
          'fixed left-0 top-0 h-screen bg-[#174c78] text-white transition-all duration-300 z-50 flex flex-col shadow-xl shadow-primary-900/10',
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
        <div className="flex items-center px-4 py-6 justify-center">
          {showLabels ? (
            <div className="bg-white rounded-xl p-3 shadow-lg flex items-center justify-center">
              <Image
                src="/images/eyeadvanced-logo.png"
                alt="EyeAdvanced"
                width={160}
                height={40}
                priority
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl p-2.5 shadow-lg flex items-center justify-center">
              <Eye className="w-6 h-6 text-[#174c78]" />
            </div>
          )}
        </div>

        {/* Toggle button – only visible on xl+ */}
        <button
          onClick={onToggle}
          className="hidden xl:flex absolute -right-3 top-24 w-6 h-6 bg-white rounded-full shadow-md items-center justify-center text-primary-600 hover:bg-gray-50"
          aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Menu */}
        <nav className="flex-1 px-4 py-2 space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 px-4 py-3 rounded-md transition-colors',
                  isActive
                    ? 'bg-white/14 text-white shadow-inner shadow-white/5'
                    : 'text-white/72 hover:bg-white/8 hover:text-white',
                  !showLabels && 'justify-center px-0'
                )}
                title={!showLabels ? item.label : undefined}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
              >
                {isActive && showLabels && <span className="absolute left-0 top-2.5 h-7 w-1 rounded-r bg-accent" />}
                <item.icon className={cn('w-5 h-5', isActive ? 'text-accent' : 'text-white/72')} />
                {showLabels && <span className="font-semibold text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-white/12">
          {showLabels && user && (
            <div className="flex items-center gap-3 px-1 py-3 mb-2">
              <div className="w-10 h-10 bg-white text-primary-700 rounded-full flex items-center justify-center text-sm font-bold">
                {user.iniciales}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-5 truncate">{user.nombre || user.email}</div>
                <div className="flex items-center gap-1 text-xs text-white/62">
                  <ShieldCheck className="h-3 w-3" />
                  <span className="capitalize">{user.rol}</span>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowLogoutModal(true)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full text-white/78 hover:bg-white/10 hover:text-white rounded-md border border-white/14 transition-colors',
              !showLabels && 'justify-center px-0'
            )}
            title={!showLabels ? 'Cerrar Sesión' : undefined}
          >
            <LogOut className="w-5 h-5" />
            {showLabels && <span className="font-semibold text-sm">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      <ConfirmModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Cerrar Sesión"
        message="¿Estás seguro que deseas cerrar sesión?"
        confirmText="Cerrar Sesión"
        cancelText="Cancelar"
        variant="warning"
      />
    </>
  );
}
