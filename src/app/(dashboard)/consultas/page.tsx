'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Eye,
  Banknote,
  Activity,
  ClipboardList,
} from 'lucide-react';
import { useFetch, useDebounce } from '@/hooks';
import StatCard from '@/components/ui/StatCard';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';

interface ConsultaAPI {
  id: string;
  paciente: string;
  iniciales: string;
  doctor: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_consulta: string;
  tipo_visita: string;
  diagnostico: string;
  estudios: string;
  procedimiento: string;
  notas: string;
}

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white px-4 py-3${full ? ' col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <p className={`mt-1 text-sm font-medium text-gray-900${full ? ' break-words' : ''}`}>{value || '—'}</p>
    </div>
  );
}

export default function ConsultasPage() {
  const { data: consultas, loading, error } = useFetch<ConsultaAPI>('/api/consultas');
  const [search, setSearch] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('Todos');
  const [selectedConsulta, setSelectedConsulta] = useState<ConsultaAPI | null>(null);

  const debouncedSearch = useDebounce(search);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return consultas.filter((c) => {
      const matchesSearch = !term || c.paciente.toLowerCase().includes(term) || c.doctor.toLowerCase().includes(term) || c.id.toLowerCase().includes(term);
      const matchesDoctor = filterDoctor === 'Todos' || c.doctor === filterDoctor;
      return matchesSearch && matchesDoctor;
    });
  }, [consultas, debouncedSearch, filterDoctor]);

  const doctors = useMemo(() => {
    const unique = [...new Set(consultas.map((c) => c.doctor).filter(Boolean))];
    return ['Todos', ...unique];
  }, [consultas]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const hoy = consultas.filter((c) => c.fecha === today).length;
    const total = consultas.length;
    return [
      { label: 'Total Consultas', value: String(total), icon: Calendar, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
      { label: 'Consultas Hoy', value: String(hoy), icon: Clock, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
      { label: 'Este Mes', value: String(total), icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
      { label: 'Doctores', value: String(new Set(consultas.map((c) => c.doctor).filter(Boolean)).size), icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
    ];
  }, [consultas]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="CONSULTAS MÉDICAS"
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
          className="flex-1 sm:min-w-[280px]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            value={filterDoctor}
            onChange={setFilterDoctor}
            options={doctors}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="No se encontraron consultas" description="Intente ajustar los filtros de búsqueda." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {[
                    { label: 'ID', hide: '' },
                    { label: 'Paciente', hide: '' },
                    { label: 'Doctor', hide: 'hidden md:table-cell' },
                    { label: 'Fecha / Hora', hide: 'hidden md:table-cell' },
                    { label: 'Tipo', hide: 'hidden lg:table-cell' },
                    { label: 'Diagnóstico', hide: 'hidden lg:table-cell' },
                    { label: 'Acciones', hide: 'hidden sm:table-cell' },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 text-left ${h.hide}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="group transition-colors hover:bg-gray-50/60">
                    <td className="px-5 py-4 text-xs font-bold text-primary-600">{c.id.slice(0, 8)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar initials={c.iniciales} className="bg-primary-500" size="sm" />
                        <span className="text-sm font-bold text-gray-900 truncate">{c.paciente}</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600">{c.doctor}</td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600">{c.fecha} {c.hora_inicio}</td>
                    <td className="hidden lg:table-cell px-5 py-4">
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{c.tipo_consulta}</span>
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4 text-sm text-gray-600 max-w-[200px] truncate">{c.diagnostico || '—'}</td>
                    <td className="hidden sm:table-cell px-5 py-4">
                      <button onClick={() => setSelectedConsulta(c)} className="text-gray-400 hover:text-primary-600 transition-colors"><Eye className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-3">
            <span className="text-sm text-gray-400">Mostrando {filtered.length} de {consultas.length} consultas</span>
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedConsulta} onClose={() => setSelectedConsulta(null)} maxWidth="max-w-2xl">
        {selectedConsulta && (
          <>
            <div className="flex items-center gap-3 border-b border-gray-100 px-8 py-5 -mx-6 -mt-6 mb-0">
              <Avatar initials={selectedConsulta.iniciales} className="bg-primary-500" size="lg" />
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">{selectedConsulta.paciente}</h2>
                <p className="text-xs text-gray-400">{selectedConsulta.id.slice(0, 8)} • {selectedConsulta.fecha}</p>
              </div>
            </div>

            <div className="p-8 space-y-6 -mx-6">
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
                  <ClipboardList className="h-4 w-4 text-primary-600" /> Datos de Consulta
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Doctor" value={selectedConsulta.doctor} />
                  <Field label="Tipo" value={selectedConsulta.tipo_consulta} />
                  <Field label="Fecha y Hora" value={`${selectedConsulta.fecha} ${selectedConsulta.hora_inicio}`} />
                  <Field label="Hora Fin" value={selectedConsulta.hora_fin || '—'} />
                  <Field label="Tipo de Visita" value={selectedConsulta.tipo_visita} />
                  <Field label="Diagnóstico" value={selectedConsulta.diagnostico} />
                </div>
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
                  <Activity className="h-4 w-4 text-sky-600" /> Detalles Clínicos
                </h4>
                <div className="space-y-3 text-sm">
                  <Field label="Estudios" value={selectedConsulta.estudios} full />
                  <Field label="Procedimientos" value={selectedConsulta.procedimiento} full />
                  <Field label="Notas" value={selectedConsulta.notas} full />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-8 py-5 -mx-6 -mb-6 mt-0">
              <button onClick={() => setSelectedConsulta(null)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CERRAR</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
