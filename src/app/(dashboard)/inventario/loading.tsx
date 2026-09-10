import Skeleton from '@/components/ui/Skeleton';

export default function InventarioLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-6 w-10" />
              </div>
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* Lente cards */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-5 w-48" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-6 gap-4 mb-4">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div className="flex gap-6">
                <div className="space-y-1"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-3 w-24" /></div>
                <div className="space-y-1"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-3 w-20" /></div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
