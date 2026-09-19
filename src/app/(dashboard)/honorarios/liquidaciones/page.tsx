'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle, Download, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface Liquidacion {
  id: string;
  doctor_id: string;
  doctor_nombre: string;
  periodo_codigo: string;
  total_devengado: number;
  total_ajustes: number;
  total_retenciones: number;
  neto_pagar: number;
  moneda: string;
  estado: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

const estadoConfig: Record<string, { bg: string; text: string; label: string }> = {
  BORRADOR: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Borrador' },
  PENDIENTE_APROBACION: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendiente' },
  APROBADA: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Aprobada' },
  PAGADA: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pagada' },
  RECHAZADA: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rechazada' },
};

export default function LiquidacionesPage() {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [aprobando, setAprobando] = useState<string | null>(null);
  const [showConfirmAprobar, setShowConfirmAprobar] = useState(false);
  const [liquidacionAAprobar, setLiquidacionAAprobar] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filtroEstado) qs.set('estado', filtroEstado);
      const res = await fetch(`/api/honorarios/liquidaciones?${qs.toString()}`);
      if (res.ok) setLiquidaciones(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAprobar = async (id: string) => {
    setShowConfirmAprobar(true);
    setLiquidacionAAprobar(id);
  };

  const confirmAprobar = async () => {
    if (!liquidacionAAprobar) return;
    setAprobando(liquidacionAAprobar);
    setShowConfirmAprobar(false);
    try {
      const res = await fetch(`/api/honorarios/liquidaciones/${liquidacionAAprobar}/aprobar`, { method: 'POST' });
      if (res.ok) fetchData();
      else {
        const err = await res.json();
        alert(err.error || 'Error al aprobar');
      }
    } catch {
      alert('Error de red');
    } finally {
      setAprobando(null);
      setLiquidacionAAprobar(null);
    }
  };

  const handleExportar = (id: string) => {
    window.open(`/api/honorarios/liquidaciones/${id}/exportar?formato=excel`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/honorarios" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <PageHeader
          title="Liquidaciones"
          subtitle="Aprobar, exportar y gestionar pagos a doctores"
        />
      </div>

      <div className="flex items-center gap-3">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="">Todos los estados</option>
          <option value="PENDIENTE_APROBACION">Pendientes</option>
          <option value="APROBADA">Aprobadas</option>
          <option value="PAGADA">Pagadas</option>
          <option value="RECHAZADA">Rechazadas</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : liquidaciones.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin liquidaciones"
          description="Las liquidaciones se generan automáticamente al cerrar un período de pago."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3 text-right">Devengado</th>
                <th className="px-4 py-3 text-right">Ajustes</th>
                <th className="px-4 py-3 text-right">Neto a Pagar</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liquidaciones.map((l) => {
                const cfg = estadoConfig[l.estado] || estadoConfig.BORRADOR;
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{l.doctor_nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{l.periodo_codigo}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtMoney(l.total_devengado)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {l.total_ajustes !== 0 ? fmtMoney(l.total_ajustes) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(l.neto_pagar)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.text)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {l.estado === 'PENDIENTE_APROBACION' && (
                          <button
                            onClick={() => handleAprobar(l.id)}
                            disabled={aprobando === l.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Aprobar
                          </button>
                        )}
                        <button
                          onClick={() => handleExportar(l.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Exportar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirmAprobar}
        onClose={() => { setShowConfirmAprobar(false); setLiquidacionAAprobar(null); }}
        onConfirm={confirmAprobar}
        title="Aprobar liquidación"
        message="¿Aprobar esta liquidación?"
        confirmText="Aprobar"
        variant="warning"
        loading={aprobando !== null}
      />
    </div>
  );
}
