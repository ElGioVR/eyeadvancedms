'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, User, Stethoscope, Eye, FileText, AlertTriangle, CheckCircle2, Printer } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import StatusBadge from '@/components/ui/StatusBadge';

interface CirugiaDetalle {
  id: string;
  nombre_paciente: string;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  jornada: string | null;
  diagnostico: string | null;
  procedimiento: string | null;
  ojo: string | null;
  lio: string | null;
  marca_lio: string | null;
  tiempo_estimado: string | null;
  tiempo_estancia: string | null;
  doctor_id: string | null;
  doctor_nombre: string | null;
  estado: string;
  procedencia: string | null;
  notas: string | null;
}

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  aplazada: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  reagendada: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelada: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{value || '—'}</p>
    </div>
  );
}

export default function CirugiaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cirugia, setCirugia] = useState<CirugiaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCirugia = useCallback(async () => {
    try {
      const res = await fetch(`/api/agenda?pageSize=999`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      const found = data.data?.find((c: CirugiaDetalle) => c.id === id);
      if (!found) throw new Error('Cirugía no encontrada');
      setCirugia(found);
      // B11: integrar con el detalle homologado de cirugía
      router.push(`/cirugias/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchCirugia(); }, [fetchCirugia]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  if (error || !cirugia) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Cirugía no encontrada'}</p>
        <button onClick={() => router.push('/agenda')} className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold">Volver a Agenda</button>
      </div>
    );
  }

  return (
    <div className="print-page">
      <PageHeader
        title={cirugia.procedimiento || 'Cirugía'}
        subtitle={`${cirugia.nombre_paciente} — ${cirugia.fecha || 'Sin fecha'}`}
        backLink={{ href: '/agenda', label: 'Agenda' }}
        action={
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors no-print">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
        }
      />

      <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6 mb-6 flex items-center gap-4">
        <Avatar initials={cirugia.nombre_paciente.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()} className="bg-primary-500" size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h2>
          <p className="text-sm text-gray-500 dark:text-[#71767B]">
            {cirugia.doctor_nombre || 'Sin doctor'} {cirugia.fecha ? `— ${cirugia.fecha} ${cirugia.hora || ''}` : ''}
          </p>
        </div>
        <StatusBadge status={cirugia.estado} config={estadoConfig} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <FileText className="h-4 w-4 text-primary-600" /> Datos de la Cirugía
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Paciente" value={cirugia.nombre_paciente} />
              <Field label="Expediente" value={cirugia.expediente} />
              <Field label="Fecha" value={cirugia.fecha} />
              <Field label="Hora" value={cirugia.hora} />
              <Field label="Jornada" value={cirugia.jornada} />
              <Field label="Doctor" value={cirugia.doctor_nombre} />
              <Field label="Procedencia" value={cirugia.procedencia} />
              <Field label="Diagnóstico" value={cirugia.diagnostico} full />
            </div>
          </div>

          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <Stethoscope className="h-4 w-4 text-sky-600" /> Procedimiento
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Procedimiento" value={cirugia.procedimiento} />
              <Field label="Ojo" value={cirugia.ojo} />
              <Field label="LIO" value={cirugia.lio} />
              <Field label="Marca LIO" value={cirugia.marca_lio} />
              <Field label="Tiempo Estimado" value={cirugia.tiempo_estimado} />
              <Field label="Tiempo de Estancia" value={cirugia.tiempo_estancia} />
              <Field label="Notas" value={cirugia.notas} full />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Estado
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Estado actual</span>
                <StatusBadge status={cirugia.estado} config={estadoConfig} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Ojo</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{cirugia.ojo || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">LIO</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{cirugia.lio || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
