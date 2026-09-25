'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';

type Fase = 'loading' | 'ready' | 'sync' | 'done' | 'error';

interface DoctorFila {
  doctor_id: string;
  doctor_nombre: string;
  origen: string;
  ref: string;
  eventos?: number;
}

interface SyncResultado {
  consultas_verificadas?: number;
  cirugias_verificadas?: number;
  eventos_creados?: number;
  eventos_existentes?: number;
  consultas_desplegadas?: number;
  cirugias_desplegadas?: number;
  doctores_sin_evento?: DoctorFila[];
  doctores_en_modulo?: DoctorFila[];
  doctores_total?: number;
  errores?: string[];
  duracion_ms?: number;
}

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  desde: string;
  hasta: string;
  onCompletado?: () => void;
}

export default function SyncModal({ isOpen, onClose, desde, hasta, onCompletado }: SyncModalProps) {
  const [fase, setFase] = useState<Fase>('loading');
  const [preview, setPreview] = useState<{
    consultas_pendientes?: number;
    cirugias_pendientes?: number;
    doctores_sin_evento?: DoctorFila[];
    doctores_en_modulo?: DoctorFila[];
    doctores_total?: number;
  } | null>(null);
  const [resultado, setResultado] = useState<SyncResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarPreview = useCallback(async () => {
    setFase('loading');
    setError(null);
    setResultado(null);
    setPreview(null);
    try {
      const params = new URLSearchParams({ preview: '1' });
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res = await fetch(`/api/productividad/sync?${params}`);
      if (!res.ok) throw new Error('No se pudo cargar el preview');
      setPreview(await res.json());
      setFase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en preview');
      setFase('error');
    }
  }, [desde, hasta]);

  useEffect(() => {
    if (isOpen) void cargarPreview();
  }, [isOpen, cargarPreview]);

  const ejecutar = useCallback(async () => {
    setFase('sync');
    setError(null);
    try {
      const res = await fetch('/api/productividad/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_desde: desde, fecha_hasta: hasta }),
      });
      const data = (await res.json().catch(() => null)) as { sync?: SyncResultado; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || 'Error en sync');
      setResultado(data?.sync || null);
      setFase('done');
      onCompletado?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en sync');
      setFase('error');
    }
  }, [desde, hasta, onCompletado]);

  const pendientes = preview?.doctores_sin_evento || [];
  const enModulo = preview?.doctores_en_modulo || [];
  const finalesPendientes = resultado?.doctores_sin_evento || [];
  const finalesModulo = resultado?.doctores_en_modulo || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 pr-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-[#E7E9EA]">Sync de honorarios</h2>
            <p className="text-sm text-gray-500">
              {desde && hasta ? `${desde} — ${hasta}` : 'Rango actual'}
            </p>
          </div>
        </div>

        {fase === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 px-4 py-3 text-sm text-sky-800 dark:text-sky-300">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            Cargando doctores pendientes y registrados…
          </div>
        )}

        {fase === 'sync' && (
          <div className="flex items-center gap-3 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-900 px-4 py-3 text-sm text-primary-800 dark:text-primary-300">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Generando honorarios de cada doctor… no cierres el modal.
          </div>
        )}

        {fase === 'error' && error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {(fase === 'ready' || fase === 'done') && preview && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">Pendientes</p>
              <p className="text-xl font-bold text-amber-900 dark:text-amber-200">{pendientes.length}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Ya en módulo</p>
              <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200">{enModulo.length}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-[#202327] border border-gray-200 dark:border-[#2F3336] p-3">
              <p className="text-xs text-gray-500">Doctores rango</p>
              <p className="text-xl font-bold text-gray-900 dark:text-[#E7E9EA]">{preview.doctores_total ?? 0}</p>
            </div>
          </div>
        )}

        {(fase === 'ready' || fase === 'done') && (
          <div className="space-y-3 max-h-[40vh] overflow-y-auto">
            {(fase === 'done' ? finalesPendientes : pendientes).length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Encontrados (pendientes) — {fase === 'done' ? finalesPendientes.length : pendientes.length}
                </p>
                <ul className="divide-y divide-gray-100 dark:divide-[#2F3336] rounded-lg border border-amber-200 dark:border-amber-900/50">
                  {(fase === 'done' ? finalesPendientes : pendientes).slice(0, 50).map((d, i) => (
                    <li key={i} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-[#E7E9EA]">{d.doctor_nombre}</span>
                      <span className="text-xs text-gray-500">{d.origen}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(fase === 'done' ? finalesModulo : enModulo).length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ya en el módulo — {fase === 'done' ? finalesModulo.length : enModulo.length}
                </p>
                <ul className="divide-y divide-gray-100 dark:divide-[#2F3336] rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                  {(fase === 'done' ? finalesModulo : enModulo).slice(0, 50).map((d, i) => (
                    <li key={i} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-[#E7E9EA]">{d.doctor_nombre}</span>
                      <span className="text-xs text-gray-500">
                        {d.origen}
                        {typeof d.eventos === 'number' ? ` · ${d.eventos} ev.` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {fase === 'ready' && pendientes.length === 0 && enModulo.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Sin consultas/cirugías en el rango.</p>
            )}
          </div>
        )}

        {fase === 'done' && resultado && (
          <div className="rounded-lg bg-gray-50 dark:bg-[#202327] border border-gray-200 dark:border-[#2F3336] p-3 text-sm grid grid-cols-2 gap-2">
            <span className="text-gray-500">Eventos creados</span>
            <span className="font-bold text-right text-emerald-600">{resultado.eventos_creados ?? 0}</span>
            <span className="text-gray-500">Eventos existentes</span>
            <span className="font-bold text-right">{resultado.eventos_existentes ?? 0}</span>
            <span className="text-gray-500">Consultas desplegadas</span>
            <span className="font-bold text-right text-sky-600">{resultado.consultas_desplegadas ?? 0}</span>
            <span className="text-gray-500">Cirugías desplegadas</span>
            <span className="font-bold text-right text-sky-600">{resultado.cirugias_desplegadas ?? 0}</span>
            <span className="text-gray-500">Duración</span>
            <span className="font-bold text-right">{((resultado.duracion_ms ?? 0) / 1000).toFixed(1)}s</span>
          </div>
        )}

        {fase === 'done' && resultado?.errores && resultado.errores.length > 0 && (
          <div className="text-xs text-rose-600 space-y-0.5 max-h-24 overflow-y-auto">
            {resultado.errores.map((e, i) => (
              <p key={i}>• {e}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
              type="button"
              onClick={() => void cargarPreview()}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-[#2F3336] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
            >
              Actualizar preview
            </button>
          <button
            type="button"
            onClick={
              fase === 'done'
                ? onClose
                : fase === 'error'
                  ? () => void cargarPreview()
                  : () => void ejecutar()
            }
            disabled={fase === 'sync' || fase === 'loading'}
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 ${
              fase === 'done'
                ? 'bg-gray-500 hover:bg-gray-600'
                : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {fase === 'loading' || fase === 'sync' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {fase === 'loading' ? 'Cargando…' : 'Sincronizando…'}
              </>
            ) : fase === 'done' ? (
              'Cerrar'
            ) : fase === 'error' ? (
              'Reintentar'
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Ejecutar Sync
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
