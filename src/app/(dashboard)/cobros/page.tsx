'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
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
  Search,
  AlertTriangle,
  Receipt,
  Users,
  Package,
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

interface ConsultaAPI {
  id: string;
  folio: string | null;
  paciente: string;
  paciente_id: string;
  doctor: string;
  doctor_id: string;
  fecha: string;
  diagnostico: string;
  tipo_consulta: string;
  costo_total: number;
  estado_pago: string;
  monto_pagado: number;
  estudios: string;
  procedimiento: string | null;
  hora_inicio: string;
}

interface CobroAPI {
  id: string;
  paciente: string;
  doctor: string;
  fecha: string;
  monto: number;
  metodo_pago: string;
  moneda: string;
  pagado: boolean;
  estado: string;
  folio: string;
  notas: string;
  aseguradora: string;
  consulta_id: string | null;
  paciente_id: string;
}

interface Doctor {
  id: string;
  nombre: string;
  honorario_consulta: number;
  honorario_estudio: number;
  honorario_procedimiento: number;
}

interface DoctorCosto {
  doctor_id: string;
  doctor_nombre: string;
  tipo_costo: string;
  porcentaje: number;
  monto: number;
  descripcion: string;
}

interface LenteDisponible {
  id: string;
  marca: string;
  modelo: string;
  stock: number;
  precio_venta: number | null;
  categoria: string;
}

interface LenteAsignado {
  lente_id: string;
  ojo: 'DERECHO' | 'IZQUIERDO' | 'AMBOS';
  grado_aplicado: string;
  cantidad: number;
  precio: number;
}

interface CatalogoEstudio {
  id: string;
  nombre: string;
  costo: number;
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

interface EstudioItem {
  nombre: string;
  costo: number;
}

export default function CobrosPage() {
  const [page, setPage] = useState(1);
  const { data: consultas, loading, error, refetch, total, page: currentPage } = useFetch<ConsultaAPI>('/api/consultas', { page: String(page), pageSize: '15' });
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');

  const debouncedSearch = useDebounce(search);

  // Modal states
  const [showCobroModal, setShowCobroModal] = useState(false);
  const [consultaSeleccionada, setConsultaSeleccionada] = useState<ConsultaAPI | null>(null);
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [lentes, setLentes] = useState<LenteDisponible[]>([]);
  const [doctorCostos, setDoctorCostos] = useState<DoctorCosto[]>([]);
  const [lentesAsignados, setLentesAsignados] = useState<LenteAsignado[]>([]);
  const [costoBase, setCostoBase] = useState(0);
  const [estudios, setEstudios] = useState<EstudioItem[]>([]);
  const [catalogoEstudios, setCatalogoEstudios] = useState<CatalogoEstudio[]>([]);
  const [searchLente, setSearchLente] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [moneda, setMoneda] = useState('PESOS');
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load doctors, lenses, and study catalog when modal opens
  useEffect(() => {
    if (!showCobroModal) return;
    Promise.all([
      fetch('/api/configuracion/doctores').then((r) => r.json()),
      fetch('/api/inventario/disponible').then((r) => r.json()),
      fetch('/api/configuracion/catalogo-estudios').then((r) => r.json()),
    ]).then(([d, l, e]) => {
      setDoctores(Array.isArray(d) ? d : []);
      setLentes(Array.isArray(l) ? l : []);
      setCatalogoEstudios(Array.isArray(e) ? e : []);
    });
  }, [showCobroModal]);

  // Initialize doctor costs when consultation is selected
  useEffect(() => {
    if (consultaSeleccionada && doctores.length > 0 && doctorCostos.length === 0) {
      const uniqueDoctors: { id: string; nombre: string; tipo: string }[] = [];

      // Doctor principal (siempre)
      const docPrincipal = doctores.find((d) => d.id === consultaSeleccionada.doctor_id);
      if (docPrincipal) {
        uniqueDoctors.push({ id: docPrincipal.id, nombre: docPrincipal.nombre, tipo: 'CONSULTA' });
      }

      const defaultPct = uniqueDoctors.length === 1 ? 100 : Math.floor(100 / uniqueDoctors.length);

      setDoctorCostos(uniqueDoctors.map((d, i) => ({
        doctor_id: d.id,
        doctor_nombre: d.nombre,
        tipo_costo: d.tipo,
        porcentaje: i === uniqueDoctors.length - 1 ? 100 - (defaultPct * (uniqueDoctors.length - 1)) : defaultPct,
        monto: 0,
        descripcion: `Honorario ${d.tipo.toLowerCase()}`,
      })));
    }
  }, [consultaSeleccionada, doctores]);

  // Pre-fill studies from consultation data
  useEffect(() => {
    if (consultaSeleccionada && catalogoEstudios.length > 0 && estudios.length === 0) {
      const studyNames = [consultaSeleccionada.estudios]
        .filter(Boolean)
        .join(', ')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const prefillEstudios: EstudioItem[] = studyNames.map(name => {
        const catalogo = catalogoEstudios.find(e => e.nombre.toLowerCase() === name.toLowerCase());
        return { nombre: name, costo: catalogo?.costo || 0 };
      });
      if (prefillEstudios.length > 0) {
        setEstudios(prefillEstudios);
      }
    }
  }, [consultaSeleccionada, catalogoEstudios]);

  const filteredLentes = useMemo(() => {
    const term = searchLente.toLowerCase();
    return lentes.filter((l) =>
      !term ||
      l.marca.toLowerCase().includes(term) ||
      l.modelo.toLowerCase().includes(term) ||
      l.categoria.toLowerCase().includes(term)
    );
  }, [lentes, searchLente]);

  const mappedConsultas = useMemo(() => {
    return consultas.map((c) => ({
      ...c,
      estado_pago: c.estado_pago || 'PENDIENTE',
    }));
  }, [consultas]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return mappedConsultas.filter((c) => {
      const matchesSearch = !term || c.paciente.toLowerCase().includes(term) || c.folio?.toLowerCase().includes(term);
      const matchesEstado = filterEstado === 'Todos' || c.estado_pago === filterEstado;
      return matchesSearch && matchesEstado;
    });
  }, [mappedConsultas, debouncedSearch, filterEstado]);

  const stats = useMemo(() => {
    const totalCosto = consultas.reduce((sum, c) => sum + (c.costo_total || 0), 0);
    const pagados = consultas.filter((c) => c.estado_pago === 'PAGADO').reduce((sum, c) => sum + (c.costo_total || 0), 0);
    const pendientes = consultas.filter((c) => c.estado_pago === 'PENDIENTE').reduce((sum, c) => sum + (c.costo_total || 0), 0);
    return [
      { label: 'Total Consultas', value: `$${totalCosto.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
      { label: 'Pagadas', value: `$${pagados.toLocaleString()}`, icon: CheckCircle, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
      { label: 'Pendientes', value: `$${pendientes.toLocaleString()}`, icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
      { label: 'Total Registros', value: String(total), icon: TrendingUp, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
    ];
  }, [consultas, total]);

  const subtotalEstudios = useMemo(() => {
    return estudios.reduce((sum, e) => sum + e.costo, 0);
  }, [estudios]);

  const subtotalDoctor = useMemo(() => {
    const totalHonorarios = costoBase + subtotalEstudios;
    return doctorCostos.reduce((sum, dc) => sum + Math.round(totalHonorarios * dc.porcentaje / 100), 0);
  }, [doctorCostos, costoBase, subtotalEstudios]);

  const subtotalLentes = useMemo(() => {
    return lentesAsignados.reduce((sum, la) => sum + (la.precio * la.cantidad), 0);
  }, [lentesAsignados]);

  const totalCobro = useMemo(() => {
    return costoBase + subtotalEstudios + subtotalLentes;
  }, [costoBase, subtotalEstudios, subtotalLentes]);

  const openCobroModal = useCallback((consulta: ConsultaAPI) => {
    setConsultaSeleccionada(consulta);
    setDoctorCostos([]);
    setLentesAsignados([]);
    setCostoBase(consulta.costo_total || 0);
    setEstudios([]);
    setSearchLente('');
    setMetodoPago('EFECTIVO');
    setMoneda('PESOS');
    setNotas('');
    setSubmitError('');
    setShowCobroModal(true);
  }, []);

  const addLente = useCallback((lente: LenteDisponible) => {
    setLentesAsignados((prev) => {
      const exists = prev.find((l) => l.lente_id === lente.id);
      if (exists) return prev;
      return [...prev, {
        lente_id: lente.id,
        ojo: 'DERECHO',
        grado_aplicado: '',
        cantidad: 1,
        precio: lente.precio_venta || 0,
      }];
    });
  }, []);

  const removeLente = useCallback((lente_id: string) => {
    setLentesAsignados((prev) => prev.filter((l) => l.lente_id !== lente_id));
  }, []);

  const updateLente = useCallback((lente_id: string, field: keyof LenteAsignado, value: string | number) => {
    setLentesAsignados((prev) => prev.map((l) =>
      l.lente_id === lente_id ? { ...l, [field]: value } : l
    ));
  }, []);

  const updateDoctorCosto = useCallback((doctor_id: string, field: keyof DoctorCosto, value: string | number) => {
    setDoctorCostos((prev) => prev.map((dc) =>
      dc.doctor_id === doctor_id ? { ...dc, [field]: value } : dc
    ));
  }, []);

  const addDoctorCosto = useCallback(() => {
    if (doctores.length === 0) return;
    const doctor = doctores[0];
    const usedIds = doctorCostos.map(dc => dc.doctor_id);
    const available = doctores.find(d => !usedIds.includes(d.id)) || doctores[0];
    setDoctorCostos((prev) => [...prev, {
      doctor_id: available.id,
      doctor_nombre: available.nombre,
      tipo_costo: 'CONSULTA',
      porcentaje: 0,
      monto: 0,
      descripcion: '',
    }]);
  }, [doctores, doctorCostos]);

  const removeDoctorCosto = useCallback((doctor_id: string) => {
    setDoctorCostos((prev) => prev.filter((dc) => dc.doctor_id !== doctor_id));
  }, []);

  const addEstudio = useCallback(() => {
    setEstudios((prev) => [...prev, { nombre: '', costo: 0 }]);
  }, []);

  const removeEstudio = useCallback((index: number) => {
    setEstudios((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateEstudio = useCallback((index: number, field: keyof EstudioItem, value: string | number) => {
    setEstudios((prev) => prev.map((e, i) =>
      i === index ? { ...e, [field]: value } : e
    ));
  }, []);

  const handleSubmitCobro = async () => {
    if (!consultaSeleccionada) return;
    if (doctorCostos.length === 0 && lentesAsignados.length === 0 && costoBase === 0 && estudios.length === 0) {
      setSubmitError('Agregue al menos un costo de doctor, un lente, un estudio o un costo base');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      // 1. Update doctor costs
      if (doctorCostos.length > 0) {
        await fetch('/api/cobros/doctor-costos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consulta_id: consultaSeleccionada.id,
            costos: doctorCostos.map((dc) => ({
              doctor_id: dc.doctor_id,
              tipo_costo: dc.tipo_costo,
              monto: dc.monto,
              descripcion: dc.descripcion,
            })),
          }),
        });
      }

      // 2. Create cobro with lenses and notes
      const notasConCostos = [
        notas || '',
        costoBase > 0 ? `Costo base (matriz): $${costoBase}` : '',
        estudios.length > 0 ? `Estudios: ${estudios.map(e => `${e.nombre} ($${e.costo})`).join(', ')}` : '',
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/cobros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: consultaSeleccionada.paciente_id,
          consulta_id: consultaSeleccionada.id,
          lentes: lentesAsignados.length > 0 ? lentesAsignados.map((l) => ({
            lente_id: l.lente_id,
            ojo: l.ojo,
            grado_aplicado: l.grado_aplicado ? parseFloat(l.grado_aplicado) : null,
            cantidad: l.cantidad,
          })) : [],
          monto: totalCobro,
          metodo_pago: metodoPago,
          moneda: moneda,
          pagado: true,
          notas: notasConCostos || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setSubmitError(json.error || 'Error al crear cobro');
        return;
      }

      // 3. Update consulta payment status
      await fetch(`/api/consultas/${consultaSeleccionada.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado_pago: 'PAGADO',
          monto_pagado: totalCobro,
          costo_total: totalCobro,
        }),
      });

      setShowCobroModal(false);
      setConsultaSeleccionada(null);
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
        subtitle="Consulta las consultas pendientes de pago y registra cobros."
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
          placeholder="Buscar por paciente o folio..."
          className="flex-1 sm:min-w-[280px]"
        />
        <FilterSelect
          value={filterEstado}
          onChange={setFilterEstado}
          options={['Todos', 'PENDIENTE', 'PAGADO']}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded bg-gray-200 dark:bg-[#202327]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-[#202327] rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-[#202327] rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={DollarSign} title="No se encontraron consultas" description="Intente ajustar los filtros de búsqueda." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#2F3336] bg-gray-50/50 dark:bg-[#202327]/50">
                  {[
                    { label: 'Folio', hide: '' },
                    { label: 'Paciente', hide: '' },
                    { label: 'Doctor', hide: 'hidden md:table-cell' },
                    { label: 'Fecha', hide: 'hidden md:table-cell' },
                    { label: 'Costo', hide: '' },
                    { label: 'Estado', hide: '' },
                    { label: 'Acciones', hide: 'hidden sm:table-cell' },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] ${h.label === 'Costo' ? 'text-right' : 'text-left'} ${h.hide}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {filtered.map((consulta) => (
                  <tr key={consulta.id} className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-[#1D1F23]/60">
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold text-primary-600">{consulta.folio || consulta.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{consulta.paciente}</div>
                      <div className="text-xs text-gray-400 dark:text-[#71767B]">{consulta.diagnostico || '—'}</div>
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-600 dark:text-[#E7E9EA]">{consulta.doctor}</td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-500 dark:text-[#71767B]">
                      {new Date(consulta.fecha).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                        ${consulta.costo_total?.toLocaleString() || '0'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={consulta.estado_pago} config={estadoConfig} />
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4">
                      <div className="flex items-center gap-1">
                        {consulta.estado_pago === 'PENDIENTE' && (
                          <button
                            onClick={() => openCobroModal(consulta)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
                            title="Registrar cobro"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Cobrar
                          </button>
                        )}
                        {consulta.estado_pago === 'PAGADO' && (
                          <span className="text-xs text-emerald-600 font-medium">Pagado</span>
                        )}
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

      {/* Modal de Cobro — Recibo */}
      <Modal isOpen={showCobroModal} onClose={() => setShowCobroModal(false)} maxWidth="max-w-xl">
        {consultaSeleccionada && (
          <div className="space-y-4">
            {/* Header */}
            <div className="text-center border-b border-gray-100 dark:border-[#2F3336] pb-4">
              <h3 className="text-lg font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Recibo de Cobro</h3>
              <p className="text-sm text-gray-500 dark:text-[#71767B] mt-0.5">
                <span className="font-semibold text-primary-600">{consultaSeleccionada.folio}</span>
              </p>
              <p className="text-sm font-medium text-gray-700 dark:text-[#E7E9EA]">{consultaSeleccionada.paciente}</p>
              <p className="text-xs text-gray-400 dark:text-[#71767B]">{new Date(consultaSeleccionada.fecha).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {submitError}
              </div>
            )}

            {/* Desglose de costos — Solo lectura */}
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-4">
              <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-3">Desglose de Costos</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-[#71767B]">Costo base (matriz)</span>
                  <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">${costoBase.toLocaleString()}</span>
                </div>
                {estudios.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm pl-3">
                    <span className="text-gray-500 dark:text-[#71767B]">{e.nombre || 'Estudio'}</span>
                    <span className="font-semibold text-gray-900 dark:text-[#E7E9EA]">${e.costo.toLocaleString()}</span>
                  </div>
                ))}
                {estudios.length > 0 && (
                  <div className="flex justify-between text-xs text-gray-400 dark:text-[#71767B] pl-3 border-b border-gray-200 dark:border-[#2F3336] pb-2">
                    <span>Subtotal estudios ({estudios.length})</span>
                    <span className="font-semibold">${subtotalEstudios.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold pt-1">
                  <span className="text-gray-900 dark:text-[#E7E9EA]">TOTAL</span>
                  <span className="text-primary-700 dark:text-primary-400">${costoBase.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Doctores — Editable: solo porcentaje */}
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-100 dark:ring-purple-800">
                    <Users className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Honorarios Doctores</h4>
                </div>
                <button onClick={addDoctorCosto} className="inline-flex items-center gap-1 rounded-md bg-primary-50 dark:bg-primary-900/20 px-2 py-1 text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors">
                  + Agregar
                </button>
              </div>
              <div className="space-y-3">
                {doctorCostos.map((dc, idx) => {
                  const doctor = doctores.find((d) => d.id === dc.doctor_id);
                  const honorarioCalculado = Math.round((costoBase + subtotalEstudios) * dc.porcentaje / 100);
                  return (
                    <div key={idx} className="rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <select
                            value={dc.doctor_id}
                            onChange={(e) => {
                              const d = doctores.find((doc) => doc.id === e.target.value);
                              if (d) {
                                updateDoctorCosto(dc.doctor_id, 'doctor_id', d.id);
                                updateDoctorCosto(dc.doctor_id, 'doctor_nombre', d.nombre);
                              }
                            }}
                            className="flex-1 min-w-0 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-sm font-bold text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors truncate"
                          >
                            {doctores.map((d) => (
                              <option key={d.id} value={d.id}>{d.nombre}</option>
                            ))}
                          </select>
                          {doctorCostos.length > 1 && (
                            <button onClick={() => removeDoctorCosto(dc.doctor_id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={dc.tipo_costo}
                          onChange={(e) => updateDoctorCosto(dc.doctor_id, 'tipo_costo', e.target.value)}
                          className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                        >
                          <option value="CONSULTA">Consulta</option>
                          <option value="ESTUDIO">Estudio</option>
                          <option value="PROCEDIMIENTO">Procedimiento</option>
                        </select>
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={dc.porcentaje}
                            onChange={(e) => updateDoctorCosto(dc.doctor_id, 'porcentaje', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-16 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2 py-1.5 text-sm text-center font-bold text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                          />
                          <span className="text-sm font-bold text-gray-400 dark:text-[#71767B]">%</span>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">${honorarioCalculado.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {doctorCostos.length > 0 && (
                <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100 dark:border-[#2F3336]">
                  <span className="text-xs font-bold text-gray-400 dark:text-[#71767B]">
                    Total distribuido: {doctorCostos.reduce((sum, dc) => sum + dc.porcentaje, 0)}%
                  </span>
                  <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                    Subtotal: ${subtotalDoctor.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Lentes — Opcional */}
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20 ring-1 ring-sky-100 dark:ring-sky-800">
                  <Package className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                </div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Lentes</h4>
                <span className="text-[10px] font-medium text-gray-400 dark:text-[#71767B]">(Opcional)</span>
              </div>

              {lentesAsignados.length > 0 && (
                <div className="mb-3 space-y-2">
                  {lentesAsignados.map((la) => {
                    const lente = lentes.find((l) => l.id === la.lente_id);
                    if (!lente) return null;
                    return (
                      <div key={la.lente_id} className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{lente.marca} {lente.modelo}</div>
                          <div className="text-[11px] text-gray-400 dark:text-[#71767B]">Stock: {lente.stock} · ${lente.precio_venta || '—'}</div>
                        </div>
                        <select
                          value={la.ojo}
                          onChange={(e) => updateLente(la.lente_id, 'ojo', e.target.value)}
                          className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2 py-1.5 text-xs text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                        >
                          <option value="DERECHO">Der</option>
                          <option value="IZQUIERDO">Izq</option>
                          <option value="AMBOS">Ambos</option>
                        </select>
                        <input
                          type="number"
                          min="1"
                          max={lente.stock}
                          value={la.cantidad}
                          onChange={(e) => updateLente(la.lente_id, 'cantidad', parseInt(e.target.value) || 1)}
                          className="w-14 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2 py-1.5 text-xs text-center font-bold text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                        />
                        <button onClick={() => removeLente(la.lente_id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
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
                  placeholder="Buscar lente..."
                  value={searchLente}
                  onChange={(e) => setSearchLente(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
                />
              </div>

              {searchLente && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C]">
                  {filteredLentes.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500 dark:text-[#71767B]">No se encontraron lentes</div>
                  ) : (
                    filteredLentes.map((l) => {
                      const alreadyAdded = lentesAsignados.some((la) => la.lente_id === l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => addLente(l)}
                          disabled={alreadyAdded}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors border-b border-gray-50 dark:border-[#2F3336] last:border-0 ${
                            alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary-50 dark:hover:bg-[#1D1F23]'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{l.marca} {l.modelo}</div>
                            <div className="text-[11px] text-gray-400 dark:text-[#71767B]">{l.categoria} · Stock: {l.stock} · ${l.precio_venta || '—'}</div>
                          </div>
                          {alreadyAdded && <span className="text-[10px] font-bold text-gray-400">AGREGADO</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {lentesAsignados.length > 0 && (
                <div className="flex justify-end pt-2 mt-2 border-t border-gray-100 dark:border-[#2F3336]">
                  <span className="text-xs font-bold text-gray-500 dark:text-[#71767B]">Subtotal lentes: <span className="text-gray-900 dark:text-[#E7E9EA]">${subtotalLentes.toLocaleString()}</span></span>
                </div>
              )}
            </div>

            {/* Total final */}
            <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-[#71767B]">Costo base</span>
                  <span className="font-semibold text-gray-900 dark:text-[#E7E9EA]">${costoBase.toLocaleString()}</span>
                </div>
                {estudios.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-[#71767B]">Estudios ({estudios.length})</span>
                    <span className="font-semibold text-gray-900 dark:text-[#E7E9EA]">${subtotalEstudios.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-[#71767B]">Honorarios doctores</span>
                  <span className="font-semibold text-gray-900 dark:text-[#E7E9EA]">${subtotalDoctor.toLocaleString()}</span>
                </div>
                {lentesAsignados.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-[#71767B]">Lentes ({lentesAsignados.length})</span>
                    <span className="font-semibold text-gray-900 dark:text-[#E7E9EA]">${subtotalLentes.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 flex justify-between">
                  <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">TOTAL A COBRAR</span>
                  <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">${totalCobro.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Pago */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-[#71767B] uppercase tracking-wider mb-1">Método de pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-[#71767B] uppercase tracking-wider mb-1">Moneda</label>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
                >
                  <option value="PESOS">Peso Mexicano</option>
                  <option value="DOLARES">Dólar</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-[#71767B] uppercase tracking-wider mb-1">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Notas adicionales..."
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCobroModal(false)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-[#2F3336] px-4 py-3 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSubmitCobro}
                disabled={submitting || totalCobro <= 0}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Registrando...
                  </span>
                ) : (
                  `COBRAR $${totalCobro.toLocaleString()}`
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
