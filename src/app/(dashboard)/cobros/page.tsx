'use client';

import { useState, useMemo } from 'react';
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
import { useFetch, useDebounce } from '@/hooks';
import StatCard from '@/components/ui/StatCard';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';

interface CobroAPI {
  id: string;
  paciente: string;
  doctor: string;
  fecha: string;
  monto: number;
  metodo_pago: string;
  moneda: string;
  pagado: boolean;
  folio: string;
  notas: string;
  aseguradora: string;
}

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PENDIENTE: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  CANCELADO: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

const metodoIcons: Record<string, typeof CreditCard> = {
  TARJETA: CreditCard,
  EFECTIVO: Banknote,
  TRANSFERENCIA: TrendingUp,
  NO_APLICA: FileText,
};

export default function CobrosPage() {
  const { data: cobros, loading, error } = useFetch<CobroAPI>('/api/cobros');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [showNewCobro, setShowNewCobro] = useState(false);

  const debouncedSearch = useDebounce(search);

  const mappedCobros = useMemo(() => {
    return cobros.map((c) => ({
      ...c,
      estado: c.pagado ? 'PAGADO' : 'PENDIENTE',
    }));
  }, [cobros]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return mappedCobros.filter((c) => {
      const matchesSearch = !term || c.paciente.toLowerCase().includes(term) || c.folio?.toLowerCase().includes(term) || c.id.toLowerCase().includes(term);
      const matchesEstado = filterEstado === 'Todos' || c.estado === filterEstado;
      return matchesSearch && matchesEstado;
    });
  }, [mappedCobros, debouncedSearch, filterEstado]);

  const stats = useMemo(() => {
    const total = cobros.reduce((sum, c) => sum + (c.monto || 0), 0);
    const pagados = cobros.filter((c) => c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);
    const pendientes = cobros.filter((c) => !c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);
    return [
      { label: 'Total Cobros', value: `$${total.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
      { label: 'Pagados', value: `$${pagados.toLocaleString()}`, icon: CheckCircle, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
      { label: 'Pendientes', value: `$${pendientes.toLocaleString()}`, icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
      { label: 'Total Registros', value: String(cobros.length), icon: TrendingUp, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
    ];
  }, [cobros]);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por paciente, folio o ID..."
          className="flex-1 sm:min-w-[280px]"
        />
        <FilterSelect
          value={filterEstado}
          onChange={setFilterEstado}
          options={['Todos', 'PAGADO', 'PENDIENTE']}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded bg-gray-200" />
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
        <EmptyState icon={DollarSign} title="No se encontraron cobros" description="Intente ajustar los filtros de búsqueda." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {[
                    { label: 'Folio', hide: '' },
                    { label: 'Paciente', hide: '' },
                    { label: 'Doctor', hide: 'hidden md:table-cell' },
                    { label: 'Método', hide: 'hidden md:table-cell' },
                    { label: 'Total', hide: '' },
                    { label: 'Estado', hide: '' },
                    { label: 'Acciones', hide: 'hidden sm:table-cell' },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 ${h.label === 'Total' ? 'text-right' : 'text-left'} ${h.hide}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((cobro) => {
                  const MetodoIcon = metodoIcons[cobro.metodo_pago] || CreditCard;
                  return (
                    <tr key={cobro.id} className="group transition-colors hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <span className="text-xs font-bold text-primary-600">{cobro.folio || cobro.id.slice(0, 8)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-gray-900">{cobro.paciente}</div>
                        <div className="text-xs text-gray-400">{cobro.fecha ? new Date(cobro.fecha).toLocaleDateString('es-MX') : '—'}</div>
                      </td>
                      <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600">{cobro.doctor || '—'}</td>
                      <td className="hidden md:table-cell px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <MetodoIcon className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm text-gray-600">{cobro.metodo_pago}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm font-extrabold text-gray-900">${cobro.monto?.toLocaleString() || '0'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={cobro.estado} config={estadoConfig} />
                      </td>
                      <td className="hidden sm:table-cell px-5 py-4">
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
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-3">
            <span className="text-sm text-gray-400">Mostrando {filtered.length} de {cobros.length} cobros</span>
          </div>
        </div>
      )}

      {showNewCobro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl mx-4">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Nuevo Cobro</h3>
              <button onClick={() => setShowNewCobro(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Paciente <span className="text-red-500">*</span></label>
                <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                  <option>Seleccionar paciente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Monto <span className="text-red-500">*</span></label>
                <input type="text" placeholder="$ 0.00" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setShowNewCobro(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">REGISTRAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
