'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { History } from 'lucide-react';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';

type OtraCirugia = {
  id: string;
  codigo: string | null;
  fecha: string;
  hora: string | null;
  estado: string;
  ojo: string | null;
  servicio: { nombre: string } | null;
  consulta_id: string | null;
};

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  REAGENDADA: 'Reagendada',
};

/** 2026-10-08 → 08/10/2026 (sin Date: no cambia entre servidor y navegador). */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/**
 * Otras cirugías del mismo paciente (comentario C1): al abrir una cirugía se
 * ve la anterior o las siguientes, sin tener que buscarlas en la agenda.
 */
export default function OtrasCirugiasPaciente({
  pacienteId,
  cirugiaActualId,
}: {
  pacienteId: string | null;
  cirugiaActualId: string;
}) {
  const { data, isLoading } = useSWR<{ data: OtraCirugia[] }>(
    pacienteId ? `/api/cirugias?paciente_id=${encodeURIComponent(pacienteId)}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo cargar el historial quirúrgico');
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  if (!pacienteId) return null;
  const otras = (data?.data ?? []).filter((c) => c.id !== cirugiaActualId);

  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
        <History className="h-4 w-4 text-violet-600" /> Historial quirúrgico del paciente
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted text-center py-4">Cargando…</p>
      ) : otras.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">No hay otras cirugías de este paciente</p>
      ) : (
        <ul className="divide-y divide-line">
          {otras.map((c) => (
            <li key={c.id} className="py-3">
              <Link href={`/cirugias/${c.id}`} className="group flex flex-col gap-0.5">
                <span className="text-sm font-bold text-fg group-hover:text-primary-600">
                  {fechaCorta(c.fecha)}
                  {c.hora ? ` · ${c.hora.slice(0, 5)}` : ''}
                  {c.ojo ? ` · ${etiquetaOjo(c.ojo)}` : ''}
                </span>
                <span className="text-xs text-fg-2">
                  {c.servicio?.nombre || 'Procedimiento no indicado'} · {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
