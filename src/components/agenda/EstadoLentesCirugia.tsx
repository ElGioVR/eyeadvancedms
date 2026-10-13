'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';

interface Lente {
  orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean;
  cilindro?: number | null;
  modo?: 'ASIGNAR' | 'SOLICITAR' | 'COMPRA_DIRECTA';
  inventario_item_id?: string | null;
  estado_logistica?: 'POR_SOLICITAR' | 'SOLICITADO' | 'POR_COMPRAR' | 'LISTO';
}

const NOMBRE = { PRIMERO: 'Primer lente', SEGUNDO: 'Segundo lente', RESPALDO: 'Respaldo' } as const;
const desc = (l: Lente) =>
  [l.fabricante, l.modelo, l.poder_d != null ? `${l.poder_d}D` : null, l.torico && l.cilindro != null ? `cil. ${l.cilindro}` : null].filter(Boolean).join(' ') || 'lente';

/**
 * Antes de iniciar la cirugía: estado logístico de cada lente. El de compra directa debe
 * confirmarse como listo; el solicitado avisa si aún no llega al inventario.
 */
export default function EstadoLentesCirugia({ cirugiaId, puedeConfirmar }: { cirugiaId: string; puedeConfirmar: boolean }) {
  const { data, mutate } = useSWR<{ lentes: Lente[] }>(`/api/agenda/${cirugiaId}/lentes`, { revalidateOnFocus: true });
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const lentes = (data?.lentes ?? []).filter((l) => l.modo && l.modo !== 'ASIGNAR');
  if (lentes.length === 0) return null;

  const confirmar = async (orden: Lente['orden']) => {
    setConfirmando(orden);
    try {
      await enviarJSON(`/api/agenda/${cirugiaId}/lentes`, 'PATCH', { accion: 'CONFIRMAR_LISTO', orden });
      await mutate();
      toast('Lente confirmado como listo para operar', 'success');
    } catch (e) {
      toast(mensajeDeError(e, 'No se pudo confirmar el lente'), 'error');
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <div className="space-y-2" aria-label="Lentes por confirmar">
      {lentes.map((l) => {
        if (l.modo === 'COMPRA_DIRECTA') {
          const listo = l.estado_logistica === 'LISTO';
          return (
            <div key={l.orden} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${listo ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'}`}>
              <span className="flex items-start gap-2">
                {listo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span><strong>{NOMBRE[l.orden]} · compra directa:</strong> {desc(l)}{listo ? ' — listo para operar.' : ' — confirma que ya está en quirófano antes de iniciar.'}</span>
              </span>
              {!listo && puedeConfirmar && (
                <button type="button" onClick={() => confirmar(l.orden)} disabled={confirmando !== null} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">
                  {confirmando === l.orden ? 'Confirmando…' : 'Confirmar listo'}
                </button>
              )}
            </div>
          );
        }
        const recibido = !!l.inventario_item_id;
        return (
          <div key={l.orden} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${recibido ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'}`}>
            {recibido ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              <strong>{NOMBRE[l.orden]} · solicitado:</strong> {desc(l)} —{' '}
              {recibido ? 'recibido y listo para la cirugía.' : l.estado_logistica === 'SOLICITADO' ? 'ya solicitado, pendiente de llegar al inventario.' : 'en el plan de resurtimiento, por solicitar.'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
