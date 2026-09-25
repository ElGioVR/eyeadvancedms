import Skeleton from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-4" aria-busy="true">
      {/* Banner / saludo */}
      <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 min-w-0">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-44 sm:w-56" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
        </div>
      </div>

      {/* StatCards */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Citas de Hoy + Inventario Bajo */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 dark:border-[#2F3336] p-3">
                <Skeleton className="h-3 w-12 shrink-0" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="ml-auto h-3 w-24 hidden md:block" />
                <Skeleton className="h-5 w-16 rounded-full hidden md:block" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
          <Skeleton className="mb-4 h-4 w-36" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-[#2F3336] p-3">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-5 w-10 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
            <Skeleton className="mb-4 h-4 w-40" />
            <Skeleton className="h-[160px] w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
