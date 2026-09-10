'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CalendarDays, Menu, Search, User, Stethoscope, Package, CreditCard, X, Check } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import Avatar from '@/components/ui/Avatar';

interface SearchResult {
  tipo: string;
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
}

interface Notificacion {
  id: string;
  tipo: 'info' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  leido: boolean;
  created_at: string;
}

const tipoIcons: Record<string, typeof User> = {
  paciente: User,
  consulta: Stethoscope,
  lente: Package,
  doctor: Stethoscope,
  cobro: CreditCard,
};

const tipoLabels: Record<string, string> = {
  paciente: 'Pacientes',
  consulta: 'Consultas',
  lente: 'Inventario',
  doctor: 'Doctores',
  cobro: 'Cobros',
};

const notifColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
};

const notifEntityHref: Record<string, string> = {
  consulta: '/consultas',
  cobro: '/cobros',
  lente: '/inventario',
};

function formatNotifTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user } = useUser();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notificaciones/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (user) fetchUnreadCount();
  }, [user, fetchUnreadCount]);

  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  async function toggleNotifPanel() {
    if (notifOpen) {
      setNotifOpen(false);
      return;
    }
    setNotifOpen(true);
    setNotifLoading(true);
    try {
      const res = await fetch('/api/notificaciones');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data);
      }
    } catch { /* silent */ } finally {
      setNotifLoading(false);
    }
  }

  async function markAsRead(ids: string[]) {
    await fetch('/api/notificaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, leido: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }

  function handleNotifClick(n: Notificacion) {
    if (!n.leido) markAsRead([n.id]);
    if (n.entidad_tipo && n.entidad_id && notifEntityHref[n.entidad_tipo]) {
      router.push(notifEntityHref[n.entidad_tipo]);
    }
    setNotifOpen(false);
  }

  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results);
        setSearchOpen(data.results.length > 0);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => performSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleResultClick(href: string) {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(href);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      inputRef.current?.blur();
    }
  }

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.tipo] ??= []).push(r);
    return acc;
  }, {});

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div ref={searchRef} className="relative hidden sm:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar paciente, lente, consulta..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); setSearchResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {searchOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
                {searchLoading && (
                  <div className="px-4 py-3 text-sm text-gray-500">Buscando...</div>
                )}
                {!searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
                  <div className="px-4 py-3 text-sm text-gray-500">Sin resultados para &quot;{searchQuery}&quot;</div>
                )}
                {!searchLoading && Object.entries(groupedResults).map(([tipo, items]) => {
                  const Icon = tipoIcons[tipo] ?? User;
                  return (
                    <div key={tipo}>
                      <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                        {tipoLabels[tipo] ?? tipo}
                      </div>
                      {items.map((r) => (
                        <button
                          key={`${r.tipo}-${r.id}`}
                          onClick={() => handleResultClick(r.href)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                        >
                          <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{r.titulo}</div>
                            <div className="text-xs text-gray-500 truncate">{r.subtitulo}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600">
            <CalendarDays className="h-4 w-4 text-primary-500" />
            {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>

          <div ref={notifRef} className="relative">
            <button
              onClick={toggleNotifPanel}
              className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              aria-label="Notificaciones"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-900">Notificaciones</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAsRead(notifications.filter((n) => !n.leido).map((n) => n.id))}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                    >
                      Marcar todo leído
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifLoading && (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">Cargando...</div>
                  )}
                  {!notifLoading && notifications.length === 0 && (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">Sin notificaciones</div>
                  )}
                  {!notifLoading && notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${!n.leido ? 'bg-primary-50/30' : ''}`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${notifColors[n.tipo] ?? notifColors.info}`}>
                        {n.tipo === 'info' ? 'i' : n.tipo === 'warning' ? '!' : '✕'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">{n.titulo}</span>
                          {!n.leido && <span className="h-1.5 w-1.5 rounded-full bg-primary-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensaje}</p>
                        <span className="text-[10px] text-gray-400 mt-1 block">{formatNotifTime(n.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Avatar initials={user?.iniciales ?? '?'} size="md" className="bg-primary-50 text-primary-700 border border-primary-100" />
          </div>
        </div>
      </div>
    </header>
  );
}
