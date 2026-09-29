'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useInvalidar } from '@/hooks';
import ProgresoSync from './ProgresoSync';
import {
  ejecutarSync,
  urlPreviewSync,
  useSegundosTranscurridos,
  type SyncPreview,
  type SyncResultado,
} from './sync';

type Fase = 'loading' | 'ready' | 'sync' | 'done' | 'error';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  desde: string;
  hasta: string;
  onCompletado?: () => void;
}

export default function SyncModal({ isOpen, onClose, desde, hasta, onCompletado }: SyncModalProps) {
  const invalidar = useInvalidar();
  const {
    data: preview,
    error: errorPreview,
    isValidating: validandoPreview,
    mutate: recargarPreview,
  } = useSWR<SyncPreview>(isOpen ? urlPreviewSync(desde, hasta) : null);
  const [resultado, setResultado] = useState<SyncResultado | null>(null);
  const [errorSync, setErrorSync] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const enCursoRef = useRef(false);
  const segundos = useSegundosTranscurridos(sincronizando);

  // Cada apertura empieza limpia (el preview sale de caché y se revalida).
  useEffect(() => {
    if (isOpen && !enCursoRef.current) {
      setResultado(null);
      setErrorSync(null);
    }
  }, [isOpen]);

  const fase: Fase = sincronizando
    ? 'sync'
    : resultado
      ? 'done'
      : errorSync || (errorPreview && !preview)
        ? 'error'
        : !preview
          ? 'loading'
          : 'ready';
  const error =
    errorSync ||
    (errorPreview ? (errorPreview instanceof Error ? errorPreview.message : 'Error en preview') : null);

  const cargarPreview = useCallback(() => {
    setErrorSync(null);
    setResultado(null);
    void recargarPreview();
  }, [recargarPreview]);

  const ejecutar = useCallback(async () => {
    if (enCursoRef.current) return; // evita doble envío
    enCursoRef.current = true;
    setSincronizando(true);
    setErrorSync(null);
    try {
      const r = await ejecutarSync({ fecha_desde: desde, fecha_hasta: hasta });
      setResultado(r);
      void invalidar('/api/productividad');
      onCompletado?.();
    } catch (err) {
      setErrorSync(err instanceof Error ? err.message : 'Error en sync');
    } finally {
      enCursoRef.current = false;
      setSincronizando(false);
    }
  }, [desde, hasta, onCompletado, invalidar]);

  // Mientras corre el sync no se permite cerrar (evita perder el resultado).
  const cerrar = useCallback(() => {
    if (!enCursoRef.current) onClose();
  }, [onClose]);

  const pendientes = preview?.doctores_sin_evento || [];
  const enModulo = preview?.doctores_en_modulo || [];
  const finalesPendientes = resultado?.doctores_sin_evento || [];
  const finalesModulo = resultado?.doctores_en_modulo || [];

  return (
    <Modal isOpen={isOpen} onClose={cerrar} maxWidth="max-w-2xl">
      <div className="relative space-y-4" aria-busy={fase === 'loading' || fase === 'sync'}>
        <BarraRevalidando activo={validandoPreview && !!preview && fase === 'ready'} />
        <div className="flex items-start justify-between gap-4 pr-6">
          <div>
            <h2 className="text-lg font-bold text-fg">Sync de honorarios</h2>
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

        {fase === 'sync' && <ProgresoSync segundos={segundos} />}

        {fase === 'error' && error && (
          <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 animate-fadeIn">
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
            <div className="rounded-lg bg-surface-2 border border-line p-3">
              <p className="text-xs text-gray-500">Doctores rango</p>
              <p className="text-xl font-bold text-fg">{preview.doctores_total ?? 0}</p>
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
                <ul className="divide-y divide-line/70 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  {(fase === 'done' ? finalesPendientes : pendientes).slice(0, 50).map((d) => (
                    <li key={`${d.doctor_id}-${d.origen}-${d.ref}`} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-fg">{d.doctor_nombre}</span>
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
                <ul className="divide-y divide-line/70 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                  {(fase === 'done' ? finalesModulo : enModulo).slice(0, 50).map((d) => (
                    <li key={`${d.doctor_id}-${d.origen}-${d.ref}`} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-fg">{d.doctor_nombre}</span>
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
          <div className="rounded-lg bg-surface-2 border border-line p-3 text-sm grid grid-cols-2 gap-2">
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
            onClick={cargarPreview}
            disabled={fase === 'sync'}
            className="px-4 py-2 text-sm font-medium border border-line rounded-lg transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            Actualizar preview
          </button>
          <button
            type="button"
            onClick={
              fase === 'done'
                ? cerrar
                : fase === 'error'
                  ? cargarPreview
                  : () => void ejecutar()
            }
            disabled={fase === 'sync' || fase === 'loading'}
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 ${
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
