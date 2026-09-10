import Skeleton from '@/components/ui/Skeleton';

export default function DoctoresLoading() {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white">
            <div className="h-2 rounded-t-xl bg-gray-100" />
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="flex gap-2 border-t border-gray-100 pt-4">
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
