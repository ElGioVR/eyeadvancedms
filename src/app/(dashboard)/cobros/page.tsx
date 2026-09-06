'use client';

import { useState } from 'react';
import {
  Plus,
  DollarSign,
  CreditCard,
  Banknote,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  X,
} from 'lucide-react';
import { cobrosData } from '@/data';
import { useDebounce, useFilteredData } from '@/hooks';
import StatCard from '@/components/ui/StatCard';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';

const stats = [
  { label: 'Cobros Hoy', value: '$24,500', icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100', trend: '+12%' },
  { label: 'Pendientes', value: '$8,200', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { label: 'Este Mes', value: '$141,300', icon: TrendingUp, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100', trend: '+21%' },
  { label: 'Met. Más Usada', value: 'Crédito', icon: CreditCard, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PENDIENTE: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  CANCELADO: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

const metodoIcons: Record<string, typeof CreditCard> = {
  'Tarjeta de Crédito': CreditCard,
  'Tarjeta de Débito': CreditCard,
  'Efectivo': Banknote,
  'Transferencia': TrendingUp,
  'Seguro': FileText,
};

export default function CobrosPage() {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [showNewCobro, setShowNewCobro] = useState(false);

  const debouncedSearch = useDebounce(search);
  const filtered = useFilteredData(cobrosData, {
    searchFields: ['paciente', 'id', 'folio'],
    searchTerm: debouncedSearch,
    filters: { estado: filterEstado },
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="COBROS Y FACTURACIÓN"
        subtitle="Control de pagos, recibos y movimientos financieros."
        action={
          <button
            onClick={() => setShowNewCobro(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo Cobro
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar por paciente, folio o ID..."
              className="flex-1 min-w-[280px]"
            />
            <FilterSelect
              value={filterEstado}
              onChange={setFilterEstado}
              options={['Todos', 'PAGADO', 'PENDIENTE', 'CANCELADO']}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={DollarSign} title="No se encontraron cobros" description="Intente ajustar los filtros de búsqueda." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Folio', 'Paciente', 'Doctor', 'Concepto', 'Método', 'Total', 'Estado', 'Acciones'].map(
                      (h) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 ${h === 'Total' ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((cobro) => {
                    const MetodoIcon = metodoIcons[cobro.metodo] || CreditCard;
                    return (
                      <tr key={cobro.id} className="group transition-colors hover:bg-gray-50/60">
                        <td className="px-5 py-4">
                          <span className="text-xs font-bold text-primary-600">{cobro.id}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm font-bold text-gray-900">{cobro.paciente}</div>
                          <div className="text-xs text-gray-400">{cobro.fecha}</div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">{cobro.doctor}</td>
                        <td className="px-5 py-4 text-sm text-gray-600 max-w-[200px] truncate">{cobro.concepto}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <MetodoIcon className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-sm text-gray-600">{cobro.metodo}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-sm font-extrabold text-gray-900">{cobro.total}</span>
                          {cobro.coaseguro !== '—' && (
                            <div className="text-[10px] text-gray-400">coaseguro: {cobro.coaseguro}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={cobro.estado} config={estadoConfig} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <button className="text-gray-400 hover:text-primary-600 transition-colors"><Eye className="h-4 w-4" /></button>
                            <button className="text-gray-400 hover:text-primary-600 transition-colors"><FileText className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-3">
                <span className="text-sm text-gray-400">Mostrando {filtered.length} de {cobrosData.length} cobros</span>
              </div>
            </div>
          )}
        </div>

        {showNewCobro && (
          <div className="w-[400px] shrink-0">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Nuevo Cobro</h3>
                <button onClick={() => setShowNewCobro(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Paciente <span className="text-red-500">*</span></label>
                  <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                    <option>Seleccionar paciente</option>
                    <option>Mateo Rodríguez</option>
                    <option>Sofía González</option>
                    <option>Carlos Mendoza</option>
                    <option>Lucía Ortiz</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Concepto <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Ej. Consulta de seguimiento" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Aseguradora</label>
                  <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                    <option>Particular</option>
                    <option>ISSSTECALI</option>
                    <option>JORNADA</option>
                    <option>GNP</option>
                    <option>Seguros Monterrey</option>
                    <option>AXA</option>
                    <option>MetLife</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Método de Pago <span className="text-red-500">*</span></label>
                  <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                    <option>Seleccionar método</option>
                    <option>Efectivo</option>
                    <option>Tarjeta de Crédito</option>
                    <option>Tarjeta de Débito</option>
                    <option>Transferencia</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Monto <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="$ 0.00" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Coaseguro</label>
                    <input type="text" placeholder="$ 0.00" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Notas</label>
                  <textarea rows={3} placeholder="Observaciones del cobro..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none" />
                </div>
                <div className="flex gap-3 pt-2 border-t border-gray-100">
                  <button onClick={() => setShowNewCobro(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                  <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">REGISTRAR COBRO</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
