"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Eye,
  Activity,
  ClipboardList,
  CreditCard,
} from "lucide-react";
import { useFetch, useDebounce, useInvalidar } from "@/hooks";
import { REFRESCO_COMPARTIDO_MS } from "@/hooks/useFetch";
import { enviarJSON } from "@/lib/fetcher";
import BarraRevalidando from "@/components/ui/BarraRevalidando";
import StatCard from "@/components/ui/StatCard";
import SearchInput from "@/components/ui/SearchInput";
import FilterSelect from "@/components/ui/FilterSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";

interface EstudioDetalle {
  nombre: string;
  doctor: string | null;
}

interface ConsultaAPI {
  id: string;
  folio: string | null;
  paciente: string;
  iniciales: string;
  doctor: string;
  doctor_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_consulta: string;
  tipo_visita: string;
  diagnostico: string;
  estudios: string;
  estudios_detalle: EstudioDetalle[];
  procedimiento: string;
  procedimiento_doctor: string | null;
  notas: string;
  estatus: string;
  estatus_pago: string;
  costo_total: number;
  metodo_pago: string | null;
}

const estatusPagoConfig: Record<string, { bg: string; text: string; dot: string }> =
  {
    PAGADO: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      dot: "bg-emerald-500",
    },
    PENDIENTE_PAGO: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      dot: "bg-amber-500",
    },
  };

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface px-4 py-3${full ? " col-span-2" : ""}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </span>
      <p
        className={`mt-1 text-sm font-medium text-gray-900 dark:text-fg${full ? " break-words" : ""}`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export default function ConsultasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const {
    data: consultas,
    loading,
    validating,
    error,
    total,
    page: currentPage,
    mutate,
  } = useFetch<ConsultaAPI>("/api/consultas", {
    page: String(page),
    pageSize: "15",
  }, { refreshInterval: REFRESCO_COMPARTIDO_MS });
  const [search, setSearch] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("Todos");
  const [today, setToday] = useState('');
  const [pagoConsulta, setPagoConsulta] = useState<ConsultaAPI | null>(null);

  useEffect(() => { setToday(new Date().toISOString().split('T')[0]); }, []);
  const [pagando, setPagando] = useState(false);
  const invalidar = useInvalidar();

  const debouncedSearch = useDebounce(search);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return consultas.filter((c) => {
      const matchesSearch =
        !term ||
        c.paciente.toLowerCase().includes(term) ||
        c.doctor.toLowerCase().includes(term) ||
        (c.folio && c.folio.toLowerCase().includes(term));
      const matchesDoctor =
        filterDoctor === "Todos" || c.doctor === filterDoctor;
      return matchesSearch && matchesDoctor;
    });
  }, [consultas, debouncedSearch, filterDoctor]);

  const doctors = useMemo(() => {
    const unique = [...new Set(consultas.map((c) => c.doctor).filter(Boolean))];
    return ["Todos", ...unique];
  }, [consultas]);

  const stats = useMemo(() => {
    const hoy = consultas.filter((c) => c.fecha === today).length;
    return [
      {
        label: "Total Consultas",
        value: String(total),
        icon: Calendar,
        color: "text-primary-600",
        bgColor: "bg-primary-50",
        borderColor: "border-primary-100",
      },
      {
        label: "Consultas Hoy",
        value: String(hoy),
        icon: Clock,
        color: "text-sky-600",
        bgColor: "bg-sky-50",
        borderColor: "border-sky-100",
      },
      {
        label: "Este Mes",
        value: String(total),
        icon: CheckCircle,
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-100",
      },
      {
        label: "Doctores",
        value: String(
          new Set(consultas.map((c) => c.doctor).filter(Boolean)).size,
        ),
        icon: AlertTriangle,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-100",
      },
    ];
  }, [consultas, total, today]);

  async function handlePago() {
    if (!pagoConsulta || pagando) return;
    const objetivo = pagoConsulta;
    setPagando(true);
    // Marca la fila como pagada en la caché de esta página (se revierte si el servidor falla).
    const marcarPagada = (actual: unknown) => {
      const resp = actual as { data?: ConsultaAPI[] } | undefined;
      if (!resp || !Array.isArray(resp.data)) return actual;
      return {
        ...resp,
        data: resp.data.map((c) => (c.id === objetivo.id ? { ...c, estatus_pago: "PAGADO" } : c)),
      };
    };
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON(`/api/consultas/${objetivo.id}`, "PATCH", {
            estatus_pago: "PAGADO",
            monto_pagado: objetivo.costo_total,
            fecha_pago: new Date().toISOString(),
          });
          return marcarPagada(actual);
        },
        { optimisticData: marcarPagada, rollbackOnError: true, populateCache: true, revalidate: false },
      );
      toast("Pago registrado exitosamente");
      setPagoConsulta(null);
      void invalidar("/api/consultas", "/api/dashboard", "/api/pacientes");
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Error al procesar el pago", "error");
    } finally {
      setPagando(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="CONSULTAS MEDICAS"
        subtitle="Registro y seguimiento de consultas oftalmológicas."
        action={
          <Link
            href="/consultas/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Consulta
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por paciente, doctor o ID..."
          aria-label="Buscar consultas"
          className="flex-1 sm:min-w-[280px]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            id="filter-doctor"
            label="Doctor"
            value={filterDoctor}
            onChange={setFilterDoctor}
            options={doctors}
          />
        </div>
      </div>

      <div className="relative" aria-busy={loading || validating}>
      <BarraRevalidando activo={validating && !loading} className="-top-2" />
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-surface-2 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-surface-2 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 animate-fadeIn">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No se encontraron consultas"
          description="Intente ajustar los filtros de búsqueda."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line/70 bg-gray-50/50 dark:bg-surface-2/50">
                  {[
                    { label: "Folio", hide: "" },
                    { label: "Paciente", hide: "" },
                    { label: "Doctor", hide: "hidden md:table-cell" },
                    { label: "Fecha / Hora", hide: "hidden md:table-cell" },
                    { label: "Tipo", hide: "hidden lg:table-cell" },
                    { label: "Diagnóstico", hide: "hidden lg:table-cell" },
                    { label: "Estado", hide: "hidden sm:table-cell" },
                    { label: "Acciones", hide: "hidden sm:table-cell" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      scope="col"
                      className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted text-left ${h.hide}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 anim-lista">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-surface-2/60"
                  >
                    <td className="px-5 py-4 text-xs font-bold text-primary-600">
                      {c.folio || c.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          initials={c.iniciales}
                          className="bg-primary-500"
                          size="sm"
                        />
                        <span className="text-sm font-bold text-fg truncate">
                          {c.paciente}
                        </span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-fg-2">
                      {c.doctor}
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-fg-2">
                      {c.fecha} {c.hora_inicio}
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4">
                      <span className="inline-flex rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-2">
                        {c.tipo_consulta}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4 text-sm text-fg-2 max-w-[200px] truncate">
                      {c.diagnostico || "—"}
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4">
                      <StatusBadge status={c.estatus_pago || 'PENDIENTE_PAGO'} config={estatusPagoConfig} />
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4">
                      <div className="flex items-center gap-2">
                        {c.estatus_pago !== 'PAGADO' && c.costo_total > 0 && (
                          <button
                            aria-label={`Registrar pago de ${c.paciente}`}
                            onClick={() => setPagoConsulta(c)}
                            className="text-amber-500 hover:text-amber-600 transition-colors"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          aria-label={`Ver consulta de ${c.paciente}`}
                          onClick={() => router.push(`/consultas/${c.id}`)}
                          className="text-muted hover:text-primary-600 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            total={total}
            pageSize={15}
            totalItems={filtered.length}
            onPageChange={(p) => setPage(p)}
            label="consultas"
          />
        </div>
      )}
      </div>

      {/* Modal de Confirmación de Pago */}
      {pagoConsulta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fadeIn" onClick={() => !pagando && setPagoConsulta(null)}>
          <div role="dialog" aria-modal="true" aria-label="Registrar pago" className="bg-surface rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md shadow-xl animate-popIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-fg">Registrar Pago</h3>
                <p className="text-xs text-muted">Confirmar pago de consulta</p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Folio</span>
                <span className="font-bold text-fg">{pagoConsulta.folio || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Paciente</span>
                <span className="font-bold text-fg">{pagoConsulta.paciente}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Doctor</span>
                <span className="font-bold text-fg">{pagoConsulta.doctor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Fecha</span>
                <span className="font-bold text-fg">{pagoConsulta.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tipo</span>
                <span className="font-bold text-fg">{pagoConsulta.tipo_consulta}</span>
              </div>
              <div className="border-t border-line pt-2.5 flex justify-between">
                <span className="font-bold text-fg">Total a pagar</span>
                <span className="text-lg font-extrabold text-emerald-600">${pagoConsulta.costo_total.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setPagoConsulta(null)}
                disabled={pagando}
                className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePago}
                disabled={pagando}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pagando ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {pagando ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
