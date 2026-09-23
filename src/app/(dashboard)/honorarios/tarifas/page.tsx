'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Plus, ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

interface Tarifa {
  id: string;
  doctor_id: string;
  doctor_nombre: string;
  tipo_concepto: string;
  concepto_id: string | null;
  rol: string;
  tipo_calculo: string;
  valor: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

interface Doctor {
  id: string;
  nombre: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    doctor_id: '',
    tipo_concepto: 'CONSULTA',
    rol: 'PRINCIPAL',
    tipo_calculo: 'FIJO',
    valor: 0,
    vigente_desde: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tarRes, docRes] = await Promise.all([
        fetch('/api/honorarios/tarifas'),
        fetch('/api/configuracion/doctores'),
      ]);
      if (tarRes.ok) setTarifas(await tarRes.json());
      if (docRes.ok) {
        const docs = await docRes.json();
        setDoctores(docs.map((d: Record<string, unknown>) => ({ id: d.id, nombre: d.nombre })));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setForm(f => ({ ...f, vigente_desde: new Date().toISOString().split('T')[0] }));
  }, []);

  const handleCrear = async () => {
    if (!form.doctor_id || form.valor <= 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/honorarios/tarifas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setCreateError(err.error || 'Error al crear tarifa');
        return;
      }
      setShowForm(false);
      fetchData();
    } catch {
      setCreateError('Error de conexión');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/honorarios" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <PageHeader
          title="Tarifas de Honorarios"
          subtitle="Configurar tarifas por doctor y tipo de servicio"
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nueva Tarifa
            </button>
          }
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : tarifas.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="Sin tarifas configuradas"
          description="Crea la primera tarifa para que el motor de devengo pueda calcular honorarios."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Cálculo</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Vigente Desde</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tarifas.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.doctor_nombre}</td>
                  <td className="px-4 py-3 text-gray-700">{t.tipo_concepto}</td>
                  <td className="px-4 py-3 text-gray-600">{t.rol}</td>
                  <td className="px-4 py-3 text-gray-600">{t.tipo_calculo}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {t.tipo_calculo === 'PORCENTAJE' ? `${t.valor}%` : fmtMoney(t.valor)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.vigente_desde}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      t.vigente_hasta ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'
                    )}>
                      {t.vigente_hasta ? 'Cerrada' : 'Vigente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Nueva Tarifa</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
            <select
              value={form.doctor_id}
              onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar doctor</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Concepto</label>
              <select
                value={form.tipo_concepto}
                onChange={(e) => setForm({ ...form, tipo_concepto: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="CONSULTA">Consulta</option>
                <option value="ESTUDIO">Estudio</option>
                <option value="PROCEDIMIENTO">Procedimiento</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="PRINCIPAL">Principal</option>
                <option value="AYUDANTE">Ayudante</option>
                <option value="ANESTESIOLOGO">Anestesiólogo</option>
                <option value="INTERPRETACION">Interpretación</option>
                <option value="REFERIDOR">Referidor</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cálculo</label>
              <select
                value={form.tipo_calculo}
                onChange={(e) => setForm({ ...form, tipo_calculo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="FIJO">Fijo</option>
                <option value="PORCENTAJE">Porcentaje</option>
                <option value="POR_HORA">Por Hora</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (MXN)</label>
              <input
                type="number"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min={0}
                step={0.01}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vigente Desde</label>
            <input
              type="date"
              value={form.vigente_desde}
              onChange={(e) => setForm({ ...form, vigente_desde: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {createError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => { setShowForm(false); setCreateError(null); }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleCrear}
              disabled={!form.doctor_id || form.valor <= 0 || creating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {creating ? 'Creando...' : 'Crear Tarifa'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
