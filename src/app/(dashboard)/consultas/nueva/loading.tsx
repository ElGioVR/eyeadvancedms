import Skeleton from '@/components/ui/Skeleton';

export default function NuevaConsultaLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Patient selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Skeleton className="mb-3 h-3 w-20" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          {/* Datos de Consulta */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-10 w-full rounded-lg" /></div>
                <div className="space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-10 w-full rounded-lg" /></div>
                <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-full rounded-lg" /></div>
                <div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              </div>
              <div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            </div>
          </div>

          {/* Estudios */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <Skeleton className="mb-4 h-3 w-20" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="ml-auto h-5 w-5 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[320px] space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <Skeleton className="mb-4 h-4 w-24" />
            <div className="space-y-3">
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-24" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-28" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-20" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-16" /></div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
