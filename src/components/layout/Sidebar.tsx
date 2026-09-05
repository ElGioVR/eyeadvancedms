'use client';

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
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-gradient-to-b from-primary-600 to-primary-800 text-white transition-all duration-300 z-50 flex flex-col',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
          <Eye className="w-6 h-6" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-sm">EyeAdvanced</div>
            <div className="text-xs text-white/60">MEDICAL SOLUTIONS</div>
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center text-primary-600 hover:bg-gray-100"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5" />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="p-3 border-t border-white/20">
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-sm font-semibold">
              DA
            </div>
            <div>
              <div className="text-sm font-medium">Dra. Admin</div>
              <div className="text-xs text-white/60">Administrador</div>
            </div>
          </div>
        )}
        <button className="flex items-center gap-3 px-3 py-2.5 w-full text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors">
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}
