import Skeleton from '@/components/ui/Skeleton';

export default function ConsultasLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C]">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 border-b border-gray-100 dark:border-[#2F3336] px-6 py-3">
          <Skeleton className="col-span-2 h-3 w-12" />
          <Skeleton className="col-span-2 h-3 w-20" />
          <Skeleton className="col-span-2 h-3 w-16" />
          <Skeleton className="col-span-2 h-3 w-24" />
          <Skeleton className="col-span-2 h-3 w-16" />
          <Skeleton className="col-span-2 h-3 w-12" />
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid grid-cols-12 gap-4 items-center border-b border-gray-50 dark:border-[#2F3336] px-6 py-4">
            <Skeleton className="col-span-2 h-3 w-16" />
            <Skeleton className="col-span-2 h-3 w-28" />
            <Skeleton className="col-span-2 h-3 w-24" />
            <Skeleton className="col-span-2 h-3 w-32" />
            <Skeleton className="col-span-2 h-5 w-16 rounded-full" />
            <Skeleton className="col-span-2 h-6 w-6 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
