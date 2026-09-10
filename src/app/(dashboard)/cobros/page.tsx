'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
  Trash2,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { useFetch, useDebounce } from '@/hooks';
import StatCard from '@/components/ui/StatCard';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';

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
  consulta_id: string | null;
  paciente_id: string;
  diagnostico?: string;
}

interface ConsultaAPI {
  id: string;
  folio: string | null;
  paciente: string;
  doctor: string;
  fecha: string;
  diagnostico: string;
}

interface Paciente {
  id: string;
  nombre_completo: string;
}

interface Doctor {
  id: string;
  nombre_completo: string;
}

interface LenteDisponible {
  id: string;
  marca: string;
  modelo: string;
  grado_esferico: number | null;
  grado_cilindrico: number | null;
  eje: number | null;
  color: string | null;
  material: string | null;
  stock: number;
  precio_venta: number | null;
  categoria: string;
}

interface LenteAsignado {
  lente_id: string;
  ojo: 'DERECHO' | 'IZQUIERDO' | 'AMBOS';
  grado_aplicado: string;
  cantidad: number;
}

interface CobroForm {
  paciente_id: string;
  consulta_id: string;
  crearConsulta: boolean;
  doctor_id: string;
  fecha_consulta: string;
  hora_inicio: string;
  lentes: LenteAsignado[];
  metodo_pago: string;
  moneda: string;
  pagado: boolean;
  notas: string;
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

const getInitialForm = (): CobroForm => ({
  paciente_id: '',
  consulta_id: '',
  crearConsulta: false,
  doctor_id: '',
  fecha_consulta: '',
  hora_inicio: '',
  lentes: [],
  metodo_pago: 'EFECTIVO',
  moneda: 'PESOS',
  pagado: false,
  notas: '',
});

export default function CobrosPage() {
  const [page, setPage] = useState(1);
  const { data: cobros, loading, error, refetch, total, page: currentPage } = useFetch<CobroAPI>('/api/cobros', { page: String(page), pageSize: '15' });
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [showNewCobro, setShowNewCobro] = useState(false);

  const debouncedSearch = useDebounce(search);

  const [form, setForm] = useState<CobroForm>(getInitialForm);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [lentes, setLentes] = useState<LenteDisponible[]>([]);
  const [consultas, setConsultas] = useState<ConsultaAPI[]>([]);
  const [searchLente, setSearchLente] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [cobroDetalle, setCobroDetalle] = useState<CobroAPI | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);

  useEffect(() => {
    setForm((prev) => prev.fecha_consulta ? prev : {
      ...prev,
      fecha_consulta: new Date().toISOString().split('T')[0],
      hora_inicio: new Date().toTimeString().slice(0, 5),
    });
  }, []);

  useEffect(() => {
    if (!showNewCobro) return;
    Promise.all([
      fetch('/api/pacientes?pageSize=100').then((r) => r.json()),
      fetch('/api/configuracion/doctores').then((r) => r.json()),
      fetch('/api/inventario/disponible').then((r) => r.json()),
      fetch('/api/consultas?pageSize=100').then((r) => r.json()),
    ]).then(([p, d, l, c]) => {
      setPacientes(Array.isArray(p) ? p : p.data || []);
      setDoctores(Array.isArray(d) ? d : []);
      setLentes(Array.isArray(l) ? l : []);
      setConsultas(Array.isArray(c) ? c : c.data || []);
    });
  }, [showNewCobro]);

  const filteredLentes = useMemo(() => {
    const term = searchLente.toLowerCase();
    return lentes.filter((l) =>
      !term ||
      l.marca.toLowerCase().includes(term) ||
      l.modelo.toLowerCase().includes(term) ||
      l.categoria.toLowerCase().includes(term) ||
      l.color?.toLowerCase().includes(term)
    );
  }, [lentes, searchLente]);

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
    const totalMonto = cobros.reduce((sum, c) => sum + (c.monto || 0), 0);
    const pagados = cobros.filter((c) => c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);
    const pendientes = cobros.filter((c) => !c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);
    return [
      { label: 'Total Cobros', value: `$${totalMonto.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
      { label: 'Pagados', value: `$${pagados.toLocaleString()}`, icon: CheckCircle, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
      { label: 'Pendientes', value: `$${pendientes.toLocaleString()}`, icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
      { label: 'Total Registros', value: String(total), icon: TrendingUp, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
    ];
  }, [cobros, total]);

  const autoMonto = useMemo(() => {
    return form.lentes.reduce((sum, l) => {
      const lente = lentes.find((lv) => lv.id === l.lente_id);
      if (!lente?.precio_venta) return sum;
      return sum + lente.precio_venta * l.cantidad;
    }, 0);
  }, [form.lentes, lentes]);

  const addLente = useCallback((lente: LenteDisponible) => {
    setForm((prev) => {
      const exists = prev.lentes.find((l) => l.lente_id === lente.id);
      if (exists) return prev;
      return {
        ...prev,
        lentes: [
          ...prev.lentes,
          { lente_id: lente.id, ojo: 'DERECHO', grado_aplicado: '', cantidad: 1 },
        ],
      };
    });
  }, []);

  const removeLente = useCallback((lente_id: string) => {
    setForm((prev) => ({
      ...prev,
      lentes: prev.lentes.filter((l) => l.lente_id !== lente_id),
    }));
  }, []);

  const updateLente = useCallback((lente_id: string, field: keyof LenteAsignado, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      lentes: prev.lentes.map((l) =>
        l.lente_id === lente_id ? { ...l, [field]: value } : l
      ),
    }));
  }, []);

  const handleSubmit = async () => {
    setSubmitError('');

    if (!form.paciente_id) {
      setSubmitError('Seleccione un paciente');
      return;
    }
    if (form.lentes.length === 0) {
      setSubmitError('Agregue al menos un lente');
      return;
    }

    if (autoMonto <= 0) {
      setSubmitError('Los lentes seleccionados no tienen precio de venta definido');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        paciente_id: form.paciente_id,
        lentes: form.lentes.map((l) => ({
          lente_id: l.lente_id,
          ojo: l.ojo,
          grado_aplicado: l.grado_aplicado ? parseFloat(l.grado_aplicado) : null,
          cantidad: l.cantidad,
        })),
        monto: autoMonto,
        metodo_pago: form.metodo_pago,
        moneda: form.moneda,
        pagado: form.pagado,
        notas: form.notas || null,
      };

      if (form.consulta_id) {
        payload.consulta_id = form.consulta_id;
      } else if (form.crearConsulta && form.doctor_id) {
        payload.doctor_id = form.doctor_id;
        payload.fecha_consulta = form.fecha_consulta;
        payload.hora_inicio = form.hora_inicio;
      }

      const res = await fetch('/api/cobros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || 'Error al crear cobro');
        return;
      }

      setShowNewCobro(false);
      setForm(getInitialForm());
      refetch();
    } catch {
      setSubmitError('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="COBROS Y FACTURACIÓN"
        subtitle="Control de pagos, recibos y movimientos financieros."
        action={
          <button
            onClick={() => { setForm(getInitialForm()); setShowNewCobro(true); }}
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
                          <button
                            onClick={() => setCobroDetalle(cobro)}
                            className="text-gray-400 hover:text-primary-600 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {!cobro.pagado && (
                            <button
                              onClick={async () => {
                                setPagando(cobro.id);
                                try {
                                  const res = await fetch(`/api/cobros/${cobro.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pagado: true }),
                                  });
                                  if (res.ok) {
                                    setForm(getInitialForm());
                                    refetch();
                                  }
                                } finally {
                                  setPagando(null);
                                }
                              }}
                              disabled={pagando === cobro.id}
                              className="text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
                              title="Marcar como pagado"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            total={total}
            pageSize={15}
            totalItems={filtered.length}
            onPageChange={(p) => setPage(p)}
            label="cobros"
          />
        </div>
      )}

      <Modal isOpen={showNewCobro} onClose={() => setShowNewCobro(false)} maxWidth="max-w-3xl">
        <div className="mb-6">
          <h3 className="text-lg font-extrabold uppercase tracking-wider text-gray-900">Nuevo Cobro</h3>
          <p className="mt-1 text-sm text-gray-500">Complete los datos para registrar un cobro. Los lentes se descontarán del inventario.</p>
        </div>

        {submitError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {submitError}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Paciente <span className="text-red-500">*</span>
            </label>
            <select
              value={form.paciente_id}
              onChange={(e) => setForm((f) => ({ ...f, paciente_id: e.target.value }))}
              className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="">Seleccionar paciente</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre_completo}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="crearConsulta"
                checked={form.crearConsulta}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    crearConsulta: e.target.checked,
                    consulta_id: '',
                    doctor_id: '',
                    fecha_consulta: new Date().toISOString().split('T')[0],
                    hora_inicio: new Date().toTimeString().slice(0, 5),
                  }));
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="crearConsulta" className="text-sm font-bold text-gray-700">
                Crear consulta asociada
              </label>
              <span className="text-xs text-gray-400">(opcional)</span>
            </div>
            {form.crearConsulta && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    id="nuevaConsulta"
                    name="tipoConsulta"
                    checked={!form.consulta_id}
                    onChange={() => setForm((f) => ({ ...f, consulta_id: '' }))}
                    className="h-3.5 w-3.5 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="nuevaConsulta" className="text-xs font-medium text-gray-600">Crear nueva consulta</label>
                  <input
                    type="radio"
                    id="existenteConsulta"
                    name="tipoConsulta"
                    checked={!!form.consulta_id}
                    onChange={() => setForm((f) => ({ ...f, doctor_id: '' }))}
                    className="h-3.5 w-3.5 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="existenteConsulta" className="text-xs font-medium text-gray-600">Vincular consulta existente</label>
                </div>
                {!form.consulta_id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Doctor</label>
                      <select
                        value={form.doctor_id}
                        onChange={(e) => setForm((f) => ({ ...f, doctor_id: e.target.value }))}
                        className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      >
                        <option value="">Seleccionar doctor...</option>
                        {doctores.map((d) => (
                          <option key={d.id} value={d.id}>{d.nombre_completo}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fecha</label>
                      <input
                        type="date"
                        value={form.fecha_consulta}
                        onChange={(e) => setForm((f) => ({ ...f, fecha_consulta: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Hora</label>
                      <input
                        type="time"
                        value={form.hora_inicio}
                        onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                  </div>
                ) : (
                  <select
                    value={form.consulta_id}
                    onChange={(e) => setForm((f) => ({ ...f, consulta_id: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="">Seleccionar consulta...</option>
                    {consultas
                      .filter((c) => !c.paciente || c.paciente === pacientes.find((p) => p.id === form.paciente_id)?.nombre_completo)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.folio || c.id.slice(0, 8)} — {c.doctor} — {new Date(c.fecha).toLocaleDateString('es-MX')}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Lentes del inventario <span className="text-red-500">*</span>
            </label>
            {form.lentes.length > 0 && (
              <div className="mb-3 space-y-2">
                {form.lentes.map((la) => {
                  const lente = lentes.find((l) => l.id === la.lente_id);
                  if (!lente) return null;
                  return (
                    <div key={la.lente_id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{lente.marca} {lente.modelo}</div>
                        <div className="text-xs text-gray-400">
                          Stock: {lente.stock} | ${lente.precio_venta || '—'}
                        </div>
                      </div>
                      <select
                        value={la.ojo}
                        onChange={(e) => updateLente(la.lente_id, 'ojo', e.target.value)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      >
                        <option value="DERECHO">Derecho</option>
                        <option value="IZQUIERDO">Izquierdo</option>
                        <option value="AMBOS">Ambos</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max={lente.stock}
                        value={la.cantidad}
                        onChange={(e) => updateLente(la.lente_id, 'cantidad', parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      <input
                        type="text"
                        placeholder="Grado"
                        value={la.grado_aplicado}
                        onChange={(e) => updateLente(la.lente_id, 'grado_aplicado', e.target.value)}
                        className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      <button
                        onClick={() => removeLente(la.lente_id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar lente por marca, modelo o categoría..."
                value={searchLente}
                onChange={(e) => setSearchLente(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {searchLente && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {filteredLentes.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No se encontraron lentes</div>
                ) : (
                  filteredLentes.map((l) => {
                    const alreadyAdded = form.lentes.some((la) => la.lente_id === l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => addLente(l)}
                        disabled={alreadyAdded}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                          alreadyAdded ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-primary-50'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-gray-900">{l.marca} {l.modelo}</div>
                          <div className="text-xs text-gray-400">
                            {l.categoria} | Stock: {l.stock} | ${l.precio_venta || '—'}
                          </div>
                        </div>
                        {alreadyAdded && <span className="text-xs text-gray-400">Agregado</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Monto Total
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-100 py-2.5 pl-8 pr-4 text-sm font-bold text-gray-900">
                  {autoMonto > 0 ? autoMonto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400">Suma automática de precios de lentes seleccionados</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Método de pago</label>
              <select
                value={form.metodo_pago}
                onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="NO_APLICA">No aplica</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="pagado"
              checked={form.pagado}
              onChange={(e) => setForm((f) => ({ ...f, pagado: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="pagado" className="text-sm font-bold text-gray-700">Marcar como pagado</label>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Notas adicionales..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
          <button
            onClick={() => setShowNewCobro(false)}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            CANCELAR
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'REGISTRANDO...' : 'REGISTRAR COBRO'}
          </button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!cobroDetalle} onClose={() => setCobroDetalle(null)} maxWidth="max-w-lg">
        {cobroDetalle && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
                <Eye className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">Detalle del Cobro</h2>
                <p className="text-xs text-gray-400">{cobroDetalle.folio || cobroDetalle.id.slice(0, 8)}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Paciente</span>
                  <p className="mt-1 text-sm font-medium text-gray-900">{cobroDetalle.paciente}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Doctor</span>
                  <p className="mt-1 text-sm font-medium text-gray-900">{cobroDetalle.doctor || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Monto</span>
                  <p className="mt-1 text-sm font-extrabold text-primary-700">${cobroDetalle.monto?.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estado</span>
                  <StatusBadge status={cobroDetalle.pagado ? 'PAGADO' : 'PENDIENTE'} config={estadoConfig} />
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Método de Pago</span>
                  <p className="mt-1 text-sm font-medium text-gray-900">{cobroDetalle.metodo_pago}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Moneda</span>
                  <p className="mt-1 text-sm font-medium text-gray-900">{cobroDetalle.moneda}</p>
                </div>
              </div>
              {cobroDetalle.notas && (
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Notas</span>
                  <p className="mt-1 text-sm text-gray-900">{cobroDetalle.notas}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 mt-6 pt-5">
              <button
                onClick={() => setCobroDetalle(null)}
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
              {!cobroDetalle.pagado && (
                <button
                  onClick={async () => {
                    setPagando(cobroDetalle.id);
                    try {
                      const res = await fetch(`/api/cobros/${cobroDetalle.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pagado: true }),
                      });
                      if (res.ok) {
                        setCobroDetalle(null);
                        refetch();
                      }
                    } finally {
                      setPagando(null);
                    }
                  }}
                  disabled={pagando === cobroDetalle.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  {pagando === cobroDetalle.id ? 'Procesando...' : 'Marcar como Pagado'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
