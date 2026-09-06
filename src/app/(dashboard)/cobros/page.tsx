'use client';

import { useState } from 'react';
import {
  Search,
  Plus,
  DollarSign,
  CreditCard,
  Banknote,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  FileText,
  Eye,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const stats = [
  { label: 'Cobros Hoy', value: '$24,500', icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100', trend: '+12%' },
  { label: 'Pendientes', value: '$8,200', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  { label: 'Este Mes', value: '$141,300', icon: TrendingUp, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100', trend: '+21%' },
  { label: 'Met. Más Usada', value: 'Crédito', icon: CreditCard, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
];

const cobrosData = [
  { id: 'COB-2024-001', paciente: 'Mateo Rodríguez', doctor: 'Dra. Irina', fecha: '04 Sep 2026', concepto: 'Consulta de seguimiento', aseguradora: 'Seguros Monterrey', metodo: 'Tarjeta de Crédito', monto: '$1,200', coaseguro: '$120', total: '$1,080', estado: 'PAGADO', folio: 'FAC-28451' },
  { id: 'COB-2024-002', paciente: 'Sofía González', doctor: 'Dra. Irina', fecha: '04 Sep 2026', concepto: 'Consulta primera vez + estudios', aseguradora: 'Particular', metodo: 'Efectivo', monto: '$1,800', coaseguro: '—', total: '$1,800', estado: 'PAGADO', folio: 'FAC-28452' },
  { id: 'COB-2024-003', paciente: 'Carlos Mendoza', doctor: 'Dr. Sánchez', fecha: '04 Sep 2026', concepto: 'Graduación y cambio de micas', aseguradora: 'AXA', metodo: 'Tarjeta de Débito', monto: '$800', coaseguro: '$80', total: '$720', estado: 'PENDIENTE', folio: 'FAC-28453' },
  { id: 'COB-2024-004', paciente: 'Lucía Ortiz', doctor: 'Dra. Irina', fecha: '03 Sep 2026', concepto: 'Control de glaucoma + tonometría', aseguradora: 'MetLife', metodo: 'Transferencia', monto: '$1,500', coaseguro: '$150', total: '$1,350', estado: 'PAGADO', folio: 'FAC-28450' },
  { id: 'COB-2024-005', paciente: 'Roberto Vega', doctor: 'Dra. Martha', fecha: '03 Sep 2026', concepto: 'Consulta catarata + biometría', aseguradora: 'ISSSTECALI', metodo: 'Seguro', monto: '$2,200', coaseguro: '—', total: '$0', estado: 'PAGADO', folio: 'FAC-28449' },
  { id: 'COB-2024-006', paciente: 'Ana Luisa Pérez', doctor: 'Dr. Bayardo', fecha: '03 Sep 2026', concepto: 'Consulta glaucoma + campimetría', aseguradora: 'GNP', metodo: 'Tarjeta de Crédito', monto: '$1,600', coaseguro: '$160', total: '$1,440', estado: 'PENDIENTE', folio: 'FAC-28448' },
  { id: 'COB-2024-007', paciente: 'Diego Herrera', doctor: 'Dra. Martha', fecha: '02 Sep 2026', concepto: 'Seguimiento catarata', aseguradora: 'JORNADA', metodo: 'Efectivo', monto: '$900', coaseguro: '—', total: '$900', estado: 'CANCELADO', folio: 'FAC-28447' },
  { id: 'COB-2024-008', paciente: 'Valentina Cruz', doctor: 'Dra. Irina', fecha: '01 Sep 2026', concepto: 'Consulta pediátrica estrabismo', aseguradora: 'ISSSTECALI', metodo: 'Seguro', monto: '$1,400', coaseguro: '—', total: '$0', estado: 'PAGADO', folio: 'FAC-28446' },
];

const estadoConfig: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle },
  PENDIENTE: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  CANCELADO: { bg: 'bg-red-50', text: 'text-red-600', icon: XCircle },
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

  const filtered = cobrosData.filter((c) => {
    const matchSearch = c.paciente.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.folio.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === 'Todos' || c.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">COBROS Y FACTURACIÓN</h1>
          <p className="mt-0.5 text-sm text-gray-400">Control de pagos, recibos y movimientos financieros.</p>
        </div>
        <button
          onClick={() => setShowNewCobro(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Cobro
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[28px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  {stat.trend && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600 ring-1 ring-emerald-200">
                      <TrendingUp className="h-3 w-3" />{stat.trend}
                    </span>
                  )}
                </div>
              </div>
              <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor, 'ring-1', stat.borderColor)}>
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search & Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por paciente, folio o ID..."
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
                <option>PAGADO</option>
                <option>PENDIENTE</option>
                <option>CANCELADO</option>
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
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Folio</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Paciente</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Doctor</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Concepto</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Método</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Total</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((cobro) => {
                  const estado = estadoConfig[cobro.estado];
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
                        <span className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-extrabold', estado.bg, estado.text)}>
                          <estado.icon className="h-3 w-3" />
                          {cobro.estado}
                        </span>
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
        </div>

        {/* New Cobro sidebar */}
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
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar paciente</option>
                      <option>Mateo Rodríguez</option>
                      <option>Sofía González</option>
                      <option>Carlos Mendoza</option>
                      <option>Lucía Ortiz</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Concepto <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Ej. Consulta de seguimiento" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Aseguradora</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Particular</option>
                      <option>ISSSTECALI</option>
                      <option>JORNADA</option>
                      <option>GNP</option>
                      <option>Seguros Monterrey</option>
                      <option>AXA</option>
                      <option>MetLife</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Método de Pago <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar método</option>
                      <option>Efectivo</option>
                      <option>Tarjeta de Crédito</option>
                      <option>Tarjeta de Débito</option>
                      <option>Transferencia</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
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
