'use client';

import { estadoCerrado } from '@/lib/permisos-edicion';
import { faltantesCirugia, ETIQUETA_FALTANTE, ETIQUETA_INFO, type CirugiaParaCompletar } from '@/lib/por-completar';
import Link from 'next/link';
import useSWR from 'swr';
import PageHeader from '@/components/ui/PageHeader';
import { fetchJSON } from '@/lib/fetcher';
import { AlertTriangle, ChevronRight } from 'lucide-react';

type CirugiaPendiente = CirugiaParaCompletar & {
  id: string;
  codigo?: string | null;
  nombre_paciente?: string | null;
};

// Fecha YYYY-MM-DD → DD/MM/YYYY sin usar Date (evita diferencias de zona horaria).
function fechaCorta(fecha?: string | null) {
  if (!fecha) return 'Sin fecha';
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

const obtenerPendientes = (url: string) => fetchJSON<{ data: CirugiaPendiente[] }>(url);

export default function CirugiasPendientesPage() {
  const { data, error, isLoading } = useSWR<{ data: CirugiaPendiente[] }>('/api/cirugias?pendientes=1', obtenerPendientes);
  const lista = (data?.data ?? [])
    .filter((c) => !estadoCerrado(c.estado))
    .map((c) => ({ c, ...faltantesCirugia(c) }))
    .filter((x) => x.faltan.length > 0 || x.info.length > 0)
    .sort((a, b) => (a.c.fecha || '').localeCompare(b.c.fecha || ''));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cirugías por completar"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} cirugía${lista.length === 1 ? '' : 's'} con datos faltantes`}
        backLink={{ href: '/agenda', label: 'Agenda' }}
      />

      <p className="text-sm text-muted">
        Son cirugías importadas sin hora, ojo, procedimiento o anestesia. No se dibujan bien en la agenda hasta completarlas. Entra a cada una y pulsa <strong>Completar datos</strong>.
      </p>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          No se pudo cargar la lista. Intenta de nuevo.
        </div>
      )}

      {!isLoading && !error && lista.length === 0 && (
        <div className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-muted">
          No hay cirugías pendientes de completar.
        </div>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {lista.map(({ c, faltan, info, detalleLente }) => (
          <li key={c.id}>
            <Link href={`/cirugias/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{c.nombre_paciente || 'Paciente sin nombre'}</p>
                <p className="text-xs text-muted">
                  {String(c.estado ?? '').toLowerCase() === 'aplazada' ? 'Por programar' : `${fechaCorta(c.fecha)} · ${c.hora && c.hora.slice(0, 5) !== '00:00' ? c.hora.slice(0, 5) : 'Sin hora'}`}{c.ojo ? ` · ${c.ojo}` : ''}
                  {c.codigo ? ` · ${c.codigo}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {faltan.map((k) => (
                    <span key={k} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                      Falta: {ETIQUETA_FALTANTE[k] ?? k}{k === 'lente' && detalleLente[0] ? ` — ${detalleLente[0]}` : ''}
                    </span>
                  ))}
                  {info.map((k) => (
                    <span key={k} className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">{ETIQUETA_INFO[k] ?? k}</span>
                  ))}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
