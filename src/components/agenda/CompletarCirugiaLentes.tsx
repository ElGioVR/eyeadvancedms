'use client';

import { useEffect, useState } from 'react';
import type { OrdenLente } from '@/lib/cirugia-lentes-puro';

interface LenteReservado {
  orden: OrdenLente;
  origen: 'INVENTARIO' | 'HOSPITAL';
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean;
}

const ETIQUETA_ORDEN: Record<OrdenLente, string> = {
  PRIMERO: 'Primero',
  SEGUNDO: 'Segundo',
  RESPALDO: 'Respaldo',
};

function descripcion(l: LenteReservado): string {
  const partes = [l.fabricante, l.modelo, l.poder_d != null ? `${l.poder_d} D` : null, l.torico ? 'tórico' : null]
    .filter(Boolean);
  const origen = l.origen === 'HOSPITAL' ? 'Lente del hospital' : 'Inventario';
  return partes.length ? `${partes.join(' · ')} (${origen})` : origen;
}

/**
 * Antes de completar una cirugía: indica qué lentes realmente se usaron.
 * Los usados de inventario descuentan stock; los no marcados liberan su reserva.
 */
export default function CompletarCirugiaLentes({
  cirugiaId,
  onConfirm,
  onCancel,
}: {
  cirugiaId: string;
  onConfirm: (requeridos: OrdenLente[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [lentes, setLentes] = useState<LenteReservado[] | null>(null);
  const [marcados, setMarcados] = useState<Set<OrdenLente>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/agenda/${cirugiaId}/lentes`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('lentes');
        return (await r.json()) as { lentes: LenteReservado[] };
      })
      .then((d) => {
        setLentes(d.lentes);
        // Por defecto, el primero reservado (igual que el comportamiento anterior).
        setMarcados(new Set(d.lentes.slice(0, 1).map((l) => l.orden)));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError('No se pudieron cargar los lentes reservados.');
      });
    return () => ctrl.abort();
  }, [cirugiaId]);

  const alternar = (orden: OrdenLente) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(orden)) next.delete(orden);
      else next.add(orden);
      return next;
    });
  };

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await onConfirm(ORDENES_ORDENADOS.filter((o) => marcados.has(o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la cirugía.');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="completar-lentes-titulo">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <h3 id="completar-lentes-titulo" className="text-base font-bold text-fg">Completar cirugía</h3>
        <p className="mt-1 text-sm text-fg-2">
          Marca los lentes que realmente se usaron. Los no marcados liberan su reserva.
        </p>

        {lentes === null && !error && (
          <p className="mt-4 text-sm text-fg-2">Cargando lentes…</p>
        )}

        {lentes !== null && lentes.length === 0 && (
          <p className="mt-4 text-sm text-fg-2">Esta cirugía no tiene lentes reservados.</p>
        )}

        {lentes !== null && lentes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {lentes.map((l) => (
              <li key={l.orden}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={marcados.has(l.orden)}
                    onChange={() => alternar(l.orden)}
                    disabled={enviando}
                  />
                  <span className="text-sm">
                    <span className="block font-semibold text-fg">{ETIQUETA_ORDEN[l.orden]}</span>
                    <span className="block text-fg-2">{descripcion(l)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={enviando}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg-2 hover:bg-surface-2 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={enviando || lentes === null}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {enviando ? 'Completando…' : 'Confirmar y completar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ORDENES_ORDENADOS: OrdenLente[] = ['PRIMERO', 'SEGUNDO', 'RESPALDO'];
