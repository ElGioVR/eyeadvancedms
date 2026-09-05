'use client';

import { useState } from 'react';
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
import { cn } from '@/lib/utils';
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
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-[#174c78] text-white transition-all duration-300 z-50 flex flex-col shadow-xl shadow-primary-900/10',
          collapsed ? 'w-[72px]' : 'w-[260px]'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center px-4 py-6', collapsed ? 'justify-center px-3' : 'justify-center')}>
          <div className="bg-white rounded-xl p-3 shadow-lg flex items-center justify-center">
            <Eye className="w-8 h-8 text-[#174c78]" />
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-24 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center text-primary-600 hover:bg-gray-50"
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
                  collapsed && 'justify-center px-0'
                )}
                title={collapsed ? item.label : undefined}
              >
                {isActive && !collapsed && <span className="absolute left-0 top-2.5 h-7 w-1 rounded-r bg-accent" />}
                <item.icon className={cn('w-5 h-5', isActive ? 'text-accent' : 'text-white/72')} />
                {!collapsed && <span className="font-semibold text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-white/12">
          {!collapsed && (
            <div className="flex items-center gap-3 px-1 py-3 mb-2">
              <div className="w-10 h-10 bg-white text-primary-700 rounded-full flex items-center justify-center text-sm font-bold">
                DA
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-5">Dra. Irina</div>
                <div className="flex items-center gap-1 text-xs text-white/62">
                  <ShieldCheck className="h-3 w-3" />
                  Oftalmóloga Pediatra
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowLogoutModal(true)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full text-white/78 hover:bg-white/10 hover:text-white rounded-md border border-white/14 transition-colors',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? 'Cerrar Sesión' : undefined}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="font-semibold text-sm">Cerrar Sesión</span>}
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
