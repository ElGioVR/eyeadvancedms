'use client';

import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import { CirugiaForm } from '@/components/agenda/CirugiaFormAgenda';
import EditarLentesCirugia from '@/components/agenda/EditarLentesCirugia';

export default function EditarCirugiaClient({
  cirugiaId,
  userRol,
  doctores,
}: {
  cirugiaId: string;
  userRol: string;
  doctores: Parameters<typeof CirugiaForm>[0]['doctores'];
}) {
  const router = useRouter();
  const volver = () => router.push(`/cirugias/${cirugiaId}`);
  return (
    <div className="w-full bg-transparent pb-20">
      <PageHeader
        title="Editar cirugía"
        subtitle="Modifica los datos de la cirugía agendada"
        backLink={{ href: `/cirugias/${cirugiaId}`, label: 'Detalle' }}
      />
      <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <CirugiaForm
          cirugiaId={cirugiaId}
          doctores={doctores}
          userRol={userRol}
          initialDate={null}
          initialHour=""
          onClose={volver}
          onSaved={volver}
        />
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-fg">Lentes</h2>
        <EditarLentesCirugia cirugiaId={cirugiaId} />
      </div>
      </div>
    </div>
  );
}
