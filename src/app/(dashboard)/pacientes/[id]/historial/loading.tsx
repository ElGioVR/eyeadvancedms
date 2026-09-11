import Skeleton from '@/components/ui/Skeleton';

export default function HistorialLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Patient info card */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="flex items-center gap-6">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="hidden md:flex items-center gap-8">
            <div className="space-y-1 text-right">
              <Skeleton className="h-2.5 w-16 ml-auto" />
              <Skeleton className="h-3.5 w-24 ml-auto" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-2.5 w-28 ml-auto" />
              <Skeleton className="h-3.5 w-32 ml-auto" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-2.5 w-24 ml-auto" />
              <Skeleton className="h-3.5 w-16 ml-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-[#2F3336]">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-t-lg" />
        ))}
      </div>

      {/* Content + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="grid grid-cols-4 gap-4 px-6 py-4">
                <div className="space-y-1"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-3.5 w-28" /></div>
                <div className="space-y-1"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-3.5 w-36" /></div>
                <div className="space-y-1"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-3.5 w-32" /></div>
                <div className="space-y-1"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-3.5 w-20" /></div>
              </div>
            </div>
          ))}
        </div>
        <div className="w-full lg:w-[360px] space-y-5">
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full rounded-lg" />
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5 space-y-3">
            <Skeleton className="h-4 w-36" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5 space-y-3">
            <Skeleton className="h-4 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
