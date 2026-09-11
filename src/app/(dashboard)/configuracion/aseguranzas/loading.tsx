import Skeleton from '@/components/ui/Skeleton';

export default function AseguranzasLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C]">
            <div className="h-1.5 rounded-t-xl bg-gray-100 dark:bg-[#202327]" />
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-6 w-6 rounded" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              </div>
              <div className="space-y-2 border-t border-gray-100 dark:border-[#2F3336] pt-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
