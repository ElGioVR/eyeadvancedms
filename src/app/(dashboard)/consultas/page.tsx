"use client";

import { useState, useMemo } from "react";
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
import { useFetch, useDebounce } from "@/hooks";
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
      className={`rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3${full ? " col-span-2" : ""}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
        {label}
      </span>
      <p
        className={`mt-1 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]${full ? " break-words" : ""}`}
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
    error,
    total,
    page: currentPage,
  } = useFetch<ConsultaAPI>("/api/consultas", {
    page: String(page),
    pageSize: "15",
  });
  const [search, setSearch] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("Todos");
  const [today] = useState(() => new Date().toISOString().split("T")[0]);
  const [pagoConsulta, setPagoConsulta] = useState<ConsultaAPI | null>(null);
  const [pagando, setPagando] = useState(false);

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
  }, [consultas, total]);

  async function handlePago() {
    if (!pagoConsulta) return;
    setPagando(true);
    try {
      const res = await fetch(`/api/consultas/${pagoConsulta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estatus_pago: "PAGADO",
          monto_pagado: pagoConsulta.costo_total,
          fecha_pago: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Error al procesar pago");
      toast("Pago registrado exitosamente");
      setPagoConsulta(null);
    } catch {
      toast("Error al procesar el pago", "error");
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

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5"
            >
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-[#202327]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-[#202327] rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-[#202327] rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No se encontraron consultas"
          description="Intente ajustar los filtros de búsqueda."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#2F3336] bg-gray-50/50 dark:bg-[#202327]/50">
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
                      className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] text-left ${h.hide}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-[#1D1F23]/60"
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
                        <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">
                          {c.paciente}
                        </span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600 dark:text-[#E7E9EA]">
                      {c.doctor}
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600 dark:text-[#E7E9EA]">
                      {c.fecha} {c.hora_inicio}
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4">
                      <span className="inline-flex rounded-md bg-gray-100 dark:bg-[#202327] px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:text-[#E7E9EA]">
                        {c.tipo_consulta}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4 text-sm text-gray-600 dark:text-[#E7E9EA] max-w-[200px] truncate">
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
                          className="text-gray-400 dark:text-[#71767B] hover:text-primary-600 transition-colors"
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

      {/* Modal de Confirmación de Pago */}
      {pagoConsulta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => !pagando && setPagoConsulta(null)}>
          <div className="bg-white dark:bg-[#16181C] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-[#E7E9EA]">Registrar Pago</h3>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">Confirmar pago de consulta</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Folio</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{pagoConsulta.folio || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Paciente</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{pagoConsulta.paciente}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Doctor</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{pagoConsulta.doctor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Fecha</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{pagoConsulta.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Tipo</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{pagoConsulta.tipo_consulta}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-[#2F3336] pt-2.5 flex justify-between">
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">Total a pagar</span>
                <span className="text-lg font-extrabold text-emerald-600">${pagoConsulta.costo_total.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setPagoConsulta(null)}
                disabled={pagando}
                className="flex-1 rounded-xl border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors disabled:opacity-50"
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
