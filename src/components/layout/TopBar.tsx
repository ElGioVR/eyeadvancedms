"use client";

import { useInvalidar } from '@/hooks/useFetch';
import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Search,
  User,
  Stethoscope,
  Package,
  X,
  Check,
  LogOut,
  Eye,
  EyeOff,
  ChevronDown,
  Wallet,
} from "lucide-react";
import { useUser, clearUserCache } from "@/hooks/useUser";
import Avatar from "@/components/ui/Avatar";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { enviarJSON } from "@/lib/fetcher";
import BarraRevalidando from "@/components/ui/BarraRevalidando";
import { cn } from "@/lib/utils";

interface SearchResult {
  tipo: string;
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
}

interface Notificacion {
  id: string;
  tipo: "info" | "warning" | "error";
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
};

const tipoLabels: Record<string, string> = {
  paciente: "Pacientes",
  consulta: "Consultas",
  lente: "Inventario",
  doctor: "Doctores",
};

const notifColors: Record<string, string> = {
  info: "bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  error: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
};

/** Ícono según la entidad de la notificación. */
const notifEntityIcon: Record<string, typeof User> = {
  consulta: Stethoscope,
  agenda_cirugia: CalendarDays,
  cirugia: CalendarDays,
  inventario_item: Package,
  lente: Package,
  honorarios: Wallet,
};

/** A dónde lleva cada notificación al tocarla. */
function notifHref(n: Notificacion): string | null {
  switch (n.entidad_tipo) {
    case "consulta":
      return n.entidad_id ? `/consultas/${n.entidad_id}` : "/agenda";
    case "agenda_cirugia":
    case "cirugia":
      return n.entidad_id ? `/cirugias/${n.entidad_id}` : "/agenda";
    case "inventario_item":
    case "lente":
      return "/inventario";
    case "honorarios":
      return "/mis-honorarios";
    default:
      return null;
  }
}

function formatNotifTime(dateStr: string, now: Date): string {
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

/** Mismas URLs que precarga /bienvenida (el fetcher global consume la precarga). */
const URL_NO_LEIDAS = "/api/notificaciones/unread-count";
const URL_NOTIFICACIONES = "/api/notificaciones";

interface ListaNotificaciones {
  data?: Notificacion[];
}

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar(_props: TopBarProps) {
  const { user } = useUser();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  // La lista solo se pide al abrir el panel la primera vez; luego queda en caché.
  const [listaSolicitada, setListaSolicitada] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [modoFocus, setModoFocus] = useState(false);
  const invalidarDatos = useInvalidar();
  const [now, setNow] = useState<Date | null>(null);
  const [todayLabel, setTodayLabel] = useState('');
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Contador de no leídas: sondeo cada 30 s SOLO con la pestaña visible
  // (refreshWhenHidden: false); al volver a la pestaña SWR revalida al enfocar.
  const { data: conteo, mutate: mutateConteo } = useSWR<{ count: number }>(
    user ? URL_NO_LEIDAS : null,
    { refreshInterval: 30000, refreshWhenHidden: false }
  );
  const unreadCount = conteo?.count ?? 0;

  const {
    data: listaResp,
    isLoading: notifLoading,
    isValidating: notifValidando,
    mutate: mutateLista,
  } = useSWR<ListaNotificaciones>(listaSolicitada ? URL_NOTIFICACIONES : null);
  const notifications = listaResp?.data ?? [];

  // Sincroniza el contador con lo que realmente hay (la lista trae las 50 más recientes)
  useEffect(() => {
    const lista = listaResp?.data;
    if (!lista) return;
    const noLeidas = lista.filter((n) => !n.leido).length;
    void mutateConteo(
      (prev) => ({ count: lista.length < 50 ? noLeidas : Math.max(prev?.count ?? 0, noLeidas) }),
      { revalidate: false }
    );
  }, [listaResp, mutateConteo]);

  // El perfil ya trae modo_focus (evita un GET /api/usuarios/me duplicado)
  useEffect(() => {
    if (user) setModoFocus(user.modo_focus);
  }, [user]);

  useEffect(() => {
    const updateNow = () => {
      const current = new Date();
      setNow(current);
      setTodayLabel(current.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }));
    };
    updateNow();
    const id = setInterval(updateNow, 60000);
    return () => clearInterval(id);
  }, []);

  async function toggleModoFocus() {
    const next = !modoFocus;
    setModoFocus(next);
    try {
      await enviarJSON("/api/usuarios/me", "PATCH", { preferencias: { modo_focus: next } });
      // Notifica al resto de la UI (nav móvil, vistas) que el modo focus cambió
      window.dispatchEvent(new CustomEvent("modo-focus-changed", { detail: next }));
      // El servidor filtra por modo focus: refrescar (en segundo plano) lo que depende de él
      void invalidarDatos("/api/consultas", "/api/agenda", "/api/dashboard", "/api/productividad");
    } catch {
      setModoFocus(!next);
    }
  }

  async function toggleNotifPanel() {
    if (notifOpen) {
      setNotifOpen(false);
      return;
    }
    setNotifOpen(true);
    // Primera apertura: la clave se activa y SWR la pide. Siguientes: se muestra
    // la lista en caché al instante y se revalida en segundo plano.
    if (!listaSolicitada) setListaSolicitada(true);
    else void mutateLista();
  }

  /** Marca como leídas con actualización optimista de la lista y del contador; revierte si falla. */
  async function marcarLeidas(ids: string[] | "all") {
    const esTodas = ids === "all";
    const marcar = (n: Notificacion) => (esTodas || ids.includes(n.id) ? { ...n, leido: true } : n);
    const nuevasLeidas = esTodas ? unreadCount : ids.length;
    const listaPrevia = listaResp;
    const conteoPrevio = conteo;
    void mutateLista((prev) => (prev ? { ...prev, data: (prev.data ?? []).map(marcar) } : prev), { revalidate: false });
    void mutateConteo({ count: esTodas ? 0 : Math.max(0, unreadCount - nuevasLeidas) }, { revalidate: false });
    try {
      await enviarJSON(URL_NOTIFICACIONES, "PATCH", esTodas ? { all: true } : { ids });
    } catch {
      void mutateLista(listaPrevia, { revalidate: false });
      void mutateConteo(conteoPrevio, { revalidate: true });
    }
  }

  function markAsRead(ids: string[]) {
    if (ids.length === 0) return;
    void marcarLeidas(ids);
  }

  function markAllAsRead() {
    void marcarLeidas("all");
  }

  function handleNotifClick(n: Notificacion) {
    if (!n.leido) markAsRead([n.id]);
    const href = notifHref(n);
    if (href) router.push(href);
    setNotifOpen(false);
  }

  // Solo se aplica la respuesta de la búsqueda más reciente (ignora las fuera de orden).
  const busquedaRef = useRef(0);
  const performSearch = useCallback(async (q: string) => {
    const idBusqueda = ++busquedaRef.current;
    if (q.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (idBusqueda !== busquedaRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (idBusqueda !== busquedaRef.current) return;
        setSearchResults(data.results);
        setSearchOpen(data.results.length > 0);
      }
    } catch {
      if (idBusqueda === busquedaRef.current) setSearchResults([]);
    } finally {
      if (idBusqueda === busquedaRef.current) setSearchLoading(false);
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
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleResultClick(href: string) {
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setMobileSearchOpen(false);
      inputRef.current?.blur();
    }
  }

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>(
    (acc, r) => {
      (acc[r.tipo] ??= []).push(r);
      return acc;
    },
    {},
  );

  const iconBtn =
    "relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 glass pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Logo compacto en móvil */}
          <div className="shrink-0 lg:hidden">
            <img
              src="/images/eyeadvanced-logo.png"
              alt="EyeAdvanced"
              className="block h-7 w-auto dark:hidden"
              style={{ width: "auto" }}
            />
            <img
              src="/images/eyeadvanced-logo-white.png"
              alt="EyeAdvanced"
              className="hidden h-7 w-auto dark:block"
              style={{ width: "auto" }}
            />
          </div>

          <div
            ref={searchRef}
            className={cn(
              "flex-1 max-w-xl",
              mobileSearchOpen
                ? "absolute inset-x-0 top-[env(safe-area-inset-top)] z-10 flex h-16 items-center gap-2 bg-surface px-3 sm:static sm:h-auto sm:bg-transparent sm:px-0"
                : "relative hidden sm:flex"
            )}
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar paciente, lente, consulta..."
                className="h-10 w-full rounded-xl border border-transparent bg-surface-2 pl-10 pr-16 text-sm text-fg placeholder:text-muted transition-all focus:border-primary-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary-500/15"
              />
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchOpen(false);
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted hover:text-fg"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted md:block">
                  Buscar
                </kbd>
              )}
            </div>
            {mobileSearchOpen && (
              <button
                onClick={() => {
                  setMobileSearchOpen(false);
                  setSearchOpen(false);
                }}
                className="shrink-0 px-2 text-sm font-medium text-primary-600 dark:text-primary-300 sm:hidden"
              >
                Cancelar
              </button>
            )}

            {searchOpen && (
              <div
                className={cn(
                  "absolute z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-popIn",
                  mobileSearchOpen ? "inset-x-3 top-full sm:inset-x-0 sm:mt-2" : "left-0 right-0 top-full mt-2"
                )}
              >
                {searchLoading && (
                  <div className="px-3 py-3 text-sm text-muted">Buscando...</div>
                )}
                {!searchLoading &&
                  searchResults.length === 0 &&
                  searchQuery.length >= 2 && (
                    <div className="px-3 py-3 text-sm text-muted">
                      Sin resultados para &quot;{searchQuery}&quot;
                    </div>
                  )}
                {!searchLoading &&
                  Object.entries(groupedResults).map(([tipo, items]) => {
                    const Icon = tipoIcons[tipo] ?? User;
                    return (
                      <div key={tipo} className="py-1">
                        <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {tipoLabels[tipo] ?? tipo}
                        </div>
                        {items.map((r) => (
                          <button
                            key={`${r.tipo}-${r.id}`}
                            onClick={() => handleResultClick(r.href)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-fg">{r.titulo}</div>
                              <div className="truncate text-xs text-muted">{r.subtitulo}</div>
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

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={() => {
              setMobileSearchOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className={cn(iconBtn, "sm:hidden")}
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>

          <div className="mr-1 hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg-2 md:flex">
            <CalendarDays className="h-4 w-4 text-primary-500" />
            {todayLabel}
          </div>

          <ThemeToggle className="hidden sm:inline-flex" />

          <div ref={notifRef} className="relative">
            <button onClick={toggleNotifPanel} className={iconBtn} aria-label="Notificaciones">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="fixed inset-x-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-popIn sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96" aria-busy={notifLoading || notifValidando}>
                <BarraRevalidando activo={notifValidando && !notifLoading} />
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-sm font-semibold text-fg">Notificaciones</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300"
                    >
                      Marcar todo leído
                    </button>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-1.5">
                  {notifLoading && (
                    <div className="space-y-1" aria-label="Cargando notificaciones">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
                            <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!notifLoading && notifications.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Bell className="h-5 w-5" />
                      </span>
                      <span className="text-sm text-muted">Sin notificaciones</span>
                    </div>
                  )}
                  {!notifLoading &&
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                          !n.leido && "bg-primary-50/60 dark:bg-primary-400/5"
                        )}
                      >
                        {(() => {
                          const Icono = (n.entidad_tipo && notifEntityIcon[n.entidad_tipo]) || Bell;
                          return (
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${notifColors[n.tipo] ?? notifColors.info}`}
                            >
                              <Icono className="h-4 w-4" />
                            </span>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-fg">{n.titulo}</span>
                            {!n.leido && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.mensaje}</p>
                          <span className="mt-1 block text-[10px] text-muted/80">
                            {now ? formatNotifTime(n.created_at, now) : "..."}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-surface-2"
              aria-label="Menú de usuario"
            >
              <Avatar
                initials={user?.iniciales ?? "?"}
                src={user?.avatar_url}
                size="sm"
                className="h-9 w-9 bg-gradient-to-br from-primary-500 to-primary-700 text-white"
              />
              <ChevronDown
                className={`hidden h-3.5 w-3.5 text-muted transition-transform sm:block ${userMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-popIn">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                  <Avatar
                    initials={user?.iniciales ?? "?"}
                    src={user?.avatar_url}
                    size="md"
                    className="bg-gradient-to-br from-primary-500 to-primary-700 text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{user?.nombre}</p>
                    <p className="truncate text-xs text-muted">{user?.email}</p>
                    <span className="mt-1 inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700 dark:bg-primary-400/15 dark:text-primary-300">
                      {user?.rol}
                    </span>
                  </div>
                </div>

                <div className="p-1.5">
                  {user?.rol === "admin" && (
                    <button
                      onClick={toggleModoFocus}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      {modoFocus ? (
                        <EyeOff className="h-4 w-4 text-primary-500" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted" />
                      )}
                      <div className="flex-1">
                        <span className="text-sm text-fg">Modo Focus</span>
                        <p className="text-[11px] text-muted">Ver solo tu información</p>
                      </div>
                      <div
                        className={`relative h-5 w-9 rounded-full transition-colors ${modoFocus ? "bg-primary-500" : "bg-surface-3"}`}
                      >
                        <div
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${modoFocus ? "left-[18px]" : "left-0.5"}`}
                        />
                      </div>
                    </button>
                  )}
                  <ThemeToggle withLabel className="w-full justify-start px-3 text-fg sm:hidden" />
                  <button
                    onClick={async () => {
                      clearUserCache();
                      await fetch("/api/auth/logout", { method: "POST" });
                      window.location.href = "/login";
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="text-sm">Cerrar sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
