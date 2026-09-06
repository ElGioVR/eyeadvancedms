'use client';

import { Bell, CalendarDays, Menu, Search } from 'lucide-react';

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Hamburger – visible on lg and below */}
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="xl:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Search – hidden on mobile, visible sm+ */}
          <div className="relative hidden sm:flex flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar paciente, lente, consulta..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600">
            <CalendarDays className="h-4 w-4 text-primary-500" />
            Hoy
          </div>

          {/* Notifications */}
          <button className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" aria-label="Notificaciones">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
          </button>

          {/* User avatar */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-50 text-primary-700 rounded-full border border-primary-100 flex items-center justify-center font-bold text-sm">
              DA
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
