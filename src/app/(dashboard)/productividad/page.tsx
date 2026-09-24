'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DollarSign,
  Users,
  Scissors,
  ArrowLeftRight,
  Eye,
  Download,
  Lock,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Settings,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Tabs from '@/components/ui/Tabs';
import FiltrosReporte from '@/components/productividad/FiltrosReporte';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv, rangoMesActual } from '@/lib/rangos';
import { useUser } from '@/hooks/useUser';

type TabId = 'honorarios' | 'por_doctor' | 'cirugias' | 'entradas_salidas' | 'estudios' | 'pagos' | 'tarifas' | 'periodos' | 'sync';

const TAB_LABELS: Record<TabId, string> = {
  honorarios: 'Honorarios',
  por_doctor: 'Por doctor',
  cirugias: 'Cirugías',
  entradas_salidas: 'Entradas y salidas',
  estudios: 'Estudios',
  pagos: 'Pagos',
  tarifas: 'Tarifas',
  periodos: 'Períodos',
  sync: 'Sync',
};

const TAB_IDS = Object.keys(TAB_LABELS) as TabId[];

interface HonorarioFila {
  fuente: string;
  doctor_id: string;
  fecha: string;
  monto: number;
  estado_pago: string;
  origen: string | null;
  doctor_nombre: string;
}

interface PorDoctorFila {
  doctor_id: string;
  doctor_nombre: string;
  eventos: number;
  monto: number;
  pendiente: number;
  pagado: number;
  sin_config: number;
}

interface CirugiaFila {
  id: string;
  cirugia_id: string;
  codigo: string | null;
  fecha: string | null;
  doctor_nombre: string;
  monto: number;
  estado: unknown;
  estado_pago: string;
}

interface EntradaFila {
  id: string;
  folio: string | null;
  fecha: string;
  tipo_consulta: string | null;
  paciente: string;
  doctor: string;
  costo_total: number;
  monto_pagado: number;
  saldo: number;
  estatus_pago: string | null;
}

interface EstudioFila {
  id: string;
  fecha: string | null;
  folio: string | null;
  paciente: string;
  doctor: string;
  concepto: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

interface Totales {
  honorarios_monto: number;
  honorarios_eventos: number;
  por_pagar: number;
  pagado: number;
  pendiente_config: number;
  cirugias_monto: number;
  entradas_costo: number;
  entradas_pagado: number;
  estudios_total: number;
  estudios_cantidad: number;
}

interface ProductividadResponse {
  honorarios: HonorarioFila[];
  por_doctor: PorDoctorFila[];
  cirugias: CirugiaFila[];
  entradas_salidas: EntradaFila[];
  estudios: EstudioFila[];
  totales: Totales;
}

interface DoctorOption {
  id: string;
  nombre: string;
}

const EMPTY_DATA: ProductividadResponse = {
  honorarios: [],
  por_doctor: [],
  cirugias: [],
  entradas_salidas: [],
  estudios: [],
  totales: {
    honorarios_monto: 0,
    honorarios_eventos: 0,
    por_pagar: 0,
    pagado: 0,
    pendiente_config: 0,
    cirugias_monto: 0,
    entradas_costo: 0,
    entradas_pagado: 0,
    estudios_total: 0,
    estudios_cantidad: 0,
  },
};

const estadoPagoBadge: Record<string, string> = {
  PAGADO: 'bg-emerald-100 text-emerald-700',
  POR_PAGAR: 'bg-amber-100 text-amber-700',
  PENDIENTE_CONFIG: 'bg-gray-100 text-gray-600',
};

function badge(estado: string | null | undefined): string {
  if (!estado) return 'bg-gray-100 text-gray-600';
  return estadoPagoBadge[estado] || 'bg-sky-100 text-sky-700';
}

function PagosTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/productividad/pagos')
      .then((r) => r.json())
      .then((data) => { setLiquidaciones(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isAdmin]);

  const handleAprobar = async (id: string) => {
    setActionLoading(id);
    await fetch(`/api/productividad/pagos/${id}/aprobar`, { method: 'POST' });
    const res = await fetch('/api/productividad/pagos').then((r) => r.json());
    setLiquidaciones(res || []);
    setActionLoading(null);
  };

  const handlePagar = async (id: string) => {
    setActionLoading(id);
    await fetch(`/api/productividad/pagos/${id}/pagar`, { method: 'POST', body: JSON.stringify({ monto: 0 }) });
    const res = await fetch('/api/productividad/pagos').then((r) => r.json());
    setLiquidaciones(res || []);
    setActionLoading(null);
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Pagos" subtitle="Aprobación y registro de pagos a doctores" />
      {loading ? <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          {liquidaciones.length === 0 ? <EmptyState icon={CreditCard} title="Sin liquidaciones" description="No hay liquidaciones pendientes" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Doctor</th>
                    <th className={thR}>Total</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Período</th>
                    <th className={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {liquidaciones.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={td}>{l.doctor_nombre || '—'}</td>
                      <td className={tdR}>{formatCurrency(l.neto_pagar || l.total_devengado || 0)}</td>
                      <td className={td}><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(l.estado)}`}>{l.estado}</span></td>
                      <td className={td}>{l.periodo_codigo || '—'}</td>
                      <td className={td}>
                        {l.estado === 'PENDIENTE_APROBACION' && (
                          <button onClick={() => handleAprobar(l.id)} disabled={actionLoading === l.id} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">Aprobar</button>
                        )}
                        {l.estado === 'APROBADA' && (
                          <button onClick={() => handlePagar(l.id)} disabled={actionLoading === l.id} className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-bold hover:bg-primary-700 disabled:opacity-50">Pagar</button>
                        )}
                        {l.estado === 'PAGADA' && <span className="text-emerald-600 font-bold text-xs">Pagado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TarifasTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const [tarifas, setTarifas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ doctor_id: '', tipo_concepto: 'CONSULTA' as const, rol: 'PRINCIPAL' as const, tipo_calculo: 'FIJO' as const, valor: 0, moneda: 'PESOS' as const, vigente_desde: '' });

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/productividad/tarifas')
      .then((r) => r.json())
      .then((data) => { setTarifas(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isAdmin]);

  const handleCrear = async () => {
    await fetch('/api/productividad/tarifas', { method: 'POST', body: JSON.stringify(formData) });
    setShowForm(false);
    const res = await fetch('/api/productividad/tarifas').then((r) => r.json());
    setTarifas(res || []);
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Tarifas" subtitle="Configurar honorarios por doctor, concepto y rol" action={<button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">+ Nueva Tarifa</button>} />
      {showForm && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Doctor ID" value={formData.doctor_id} onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
            <select value={formData.tipo_concepto} onChange={(e) => setFormData({ ...formData, tipo_concepto: e.target.value as any })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm">
              <option value="CONSULTA">Consulta</option>
              <option value="ESTUDIO">Estudio</option>
              <option value="PROCEDIMIENTO">Procedimiento</option>
            </select>
            <select value={formData.rol} onChange={(e) => setFormData({ ...formData, rol: e.target.value as any })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm">
              <option value="PRINCIPAL">Principal</option>
              <option value="AYUDANTE">Ayudante</option>
              <option value="ANESTESIOLOGO">Anestesiólogo</option>
            </select>
<select value={formData.tipo_calculo} onChange={(e) => setFormData({ ...formData, tipo_calculo: e.target.value as any })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm">
               <option value="FIJO">Fijo</option>
               <option value="PORCENTAJE">Porcentaje</option>
             </select>
             <input type="number" placeholder="Valor" value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: Number(e.target.value) })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
             <select value={formData.moneda} onChange={(e) => setFormData({ ...formData, moneda: e.target.value as any })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm">
               <option value="PESOS">PESOS</option>
               <option value="DOLARES">DOLARES</option>
             </select>
            <input type="date" value={formData.vigente_desde} onChange={(e) => setFormData({ ...formData, vigente_desde: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
          </div>
          <button onClick={handleCrear} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Guardar</button>
        </div>
      )}
      {loading ? <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          {tarifas.length === 0 ? <EmptyState icon={Settings} title="Sin tarifas" description="Configure tarifas para los doctores" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Doctor</th>
                    <th className={th}>Concepto</th>
                    <th className={th}>Rol</th>
                    <th className={th}>Tipo</th>
                    <th className={thR}>Valor</th>
                    <th className={th}>Moneda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {tarifas.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={td}>{t.doctor_nombre || '—'}</td>
                      <td className={td}>{t.tipo_concepto}</td>
                      <td className={td}>{t.rol}</td>
                      <td className={td}>{t.tipo_calculo}</td>
                      <td className={tdR}>{formatCurrency(t.valor)}</td>
                      <td className={td}>{t.moneda}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeriodosTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const [periodos, setPeriodos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ codigo: '', fecha_desde: '', fecha_hasta: '', notas: '' });

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/productividad/periodos')
      .then((r) => r.json())
      .then((data) => { setPeriodos(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isAdmin]);

  const handleCrear = async () => {
    await fetch('/api/productividad/periodos', { method: 'POST', body: JSON.stringify(formData) });
    setShowForm(false);
    const res = await fetch('/api/productividad/periodos').then((r) => r.json());
    setPeriodos(res || []);
  };

  const handleCerrar = async (id: string) => {
    await fetch(`/api/productividad/periodos/${id}/cerrar`, { method: 'POST' });
    const res = await fetch('/api/productividad/periodos').then((r) => r.json());
    setPeriodos(res || []);
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Períodos" subtitle="Gestionar períodos de pago y cierre" action={<button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">+ Nuevo Período</button>} />
      {showForm && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Código" value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
            <input type="date" value={formData.fecha_desde} onChange={(e) => setFormData({ ...formData, fecha_desde: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
            <input type="date" value={formData.fecha_hasta} onChange={(e) => setFormData({ ...formData, fecha_hasta: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
            <input placeholder="Notas" value={formData.notas} onChange={(e) => setFormData({ ...formData, notas: e.target.value })} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
          </div>
          <button onClick={handleCrear} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Guardar</button>
        </div>
      )}
      {loading ? <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          {periodos.length === 0 ? <EmptyState icon={Calendar} title="Sin períodos" description="Cree períodos de pago" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Código</th>
                    <th className={th}>Desde</th>
                    <th className={th}>Hasta</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {periodos.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={td}>{p.codigo}</td>
                      <td className={td}>{p.fecha_desde}</td>
                      <td className={td}>{p.fecha_hasta}</td>
                      <td className={td}><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(p.estado)}`}>{p.estado}</span></td>
                      <td className={td}>
                        {p.estado === 'ABIERTO' || p.estado === 'EN_REVISION' ? (
                          <button onClick={() => handleCerrar(p.id)} className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700">Cerrar</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SyncTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const [syncResult, setSyncResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/productividad/sync')
      .then((r) => r.json())
      .then((data) => { setLogs(Array.isArray(data) ? data : []); })
      .catch(() => {});
  }, [isAdmin]);

  const handleSync = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fechaDesde) params.set('fecha_desde', fechaDesde);
    if (fechaHasta) params.set('fecha_hasta', fechaHasta);
    const res = await fetch(`/api/productividad/sync?${params}`, { method: 'POST' });
    const data = await res.json();
    setSyncResult(data.sync || data);
    setLoading(false);
    const logsRes = await fetch('/api/productividad/sync').then((r) => r.json());
    setLogs(Array.isArray(logsRes) ? logsRes : []);
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Sync" subtitle="Verificar y sincronizar honorarios de consultas y cirugías" />
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} placeholder="Desde" className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} placeholder="Hasta" className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
        </div>
        <button onClick={handleSync} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Sincronizando...' : 'Ejecutar Sync'}
        </button>
      </div>
      {syncResult && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <h3 className="text-sm font-bold mb-2">Resultado de Sync</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><p className="text-xs text-gray-500">Consultas verificadas</p><p className="text-lg font-bold">{syncResult.consultas_verificadas}</p></div>
            <div><p className="text-xs text-gray-500">Cirugías verificadas</p><p className="text-lg font-bold">{syncResult.cirugias_verificadas}</p></div>
            <div><p className="text-xs text-gray-500">Eventos creados</p><p className="text-lg font-bold text-emerald-600">{syncResult.eventos_creados}</p></div>
            <div><p className="text-xs text-gray-500">Eventos existentes</p><p className="text-lg font-bold">{syncResult.eventos_existentes}</p></div>
          </div>
          {syncResult.errores && syncResult.errores.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.errores.map((e: string, i: number) => <p key={i} className="text-xs text-rose-600">{e}</p>)}
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          <h3 className="text-sm font-bold p-4 border-b border-gray-200 dark:border-[#2F3336]">Historial de Sync</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#202327]/50">
                  <th className={th}>Fecha</th>
                  <th className={th}>Consultas</th>
                  <th className={th}>Cirugías</th>
                  <th className={th}>Creados</th>
                  <th className={th}>Errores</th>
                  <th className={th}>Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                    <td className={td}>{l.fecha_inicio}</td>
                    <td className={td}>{l.consultas_verificadas}</td>
                    <td className={td}>{l.cirugias_verificadas}</td>
                    <td className={td}>{l.eventos_creados}</td>
                    <td className={td}>{l.errores}</td>
                    <td className={td}>{(l.duracion_ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const th =
  'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-4 py-3 text-sm text-gray-700 dark:text-[#E7E9EA]';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]';

export default function ProductividadPage() {
  const { user, loading: userLoading } = useUser();
  const isAdmin = user?.rol === 'admin';

  const [tab, setTab] = useState<TabId>('honorarios');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctores, setDoctores] = useState<DoctorOption[]>([]);
  const [data, setData] = useState<ProductividadResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readyRef = useRef(false);

  const fetchData = useCallback(
    async (fdesde: string, fhasta: string, ftab: TabId, fdoctor: string, signal?: AbortSignal) => {
      if (!fdesde || !fhasta) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (signal) {
        if (signal.aborted) controller.abort();
        else {
          signal.addEventListener('abort', () => controller.abort());
        }
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ desde: fdesde, hasta: fhasta, tab: ftab });
        if (fdoctor) params.set('doctor_id', fdoctor);
        const res = await fetch(`/api/productividad?${params}`, { signal: controller.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Error ${res.status}`);
        }
        const json = (await res.json()) as ProductividadResponse;
        if (!controller.signal.aborted) {
          setData({
            honorarios: json.honorarios || [],
            por_doctor: json.por_doctor || [],
            cirugias: json.cirugias || [],
            entradas_salidas: json.entradas_salidas || [],
            estudios: json.estudios || [],
            totales: json.totales || EMPTY_DATA.totales,
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Error al cargar productividad');
          setData(EMPTY_DATA);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (userLoading || !isAdmin) return;
    const r = rangoMesActual();
    setDesde(r.desde);
    setHasta(r.hasta);
    readyRef.current = true;

    const ac = new AbortController();
    fetchData(r.desde, r.hasta, 'honorarios', '', ac.signal);

    fetch('/api/configuracion/doctores')
      .then((res) => (res.ok ? res.json() : []))
      .then((docs: Array<{ id: string; nombre_completo?: string; nombre?: string }>) =>
        setDoctores(
          (docs || []).map((d) => ({
            id: d.id,
            nombre: d.nombre_completo || d.nombre || d.id,
          }))
        )
      )
      .catch(() => setDoctores([]));

    return () => ac.abort();
  }, [userLoading, isAdmin, fetchData]);

  const handleFilter = useCallback(
    (f: { fecha_desde?: string; fecha_hasta?: string; doctor_id?: string }) => {
      const fd = f.fecha_desde || desde;
      const fh = f.fecha_hasta || hasta;
      const doc = f.doctor_id !== undefined ? f.doctor_id : doctorId;
      setDesde(fd);
      setHasta(fh);
      setDoctorId(doc);
      if (fd && fh) void fetchData(fd, fh, tab, doc);
    },
    [desde, hasta, doctorId, tab, fetchData]
  );

  const handleTab = useCallback(
    (next: string) => {
      const id = (TAB_IDS.includes(next as TabId) ? next : 'honorarios') as TabId;
      setTab(id);
      if (desde && hasta && isAdmin) void fetchData(desde, hasta, id, doctorId);
    },
    [desde, hasta, doctorId, isAdmin, fetchData]
  );

  const descargarCsv = useCallback(async () => {
    if (!desde || !hasta) return;
    try {
      const params = new URLSearchParams({ desde, hasta, tab, formato: 'csv' });
      if (doctorId) params.set('doctor_id', doctorId);
      const res = await fetch(`/api/productividad?${params}`);
      if (!res.ok) throw new Error('No se pudo generar el CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productividad-${tab}-${desde}_${hasta}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar CSV');
    }
  }, [desde, hasta, tab, doctorId]);

  const tabLabels = useMemo(() => TAB_IDS.map((id) => TAB_LABELS[id]), []);

  if (userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Acceso restringido"
        description="Este módulo solo está disponible para administradores."
      />
    );
  }

  const t = data.totales;
  const cards =
    tab === 'honorarios'
      ? [
          { icon: DollarSign, label: 'Devengado', value: formatCurrency(t.honorarios_monto), color: 'text-primary-600', bgColor: 'bg-primary-50' },
          { icon: TrendingUp, label: 'Por pagar', value: formatCurrency(t.por_pagar), color: 'text-amber-600', bgColor: 'bg-amber-50' },
          { icon: Users, label: 'Pagado', value: formatCurrency(t.pagado), color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
          { icon: AlertTriangle, label: 'Sin configurar', value: String(t.pendiente_config), color: 'text-rose-600', bgColor: 'bg-rose-50' },
        ]
      : tab === 'por_doctor'
        ? [
            { icon: Users, label: 'Doctores', value: String(data.por_doctor.length), color: 'text-blue-600', bgColor: 'bg-blue-50' },
            { icon: DollarSign, label: 'Monto total', value: formatCurrency(data.por_doctor.reduce((s, d) => s + d.monto, 0)), color: 'text-primary-600', bgColor: 'bg-primary-50' },
            { icon: TrendingUp, label: 'Por pagar', value: formatCurrency(data.por_doctor.reduce((s, d) => s + d.pendiente, 0)), color: 'text-amber-600', bgColor: 'bg-amber-50' },
            { icon: AlertTriangle, label: 'Sin configurar', value: String(data.por_doctor.reduce((s, d) => s + d.sin_config, 0)), color: 'text-rose-600', bgColor: 'bg-rose-50' },
          ]
        : tab === 'cirugias'
          ? [
              { icon: Scissors, label: 'Cirugías', value: String(data.cirugias.length), color: 'text-blue-600', bgColor: 'bg-blue-50' },
              { icon: DollarSign, label: 'Monto', value: formatCurrency(t.cirugias_monto), color: 'text-primary-600', bgColor: 'bg-primary-50' },
              { icon: Users, label: 'Doctores', value: String(new Set(data.cirugias.map((c) => c.doctor_nombre)).size), color: 'text-violet-600', bgColor: 'bg-violet-50' },
              { icon: TrendingUp, label: 'Promedio', value: formatCurrency(data.cirugias.length ? t.cirugias_monto / data.cirugias.length : 0), color: 'text-amber-600', bgColor: 'bg-amber-50' },
            ]
          : tab === 'entradas_salidas'
            ? [
                { icon: ArrowLeftRight, label: 'Consultas', value: String(data.entradas_salidas.length), color: 'text-blue-600', bgColor: 'bg-blue-50' },
                { icon: DollarSign, label: 'Costo total', value: formatCurrency(t.entradas_costo), color: 'text-primary-600', bgColor: 'bg-primary-50' },
                { icon: TrendingUp, label: 'Cobrado', value: formatCurrency(t.entradas_pagado), color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
                { icon: AlertTriangle, label: 'Saldo', value: formatCurrency(t.entradas_costo - t.entradas_pagado), color: 'text-amber-600', bgColor: 'bg-amber-50' },
              ]
            : [
                { icon: Eye, label: 'Estudios', value: String(data.estudios.length), color: 'text-blue-600', bgColor: 'bg-blue-50' },
                { icon: DollarSign, label: 'Total', value: formatCurrency(t.estudios_total), color: 'text-primary-600', bgColor: 'bg-primary-50' },
                { icon: Users, label: 'Unidades', value: String(t.estudios_cantidad), color: 'text-violet-600', bgColor: 'bg-violet-50' },
                { icon: TrendingUp, label: 'Promedio', value: formatCurrency(data.estudios.length ? t.estudios_total / data.estudios.length : 0), color: 'text-amber-600', bgColor: 'bg-amber-50' },
              ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productividad"
        subtitle="Resumen admin: honorarios, cirugías, consultas y estudios"
        action={
          <button
            type="button"
            onClick={descargarCsv}
            disabled={loading || !desde}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1D1F23] text-sm font-medium disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        }
      />

      <FiltrosReporte onFilter={handleFilter} showDoctor doctores={doctores} loading={loading} />

      <Tabs tabs={tabLabels} active={TAB_LABELS[tab]} onChange={handleTab} />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} bgColor={c.bgColor} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : tab === 'honorarios' ? (
          data.honorarios.length === 0 ? (
            <EmptyState icon={DollarSign} title="Sin honorarios" description="No hay devengos en el rango seleccionado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Fecha</th>
                    <th className={th}>Doctor</th>
                    <th className={th}>Fuente</th>
                    <th className={th}>Origen</th>
                    <th className={thR}>Monto</th>
                    <th className={th}>Estado pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {data.honorarios.map((f, i) => (
                    <tr key={`${f.doctor_id}-${f.fecha}-${f.fuente}-${i}`} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={td}>{formatFechaCsv(f.fecha)}</td>
                      <td className={`${td} font-semibold`}>{f.doctor_nombre}</td>
                      <td className={td}>{f.fuente}</td>
                      <td className={td}>{f.origen || '—'}</td>
                      <td className={tdR}>{formatCurrency(f.monto)}</td>
                      <td className={td}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(f.estado_pago)}`}>
                          {f.estado_pago}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'por_doctor' ? (
          data.por_doctor.length === 0 ? (
            <EmptyState icon={Users} title="Sin datos" description="No hay movimientos por doctor en el rango" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Doctor</th>
                    <th className={thR}>Eventos</th>
                    <th className={thR}>Monto</th>
                    <th className={thR}>Por pagar</th>
                    <th className={thR}>Pagado</th>
                    <th className={thR}>Sin configurar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {data.por_doctor.map((d) => (
                    <tr key={d.doctor_id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={`${td} font-semibold`}>{d.doctor_nombre}</td>
                      <td className={tdR}>{d.eventos}</td>
                      <td className={tdR}>{formatCurrency(d.monto)}</td>
                      <td className={tdR}>{formatCurrency(d.pendiente)}</td>
                      <td className={tdR}>{formatCurrency(d.pagado)}</td>
                      <td className={tdR}>{d.sin_config}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'cirugias' ? (
          data.cirugias.length === 0 ? (
            <EmptyState icon={Scissors} title="Sin cirugías" description="No hay productividad de cirugía en el rango" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Código</th>
                    <th className={th}>Fecha</th>
                    <th className={th}>Doctor</th>
                    <th className={thR}>Monto</th>
                    <th className={th}>Estado pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {data.cirugias.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={`${td} font-mono text-xs`}>{c.codigo || '—'}</td>
                      <td className={td}>{c.fecha ? formatFechaCsv(c.fecha) : '—'}</td>
                      <td className={`${td} font-semibold`}>{c.doctor_nombre}</td>
                      <td className={tdR}>{formatCurrency(c.monto)}</td>
                      <td className={td}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(c.estado_pago)}`}>
                          {c.estado_pago}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'entradas_salidas' ? (
          data.entradas_salidas.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Sin consultas" description="No hay entradas y salidas en el rango" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className={th}>Fecha</th>
                    <th className={th}>Folio</th>
                    <th className={th}>Paciente</th>
                    <th className={th}>Doctor</th>
                    <th className={th}>Tipo</th>
                    <th className={thR}>Costo</th>
                    <th className={thR}>Pagado</th>
                    <th className={thR}>Saldo</th>
                    <th className={th}>Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {data.entradas_salidas.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                      <td className={td}>{formatFechaCsv(c.fecha)}</td>
                      <td className={`${td} font-mono text-xs`}>{c.folio || '—'}</td>
                      <td className={td}>{c.paciente}</td>
                      <td className={td}>{c.doctor}</td>
                      <td className={td}>{c.tipo_consulta || '—'}</td>
                      <td className={tdR}>{formatCurrency(c.costo_total)}</td>
                      <td className={tdR}>{formatCurrency(c.monto_pagado)}</td>
                      <td className={tdR}>{formatCurrency(c.saldo)}</td>
                      <td className={td}>{c.estatus_pago || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : data.estudios.length === 0 ? (
          <EmptyState icon={Eye} title="Sin estudios" description="No hay estudios en el rango seleccionado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#202327]/50">
                  <th className={th}>Fecha</th>
                  <th className={th}>Folio</th>
                  <th className={th}>Paciente</th>
                  <th className={th}>Doctor</th>
                  <th className={th}>Estudio</th>
                  <th className={thR}>Cant.</th>
                  <th className={thR}>P. unit.</th>
                  <th className={thR}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {data.estudios.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                    <td className={td}>{e.fecha ? formatFechaCsv(e.fecha) : '—'}</td>
                    <td className={`${td} font-mono text-xs`}>{e.folio || '—'}</td>
                    <td className={td}>{e.paciente}</td>
                    <td className={td}>{e.doctor}</td>
                    <td className={td}>{e.concepto}</td>
                    <td className={tdR}>{e.cantidad}</td>
                    <td className={tdR}>{formatCurrency(e.precio_unitario)}</td>
                    <td className={tdR}>{formatCurrency(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab: Pagos */}
      {tab === 'pagos' && (
        <PagosTab />
      )}

      {/* Tab: Tarifas */}
      {tab === 'tarifas' && (
        <TarifasTab />
      )}

      {/* Tab: Períodos */}
      {tab === 'periodos' && (
        <PeriodosTab />
      )}

      {/* Tab: Sync */}
      {tab === 'sync' && (
        <SyncTab />
      )}
    </div>
  );
}
