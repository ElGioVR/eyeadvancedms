'use client';

import { useState } from 'react';
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
import { consultasData } from '@/data/consultas';
import { useDebounce, useFilteredData } from '@/hooks';
import StatCard from '@/components/ui/StatCard';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';

const stats = [
  { label: 'Consultas Hoy', value: '6', icon: Calendar, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Esta Semana', value: '28', icon: Clock, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
  { label: 'Pendientes', value: '3', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { label: 'Completadas', value: '25', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

type Consulta = (typeof consultasData)[number];

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white px-4 py-3${full ? ' col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <p className={`mt-1 text-sm font-medium text-gray-900${full ? ' break-words' : ''}`}>{value}</p>
    </div>
  );
}

export default function ConsultasPage() {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [filterTipo, setFilterTipo] = useState('Todos');
  const [filterDoctor, setFilterDoctor] = useState('Todos');
  const [selectedConsulta, setSelectedConsulta] = useState<Consulta | null>(null);

  const debouncedSearch = useDebounce(search);
  const filtered = useFilteredData(consultasData, {
    searchFields: ['paciente', 'id', 'doctor'],
    searchTerm: debouncedSearch,
    filters: {
      estado: filterEstado,
      tipo: filterTipo,
      doctor: filterDoctor,
    },
  });

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por paciente, doctor o ID..."
          className="flex-1 min-w-[280px]"
        />
        <FilterSelect
          value={filterEstado}
          onChange={setFilterEstado}
          options={['Todos', 'COMPLETADA', 'EN CURSO', 'PENDIENTE']}
        />
        <FilterSelect
          value={filterTipo}
          onChange={setFilterTipo}
          options={['Todos', 'Primera Vez', 'Seguimiento', 'Graduación', 'Control']}
        />
        <FilterSelect
          value={filterDoctor}
          onChange={setFilterDoctor}
          options={['Todos', 'Dra. Irina', 'Dr. Sánchez', 'Dra. Martha', 'Dr. Bayardo']}
        />
      </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Calendar} title="No se encontraron consultas" description="Intente ajustar los filtros de búsqueda." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['ID', 'Paciente', 'Doctor', 'Fecha / Hora', 'Tipo', 'Diagnóstico', 'Estado', 'Cobro', 'Acciones'].map(
                      (h) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 ${h === 'Cobro' ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((c) => (
                    <tr key={c.id} className="group transition-colors hover:bg-gray-50/60">
                      <td className="px-5 py-4 text-xs font-bold text-primary-600">{c.id}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar initials={c.iniciales} className={c.color} size="sm" />
                          <span className="text-sm font-bold text-gray-900">{c.paciente}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{c.doctor}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{c.fecha}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{c.tipo}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 max-w-[200px] truncate">{c.diagnostico}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={c.estado} config={estadoConfig} />
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-bold text-gray-900">{c.cobro}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedConsulta(c)} className="text-gray-400 hover:text-primary-600 transition-colors"><Eye className="h-4 w-4" /></button>
                          <button className="text-gray-400 hover:text-primary-600 transition-colors"><FileText className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-3">
                <span className="text-sm text-gray-400">Mostrando {filtered.length} de {consultasData.length} consultas</span>
              </div>
            </div>
          )}

      <Modal isOpen={!!selectedConsulta} onClose={() => setSelectedConsulta(null)} maxWidth="max-w-2xl">
        {selectedConsulta && (
          <>
            <div className="flex items-center gap-3 border-b border-gray-100 px-8 py-5 -mx-6 -mt-6 mb-0">
              <Avatar initials={selectedConsulta.iniciales} className={selectedConsulta.color} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-gray-900">{selectedConsulta.paciente}</h2>
                  <StatusBadge status={selectedConsulta.estado} config={estadoConfig} />
                </div>
                <p className="text-xs text-gray-400">{selectedConsulta.id} • {selectedConsulta.fecha}</p>
              </div>
            </div>

            <div className="p-8 space-y-6 -mx-6">
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
                  <ClipboardList className="h-4 w-4 text-primary-600" /> Datos de Consulta
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Doctor" value={selectedConsulta.doctor} />
                  <Field label="Tipo" value={selectedConsulta.tipo} />
                  <Field label="Fecha y Hora" value={selectedConsulta.fecha} />
                  <Field label="Hora Fin" value={selectedConsulta.horaFin} />
                  <Field label="Tipo de Visita" value={selectedConsulta.tipoVisita} />
                  <Field label="Diagnóstico" value={selectedConsulta.diagnostico} />
                </div>
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
                  <Activity className="h-4 w-4 text-sky-600" /> Detalles Clínicos
                </h4>
                <div className="space-y-3 text-sm">
                  <Field label="Estudios" value={selectedConsulta.estudios} full />
                  <Field label="Procedimientos" value={selectedConsulta.procedimientos} full />
                  <Field label="Notas" value={selectedConsulta.notas} full />
                </div>
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
                  <Banknote className="h-4 w-4 text-amber-600" /> Datos de Cobro
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Aseguradora" value={selectedConsulta.aseguradora} />
                  <Field label="Método de Pago" value={selectedConsulta.metodoPago} />
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo</span>
                    <p className="mt-1 text-lg font-extrabold text-primary-700">{selectedConsulta.cobro}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-8 py-5 -mx-6 -mb-6 mt-0">
              <button onClick={() => setSelectedConsulta(null)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CERRAR</button>
              <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <FileText className="h-4 w-4" /> GENERAR RECIBO
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
