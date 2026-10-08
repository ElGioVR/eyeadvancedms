'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { ORDENES_LENTE, type OrdenLente } from '@/lib/cirugia-lentes-puro';

type LenteGuardado = {
  orden: OrdenLente;
  origen: 'INVENTARIO' | 'HOSPITAL';
  inventario_item_id: string | null;
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean | null;
};

type Borrador = {
  activo: boolean;
  origen: 'INVENTARIO' | 'HOSPITAL';
  inventarioItemId: string | null;
  fabricante: string;
  modelo: string;
  poder: string;
  torico: boolean;
};

const ETIQUETA: Record<OrdenLente, string> = {
  PRIMERO: 'Primero',
  SEGUNDO: 'Segundo',
  RESPALDO: 'Respaldo',
};

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500';

function borradorDesde(guardado: LenteGuardado | undefined, primero: boolean): Borrador {
  return {
    activo: !!guardado || primero,
    origen: guardado?.origen ?? 'INVENTARIO',
    inventarioItemId: guardado?.inventario_item_id ?? null,
    fabricante: guardado?.fabricante ?? '',
    modelo: guardado?.modelo ?? '',
    poder: guardado?.poder_d != null ? String(guardado.poder_d) : '',
    torico: guardado?.torico ?? false,
  };
}

/**
 * Edición de lentes de una cirugía pendiente (comentarios C3/C4): primero,
 * segundo y respaldo, cada uno de inventario o del hospital.
 */
export default function EditarLentesCirugia({ cirugiaId }: { cirugiaId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ lentes: LenteGuardado[] }>(
    `/api/agenda/${cirugiaId}/lentes`,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudieron cargar los lentes');
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  const guardados = useMemo(() => data?.lentes ?? [], [data]);
  const [borradores, setBorradores] = useState<Record<OrdenLente, Borrador>>({
    PRIMERO: borradorDesde(undefined, true),
    SEGUNDO: borradorDesde(undefined, false),
    RESPALDO: borradorDesde(undefined, false),
  });
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBorradores({
      PRIMERO: borradorDesde(guardados.find((l) => l.orden === 'PRIMERO'), true),
      SEGUNDO: borradorDesde(guardados.find((l) => l.orden === 'SEGUNDO'), false),
      RESPALDO: borradorDesde(guardados.find((l) => l.orden === 'RESPALDO'), false),
    });
  }, [data, guardados]);

  const cambiar = (orden: OrdenLente, parcial: Partial<Borrador>) =>
    setBorradores((prev) => ({ ...prev, [orden]: { ...prev[orden], ...parcial } }));

  const guardar = async () => {
    setMensaje(null);
    const lentes: unknown[] = [];
    const quitar: OrdenLente[] = [];
    for (const orden of ORDENES_LENTE) {
      const b = borradores[orden];
      if (!b.activo) {
        if (guardados.some((l) => l.orden === orden)) quitar.push(orden);
        continue;
      }
      if (b.origen === 'INVENTARIO') {
        if (!b.inventarioItemId) {
          setMensaje({ tipo: 'error', texto: `${ETIQUETA[orden]}: elige la pieza de inventario` });
          return;
        }
        lentes.push({ orden, origen: 'INVENTARIO', inventario_item_id: b.inventarioItemId });
      } else {
        const poder = Number(b.poder.replace(',', '.'));
        if (!b.fabricante.trim() || !b.poder.trim() || Number.isNaN(poder)) {
          setMensaje({ tipo: 'error', texto: `${ETIQUETA[orden]}: indica marca y poder del lente del hospital` });
          return;
        }
        lentes.push({ orden, origen: 'HOSPITAL', fabricante: b.fabricante.trim(), modelo: b.modelo.trim() || null, poder_d: poder, torico: b.torico });
      }
    }

    setGuardando(true);
    try {
      const res = await fetch(`/api/agenda/${cirugiaId}/lentes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lentes, quitar }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: cuerpo.error || 'No se pudieron guardar los lentes' });
      } else {
        setMensaje({ tipo: 'ok', texto: 'Lentes guardados' });
        await mutate();
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Sin conexión: no se guardaron los lentes' });
    } finally {
      setGuardando(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted py-2">Cargando lentes…</p>;
  if (error) return <p className="text-sm text-red-600 py-2">No se pudieron cargar los lentes</p>;

  return (
    <div className="space-y-4">
      {ORDENES_LENTE.map((orden) => {
        const b = borradores[orden];
        const esPrimero = orden === 'PRIMERO';
        return (
          <div key={orden} className="rounded-xl border border-line p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-extrabold uppercase tracking-widest text-fg">{ETIQUETA[orden]}</span>
              {!esPrimero && (
                <button
                  type="button"
                  onClick={() => cambiar(orden, { activo: !b.activo })}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  {b.activo ? 'Quitar' : '+ Agregar'}
                </button>
              )}
            </div>
            {b.activo && (
              <>
                <div className="flex gap-2" role="radiogroup" aria-label={`Origen del lente ${ETIQUETA[orden]}`}>
                  {(['INVENTARIO', 'HOSPITAL'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={b.origen === o}
                      onClick={() => cambiar(orden, { origen: o })}
                      className={
                        b.origen === o
                          ? 'rounded-lg border border-primary-500 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                          : 'rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2'
                      }
                    >
                      {o === 'INVENTARIO' ? 'De inventario' : 'Del hospital'}
                    </button>
                  ))}
                </div>
                {b.origen === 'INVENTARIO' ? (
                  <LIOSelector value={b.inventarioItemId} onChange={(v) => cambiar(orden, { inventarioItemId: v })} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      value={b.fabricante}
                      onChange={(e) => cambiar(orden, { fabricante: e.target.value })}
                      placeholder="Marca"
                      className={inputCls}
                      aria-label={`Marca del lente ${ETIQUETA[orden]}`}
                    />
                    <input
                      value={b.modelo}
                      onChange={(e) => cambiar(orden, { modelo: e.target.value })}
                      placeholder="Modelo"
                      className={inputCls}
                      aria-label={`Modelo del lente ${ETIQUETA[orden]}`}
                    />
                    <input
                      value={b.poder}
                      onChange={(e) => cambiar(orden, { poder: e.target.value })}
                      placeholder="Poder D (ej. 21.5)"
                      inputMode="decimal"
                      className={inputCls}
                      aria-label={`Poder del lente ${ETIQUETA[orden]}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {mensaje && (
        <p role="status" className={mensaje.tipo === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
          {mensaje.texto}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar lentes'}
        </button>
      </div>
    </div>
  );
}
