'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, RefreshCw, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface ConfigHonorarios {
  aseguranza_afecta_honorarios: boolean;
  base_calculo_honorario: 'COBRO_TOTAL' | 'PARTE_PACIENTE';
  tipo_cambio_default: number;
  devengo_automatico: boolean;
}

const DEFAULTS: ConfigHonorarios = {
  aseguranza_afecta_honorarios: false,
  base_calculo_honorario: 'COBRO_TOTAL',
  tipo_cambio_default: 17.50,
  devengo_automatico: true,
};

export default function ConfigHonorariosPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ConfigHonorarios>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tcLoading, setTcLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/configuracion/honorarios-settings');
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULTS, ...data.valor });
      }
    } catch {
      toast('Error al cargar configuración', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion/honorarios-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast('Configuración guardada', 'success');
      } else {
        toast('Error al guardar', 'error');
      }
    } catch {
      toast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }, [config, toast]);

  const fetchTipoCambio = useCallback(async () => {
    setTcLoading(true);
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      if (data?.rates?.MXN) {
        setConfig((prev) => ({ ...prev, tipo_cambio_default: data.rates.MXN }));
        toast(`Tipo de cambio actualizado: $${data.rates.MXN} MXN/USD`, 'success');
      }
    } catch {
      toast('Error al obtener tipo de cambio', 'error');
    } finally {
      setTcLoading(false);
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-20 rounded-xl bg-gray-100 dark:bg-[#202327]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-[#E7E9EA]">Configuración de Honorarios</h2>
          <p className="text-sm text-gray-400">Afecta el cálculo de honorarios de doctores</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6 space-y-6">
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.devengo_automatico}
              onChange={(e) => setConfig((prev) => ({ ...prev, devengo_automatico: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Devengo automático</span>
              <p className="text-xs text-gray-400">Generar honorarios automáticamente al crear una consulta</p>
            </div>
          </label>
        </div>

        <div className="border-t border-gray-100 dark:border-[#2F3336] pt-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.aseguranza_afecta_honorarios}
              onChange={(e) => setConfig((prev) => ({ ...prev, aseguranza_afecta_honorarios: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Aseguranza afecta honorarios</span>
              <p className="text-xs text-gray-400">Cuando está activo, el base de cálculo se ajusta según la cobertura de aseguranza</p>
            </div>
          </label>
        </div>

        <div className="border-t border-gray-100 dark:border-[#2F3336] pt-6">
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-2">
            Base de cálculo del honorario
          </label>
          <div className="flex gap-3">
            {[
              { value: 'COBRO_TOTAL' as const, label: 'Monto total del cobro', desc: 'El honorario se calcula sobre el monto total facturado' },
              { value: 'PARTE_PACIENTE' as const, label: 'Solo parte del paciente', desc: 'El honorario se calcula solo sobre lo que paga el paciente' },
            ].map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all',
                  config.base_calculo_honorario === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                    : 'border-gray-200 dark:border-[#2F3336] hover:border-gray-300'
                )}
              >
                <input
                  type="radio"
                  name="base_calculo"
                  value={opt.value}
                  checked={config.base_calculo_honorario === opt.value}
                  onChange={(e) => setConfig((prev) => ({ ...prev, base_calculo_honorario: e.target.value as ConfigHonorarios['base_calculo_honorario'] }))}
                  className="sr-only"
                />
                <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{opt.label}</span>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-[#2F3336] pt-6">
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-2">
            Tipo de cambio USD → MXN
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                value={config.tipo_cambio_default}
                onChange={(e) => setConfig((prev) => ({ ...prev, tipo_cambio_default: parseFloat(e.target.value) || 0 }))}
                className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MXN/USD</span>
            </div>
            <button
              onClick={fetchTipoCambio}
              disabled={tcLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', tcLoading && 'animate-spin')} />
              Actualizar
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Valor usado cuando la consulta está en dólares. Se actualiza automáticamente al tipo de cambio actual.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          GUARDAR CONFIGURACIÓN
        </button>
      </div>
    </div>
  );
}
