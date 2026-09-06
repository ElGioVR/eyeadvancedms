'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Calendar,
  ChevronDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  FileText,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const stats = [
  { label: 'Consultas Hoy', value: '6', icon: Calendar, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Esta Semana', value: '28', icon: Clock, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
  { label: 'Pendientes', value: '3', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { label: 'Completadas', value: '25', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
];

const consultasData = [
  { id: 'CON-2024-001', paciente: 'Mateo Rodríguez', iniciales: 'MR', color: 'bg-primary-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 09:00 AM', tipo: 'Seguimiento', diagnostico: 'Miopía progresiva controlada', estado: 'COMPLETADA', cobro: '$1,080' },
  { id: 'CON-2024-002', paciente: 'Sofía González', iniciales: 'SG', color: 'bg-purple-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 10:15 AM', tipo: 'Primera Vez', diagnostico: 'Estrabismo divergente', estado: 'EN CURSO', cobro: '$1,800' },
  { id: 'CON-2024-003', paciente: 'Carlos Mendoza', iniciales: 'CM', color: 'bg-emerald-500', doctor: 'Dr. Sánchez', fecha: '04 Sep 2026, 11:30 AM', tipo: 'Graduación', diagnostico: 'Astigmatismo miópico', estado: 'PENDIENTE', cobro: '$720' },
  { id: 'CON-2024-004', paciente: 'Lucía Ortiz', iniciales: 'LO', color: 'bg-rose-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 12:00 PM', tipo: 'Seguimiento', diagnostico: 'Glaucoma de ángulo abierto', estado: 'PENDIENTE', cobro: '$1,350' },
  { id: 'CON-2024-005', paciente: 'Roberto Vega', iniciales: 'RV', color: 'bg-sky-500', doctor: 'Dra. Martha', fecha: '03 Sep 2026, 02:30 PM', tipo: 'Primera Vez', diagnostico: 'Catarata senil bilateral', estado: 'COMPLETADA', cobro: '$0' },
  { id: 'CON-2024-006', paciente: 'Ana Luisa Pérez', iniciales: 'AP', color: 'bg-amber-500', doctor: 'Dr. Bayardo', fecha: '03 Sep 2026, 10:00 AM', tipo: 'Seguimiento', diagnostico: 'Glaucoma primario', estado: 'COMPLETADA', cobro: '$1,440' },
  { id: 'CON-2024-007', paciente: 'Diego Herrera', iniciales: 'DH', color: 'bg-cyan-500', doctor: 'Dra. Martha', fecha: '02 Sep 2026, 11:00 AM', tipo: 'Control', diagnostico: 'Catarata post-operatorio', estado: 'COMPLETADA', cobro: '$900' },
  { id: 'CON-2024-008', paciente: 'Valentina Cruz', iniciales: 'VC', color: 'bg-violet-500', doctor: 'Dra. Irina', fecha: '01 Sep 2026, 09:30 AM', tipo: 'Primera Vez', diagnostico: 'Estrabismo convergente', estado: 'COMPLETADA', cobro: '$0' },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

export default function ConsultasPage() {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [filterTipo, setFilterTipo] = useState('Todos');

  const filtered = consultasData.filter((c) => {
    const matchSearch = c.paciente.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.doctor.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === 'Todos' || c.estado === filterEstado;
    const matchTipo = filterTipo === 'Todos' || c.tipo === filterTipo;
    return matchSearch && matchEstado && matchTipo;
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">CONSULTAS MÉDICAS</h1>
          <p className="mt-0.5 text-sm text-gray-400">Registro y seguimiento de consultas oftalmológicas.</p>
        </div>
        <Link
          href="/consultas/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Consulta
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
              </div>
              <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor, 'ring-1', stat.borderColor)}>
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente, doctor o ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div className="relative">
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option>Todos</option>
            <option>COMPLETADA</option>
            <option>EN CURSO</option>
            <option>PENDIENTE</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option>Todos</option>
            <option>Primera Vez</option>
            <option>Seguimiento</option>
            <option>Graduación</option>
            <option>Control</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
        <input type="date" className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">ID</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Paciente</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Doctor</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Fecha / Hora</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Tipo</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Diagnóstico</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Cobro</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((c) => {
              const estado = estadoConfig[c.estado];
              return (
                <tr key={c.id} className="group transition-colors hover:bg-gray-50/60">
                  <td className="px-5 py-4 text-xs font-bold text-primary-600">{c.id}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', c.color)}>
                        {c.iniciales}
                      </div>
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
                    <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold', estado.bg, estado.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', estado.dot)} />
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-bold text-gray-900">{c.cobro}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button className="text-gray-400 hover:text-primary-600 transition-colors"><Eye className="h-4 w-4" /></button>
                      <button className="text-gray-400 hover:text-primary-600 transition-colors"><FileText className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-6 py-12 text-center">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No se encontraron consultas</p>
              </td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-3">
          <span className="text-sm text-gray-400">Mostrando {filtered.length} de {consultasData.length} consultas</span>
        </div>
      </div>
    </div>
  );
}
