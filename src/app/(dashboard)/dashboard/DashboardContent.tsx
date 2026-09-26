"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  Users,
  Calendar,
  Package,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CalendarDays,
  CalendarRange,
  PartyPopper,
  Check,
} from "lucide-react";
import dynamic from "next/dynamic";
import StatCard from "@/components/ui/StatCard";
import Avatar from "@/components/ui/Avatar";
import { useUser } from "@/hooks/useUser";
import { takePrefetched } from "@/lib/prefetch";
import type { DashboardData } from "@/lib/dashboard-data";
import {
  obtenerFestivo,
  obtenerFestivoProximo,
  FESTIVO_EJEMPLO,
  type FestivoActivo,
  type FestivoProximo,
  type Festivo,
} from "@/lib/festivos";

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <div className="h-4 w-40 bg-surface-2 rounded animate-pulse mb-4" />
            <div className="h-[160px] w-full bg-surface-2 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    ),
  },
);

interface ChartData {
  consultasPorEstatus: Record<string, number>;
  topProcedimientos: { nombre: string; cantidad: number }[];
  agendaOcupacion: { nombre: string; cantidad: number }[];
}

interface DashboardContentProps {
  data: DashboardData;
  userNombre: string;
  userIniciales: string;
  userAvatarUrl: string | null;
  userRol: string;
}

// Matriz de colores de estatus (misma que la agenda)
const ESTATUS_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  AGENDADA: "Agendada",
  PROCESADA: "Procesada",
  PENDIENTE_ESTUDIO: "P. Estudio",
  PENDIENTE_CIRUGIA: "P. Cirugía",
  APLAZADA: "Aplazada",
  REAGENDADA: "Reagendada",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};
const ESTATUS_COLOR: Record<string, string> = {
  BORRADOR: "#9ca3af",
  AGENDADA: "#60a5fa",
  PROCESADA: "#3b82f6",
  PENDIENTE_ESTUDIO: "#fbbf24",
  PENDIENTE_CIRUGIA: "#fb923c",
  APLAZADA: "#f59e0b",
  REAGENDADA: "#8b5cf6",
  COMPLETADA: "#10b981",
  CANCELADA: "#ef4444",
};

// Nivel de festividad configurable por usuario (default TOTAL)
type NivelFestividad = "TOTAL" | "MEDIO" | "POCO" | "NADA";
const NIVELES_FESTIVIDAD: Array<{
  value: NivelFestividad;
  label: string;
  descripcion: string;
}> = [
  { value: "TOTAL", label: "Total", descripcion: "Banner decorado completo" },
  { value: "MEDIO", label: "Medio", descripcion: "Banner con gradiente" },
  { value: "POCO", label: "Poco", descripcion: "Solo una insignia" },
  { value: "NADA", label: "Nada", descripcion: "Sin festividades" },
];

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(22, 24, 28, 0.92)",
  border: "1px solid #2F3336",
  borderRadius: 10,
  color: "#E7E9EA",
  fontSize: 12,
  fontWeight: 600,
} as const;

export default function DashboardContent({
  data,
  userNombre,
  userIniciales,
  userAvatarUrl,
  userRol,
}: DashboardContentProps) {
  const router = useRouter();
  const { user: perfilUsuario } = useUser();
  const firstName = userNombre.split(" ")[0] || "Usuario";
  const [greeting, setGreeting] = useState("Buenos días");
  const [festivoActivo, setFestivoActivo] = useState<FestivoActivo | null>(
    null,
  );
  const [festivoProximo, setFestivoProximo] = useState<FestivoProximo | null>(
    null,
  );
  const [nivelFestividad, setNivelFestividad] =
    useState<NivelFestividad>("TOTAL");
  const [nivelDropdownOpen, setNivelDropdownOpen] = useState(false);
  const [previewFestivo, setPreviewFestivo] = useState<Festivo | null>(null);
  const nivelButtonRef = useRef<HTMLButtonElement>(null);
  const [nivelPos, setNivelPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);

  useEffect(() => {
    const tijuanaNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Tijuana" }),
    );
    const tijuanaHour = tijuanaNow.getHours();
    setGreeting(
      tijuanaHour < 12
        ? "Buenos días"
        : tijuanaHour < 19
          ? "Buenas tardes"
          : "Buenas noches",
    );
    const activo = obtenerFestivo(tijuanaNow);
    setFestivoActivo(activo);
    if (!activo) setFestivoProximo(obtenerFestivoProximo(tijuanaNow));
  }, []);

  // Preferencias del usuario: nivel de festividad (default TOTAL)
  useEffect(() => {
    // Reutiliza el perfil compartido de useUser (sin GET extra a /api/usuarios/me)
    const nivel = perfilUsuario?.preferencias?.festividad;
    if (typeof nivel === "string" && NIVELES_FESTIVIDAD.some((n) => n.value === nivel)) {
      setNivelFestividad(nivel as NivelFestividad);
    }
  }, [perfilUsuario]);

  async function cambiarNivelFestividad(nivel: NivelFestividad) {
    setNivelFestividad(nivel);
    setNivelDropdownOpen(false);
    try {
      await fetch("/api/usuarios/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferencias: { festividad: nivel } }),
      });
    } catch {
      // Silencioso: el nivel queda aplicado en sesión aunque falle el guardado
    }
  }

  const festivo = festivoActivo?.festivo ?? null;
  // Vista previa: simula un festivo activo para ver el banner decorado
  const festivoEfectivo: FestivoActivo | null = previewFestivo
    ? { festivo: previewFestivo, inicioHoy: false, diasFestivoRestantes: 1 }
    : festivoActivo;
  const festivoMostrado = festivoEfectivo?.festivo ?? null;
  const mostrarBannerFestivo =
    !!festivoMostrado &&
    (nivelFestividad === "TOTAL" || nivelFestividad === "MEDIO");
  const mostrarChipFestivo = !!festivoMostrado && nivelFestividad !== "NADA";
  const mostrarDecoraciones = nivelFestividad === "TOTAL";
  const mostrarFestividad = nivelFestividad !== "NADA";

  useEffect(() => {
    const ctrl = new AbortController();
    // Reutiliza la precarga hecha en /bienvenida si existe (sin request extra)
    const precargado = takePrefetched<ChartData>("/api/dashboard/charts");
    const peticion =
      precargado ??
      fetch("/api/dashboard/charts", { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<ChartData>) : null));
    peticion
      .then((d) => {
        if (d && !ctrl.signal.aborted) setChartData(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const stats = [
    {
      label: "Pacientes Totales",
      value: data.stats.totalPacientes.toString(),
      icon: Users,
      color: "text-primary-500",
      bgColor: "bg-primary-50 dark:bg-primary-500/10",
      borderColor: "border-primary-100 dark:border-primary-500/20",
    },
    {
      label: "Consultas Hoy",
      value: data.stats.consultasHoy.toString(),
      icon: CalendarDays,
      color: "text-sky-600 dark:text-sky-400",
      bgColor: "bg-sky-50 dark:bg-sky-500/10",
      borderColor: "border-sky-100 dark:border-sky-500/20",
    },
    {
      label: "Consultas Semana",
      value: data.stats.consultasSemana.toString(),
      icon: CalendarRange,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-500/10",
      borderColor: "border-violet-100 dark:border-violet-500/20",
    },
    {
      label: "LIOs Bajo Stock",
      value: data.stats.lentesBajoStock.toString(),
      icon: Package,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-500/10",
      borderColor: "border-amber-100 dark:border-amber-500/20",
    },
  ];

  const estatusChartData = chartData
    ? Object.entries(chartData.consultasPorEstatus).map(([estatus, count]) => ({
        name: ESTATUS_LABEL[estatus] || estatus,
        count,
      }))
    : [];

  const procChartData = (chartData?.topProcedimientos ?? [])
    .slice(0, 5)
    .map((p) => ({
      name: p.nombre.length > 16 ? `${p.nombre.slice(0, 15)}…` : p.nombre,
      count: p.cantidad,
    }));

  const agendaChartData = (chartData?.agendaOcupacion ?? [])
    .slice(0, 5)
    .map((d) => ({
      name: d.nombre.split(" ")[0],
      count: d.cantidad,
    }));

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
      {/* Banner dinámico: festivo (según nivel de festividad) o saludo estándar */}
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl p-5 sm:p-7 shadow-card ring-1 transition-colors duration-500 dark:shadow-none",
          mostrarBannerFestivo && festivoMostrado
            ? cn(
                "bg-gradient-to-r",
                festivoMostrado.gradient,
                festivoMostrado.anillo,
                "shadow-lg",
              )
            : "bg-surface border border-line ring-transparent",
        )}
      >
        {(!mostrarBannerFestivo || !festivoMostrado) && (
          <>
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary-400/20 blur-3xl dark:bg-primary-500/20" />
            <div className="pointer-events-none absolute -bottom-24 right-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(var(--line))_1px,transparent_1px)] [background-size:18px_18px] opacity-40 [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
          </>
        )}
        {mostrarBannerFestivo && mostrarDecoraciones && festivoMostrado && (
          <>
            {/* Blobs de luz */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
            {/* Emojis decorativos flotantes */}
            {festivoMostrado.decoraciones.map((emo, i) => (
              <span
                key={`${festivoMostrado.id}-deco-${i}`}
                aria-hidden
                className={cn(
                  "absolute pointer-events-none select-none opacity-25",
                  [
                    "left-[4%] top-1 -rotate-12 text-4xl sm:text-5xl",
                    "left-[30%] bottom-0 rotate-6 text-3xl sm:text-4xl",
                    "right-[22%] top-2 -rotate-6 text-3xl sm:text-4xl",
                    "right-[4%] bottom-1 rotate-12 text-4xl sm:text-5xl",
                  ][i % 4],
                )}
              >
                {emo}
              </span>
            ))}
          </>
        )}
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-sm font-semibold",
                  mostrarBannerFestivo && festivoMostrado
                    ? "text-white/80"
                    : "text-muted",
                )}
              >
                {greeting}
              </p>
              {mostrarChipFestivo && festivoMostrado && festivoEfectivo && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold text-white backdrop-blur-sm",
                    mostrarBannerFestivo
                      ? "bg-white/15"
                      : cn("bg-gradient-to-r", festivoMostrado.gradient),
                  )}
                >
                  <span className="text-sm leading-none">
                    {festivoMostrado.emoji}
                  </span>
                  {festivoMostrado.nombre}
                </span>
              )}
              {mostrarChipFestivo && festivoMostrado && festivoEfectivo && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                    mostrarBannerFestivo
                      ? "bg-white text-gray-900 shadow-sm"
                      : "bg-primary-600 text-white shadow-sm",
                  )}
                >
                  {previewFestivo
                    ? "Vista previa"
                    : festivoEfectivo.inicioHoy
                      ? "¡Es hoy!"
                      : festivoEfectivo.diasFestivoRestantes === 1
                        ? "Último día"
                        : `Termina en ${festivoEfectivo.diasFestivoRestantes - 1} día${festivoEfectivo.diasFestivoRestantes - 1 !== 1 ? "s" : ""}`}
                </span>
              )}
            </div>
            <h1
              className={cn(
                "mt-1 text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-10",
                mostrarBannerFestivo && festivoMostrado
                  ? "text-white drop-shadow-sm"
                  : "text-fg",
              )}
            >
              Hola, {firstName}
            </h1>
            <p
              className={cn(
                "mt-1 text-sm",
                mostrarBannerFestivo && festivoMostrado
                  ? "text-white/85"
                  : "text-muted",
              )}
            >
              {mostrarBannerFestivo && festivoMostrado
                ? festivoMostrado.mensaje
                : `Tienes ${data.stats.consultasHoy} consulta${data.stats.consultasHoy !== 1 ? "s" : ""} y ${data.citas.length} cita${data.citas.length !== 1 ? "s" : ""} para hoy.`}
            </p>
            {mostrarFestividad &&
              !festivo &&
              !previewFestivo &&
              festivoProximo && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-fg-2 ring-1 ring-gray-200 dark:ring-line">
                  <span className="text-sm leading-none">
                    {festivoProximo.festivo.emoji}
                  </span>
                  <span>
                    Próximo: {festivoProximo.festivo.nombre}{" "}
                    {festivoProximo.diasRestantes === 1
                      ? "mañana"
                      : `en ${festivoProximo.diasRestantes} días`}
                  </span>
                </div>
              )}
          </div>
          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="relative group/nivel">
              <button
                ref={nivelButtonRef}
                onClick={() => {
                  const rect = nivelButtonRef.current?.getBoundingClientRect();
                  if (rect)
                    setNivelPos({
                      top: rect.bottom + 6,
                      right: window.innerWidth - rect.right,
                    });
                  setNivelDropdownOpen(!nivelDropdownOpen);
                }}
                aria-label="Nivel de festividad"
                className={cn(
                  "inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                  mostrarBannerFestivo && festivoMostrado
                    ? "bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                    : "border border-line bg-white dark:bg-surface-2 text-gray-500 dark:text-fg-2 hover:bg-gray-50 dark:hover:bg-surface-3 hover:text-gray-700 dark:hover:text-fg",
                )}
              >
                <PartyPopper className="h-4 w-4" />
              </button>
              {/* Tooltip propio (el title nativo no siempre aparece) */}
              <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md bg-gray-900 dark:bg-surface-3 text-white text-[11px] font-bold px-2.5 py-1.5 shadow-lg ring-1 ring-black/10 dark:ring-white/10 opacity-0 group-hover/nivel:opacity-100 transition-opacity duration-150">
                Nivel de festividad
              </span>
              {nivelDropdownOpen &&
                nivelPos &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setNivelDropdownOpen(false)}
                    />
                    <div
                      className="fixed z-50 w-60 bg-surface border border-line rounded-xl shadow-lg overflow-hidden"
                      style={{ top: nivelPos.top, right: nivelPos.right }}
                    >
                      <div className="px-3 py-2 border-b border-line/70">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                          Nivel de festividad
                        </p>
                      </div>
                      <div className="p-1">
                        {NIVELES_FESTIVIDAD.map((n) => (
                          <button
                            key={n.value}
                            onClick={() => cambiarNivelFestividad(n.value)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg text-sm transition-colors",
                              nivelFestividad === n.value
                                ? "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 font-bold"
                                : "text-fg-2 hover:bg-surface-2",
                            )}
                          >
                            <span className="w-4 shrink-0">
                              {nivelFestividad === n.value && (
                                <Check className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block">{n.label}</span>
                              <span className="block text-[11px] font-medium text-muted">
                                {n.descripcion}
                              </span>
                            </span>
                          </button>
                        ))}
                        <div className="border-t border-line/70 my-1" />
                        <button
                          onClick={() => {
                            setPreviewFestivo(
                              previewFestivo ? null : FESTIVO_EJEMPLO,
                            );
                            setNivelDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg text-sm font-bold transition-colors",
                            previewFestivo
                              ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                              : "text-fg-2 hover:bg-surface-2",
                          )}
                        >
                          <span className="w-4 shrink-0 text-center">👁</span>
                          {previewFestivo
                            ? "Salir del ejemplo"
                            : "Ver ejemplo (Halloween)"}
                        </button>
                      </div>
                    </div>
                  </>,
                  document.body,
                )}
            </div>
            {userRol !== "doctor" && (
              <div className="relative">
                <button
                  onClick={() => setDoctorDropdownOpen(!doctorDropdownOpen)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    festivoMostrado
                      ? "bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                      : "border border-line bg-white dark:bg-surface-2 text-fg-2 hover:bg-gray-50 dark:hover:bg-surface-3",
                  )}
                >
                  <Users className="h-4 w-4 opacity-80" />
                  Ver como
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {doctorDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDoctorDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-line rounded-xl shadow-lg z-50 overflow-hidden">
                      <div className="px-3 py-2 border-b border-line/70">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                          Filtrar por doctor
                        </p>
                      </div>
                      <div className="p-1">
                        <button
                          onClick={() => {
                            router.push("/dashboard");
                            setDoctorDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 rounded-lg text-sm font-medium text-fg-2 transition-colors"
                        >
                          Todos los doctores
                        </button>
                        {data.doctores.map((doctor) => (
                          <button
                            key={doctor.id}
                            onClick={() => {
                              router.push(`/dashboard?doctor=${doctor.id}`);
                              setDoctorDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 rounded-lg text-sm font-medium text-fg-2 transition-colors"
                          >
                            <Avatar
                              initials={doctor.iniciales}
                              className="h-6 w-6 text-[10px] bg-sky-500"
                            />
                            <span className="truncate text-fg-2">
                              {doctor.nombre}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <Avatar
              initials={userIniciales}
              src={userAvatarUrl}
              className={cn(
                "h-14 w-14 text-lg",
                mostrarBannerFestivo &&
                  festivoMostrado &&
                  "ring-2 ring-white/50 shadow-lg",
              )}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
            borderColor={stat.borderColor}
          />
        ))}
      </div>

      {/* Citas de hoy + Inventario bajo */}
      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold tracking-tight text-fg">
                Citas de Hoy
              </h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary-100 dark:bg-primary-500/15 px-1.5 text-[11px] font-bold text-primary-700 dark:text-primary-300">
                {data.citas.length}
              </span>
            </div>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-line/60 max-h-[320px] overflow-y-auto">
            {data.citas.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted">
                Sin citas programadas para hoy
              </div>
            )}
            {data.citas.map((cita) => (
              <div
                key={cita.id}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/60 dark:hover:bg-surface-2/60 md:grid md:grid-cols-[64px_minmax(150px,1fr)_minmax(130px,0.9fr)_100px] md:items-center md:gap-0"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden h-2 w-2 rounded-full bg-primary-400 md:block" />
                  <span className="text-sm font-extrabold leading-tight text-primary-700 dark:text-primary-400">
                    {cita.hora}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-bold text-fg group-hover:text-primary-700 transition-colors">
                    {cita.paciente}
                  </div>
                </div>
                <div className="hidden min-w-0 md:block md:text-left">
                  <div className="truncate text-[13px] font-medium text-fg-2">
                    {cita.doctor}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {cita.diagnostico}
                  </div>
                </div>
                <span className="hidden w-fit rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-center text-xs font-semibold text-muted md:block">
                  {cita.tipo}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold tracking-tight text-fg">
                LIOs Bajo Stock
              </h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                {data.lentesBajoStock.length}
              </span>
            </div>
            <Link
              href="/inventario"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver inventario
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-2.5 p-4 max-h-[320px] overflow-y-auto">
            {data.lentesBajoStock.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted">
                Todo en orden — sin stock bajo
              </div>
            )}
            {data.lentesBajoStock.map((item) => (
              <div
                key={item.id}
                className="group rounded-xl border border-amber-100 dark:border-amber-800/40 bg-gradient-to-r from-amber-50/80 to-orange-50/40 dark:from-amber-900/20 dark:to-orange-900/10 p-3 transition-all hover:shadow-sm hover:border-amber-200 dark:hover:border-amber-700"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15 ring-1 ring-amber-200 dark:ring-amber-500/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-fg leading-snug">
                      {item.nombre}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {item.detalle}
                    </div>
                  </div>
                  <span className="whitespace-nowrap rounded-lg bg-white dark:bg-surface-2 px-2.5 py-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-500/30 shadow-sm">
                    {item.stock} pzas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Gráficas (recharts, carga diferida) */}
      <DashboardCharts
        estatusChartData={estatusChartData}
        procChartData={procChartData}
        agendaChartData={agendaChartData}
      />
    </div>
  );
}
