'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Lock, Unlock, Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

interface Periodo {
  id: string;
  codigo: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: string;
  cerrado_at: string | null;
  notas: string | null;
}

const estadoConfig: Record<string, { bg: string; text: string; label: string }> = {
  ABIERTO: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Abierto' },
  EN_REVISION: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En Revisión' },
  CERRADO: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Cerrado' },
  PAGADO: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pagado' },
};

export default function PeriodosPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [form, setForm] = useState({
    codigo: '',
    fecha_desde: '',
    fecha_hasta: '',
    notas: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/honorarios/periodos');
      if (res.ok) setPeriodos(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCrear = async () => {
    if (!form.codigo || !form.fecha_desde || !form.fecha_hasta) return;
    const res = await fetch('/api/honorarios/periodos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ codigo: '', fecha_desde: '', fecha_hasta: '', notas: '' });
      fetchData();
    }
  };

  const handleCerrar = async (periodoId: string) => {
    if (!confirm('¿Cerrar este período? Esto congelará todos los eventos devengados y generará las liquidaciones.')) return;
    setCerrando(periodoId);
    try {
      const res = await fetch(`/api/honorarios/periodos/${periodoId}/cerrar`, { method: 'POST' });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Error al cerrar período');
      }
    } catch {
      alert('Error de red');
    } finally {
      setCerrando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/honorarios" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <PageHeader
          title="Períodos de Pago"
          subtitle="Crear, cerrar y gestionar períodos de liquidación"
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nuevo Período
            </button>
          }
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : periodos.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Sin períodos de pago"
          description="Crea el primer período para empezar a cerrar honorarios y generar liquidaciones."
        />
      ) : (
        <div className="space-y-3">
          {periodos.map((p) => {
            const cfg = estadoConfig[p.estado] || estadoConfig.ABIERTO;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-gray-900">{p.codigo}</h3>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {p.fecha_desde} — {p.fecha_hasta}
                    {p.cerrado_at && ` · Cerrado el ${p.cerrado_at.split('T')[0]}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(p.estado === 'ABIERTO' || p.estado === 'EN_REVISION') && (
                    <button
                      onClick={() => handleCerrar(p.id)}
                      disabled={cerrando === p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-xs font-medium disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {cerrando === p.id ? 'Cerrando...' : 'Cerrar'}
                    </button>
                  )}
                  {p.estado === 'CERRADO' && (
                    <Link
                      href="/honorarios/liquidaciones"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Ver Liquidaciones
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Período de Pago</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
            <input
              type="text"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="ej: 2026-09-Q1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
              <input
                type="date"
                value={form.fecha_desde}
                onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
              <input
                type="date"
                value={form.fecha_hasta}
                onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
            <button
              onClick={handleCrear}
              disabled={!form.codigo || !form.fecha_desde || !form.fecha_hasta}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50"
            >
              Crear Período
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
