import Skeleton from '@/components/ui/Skeleton';

export default function ConfiguracionLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-[#2F3336]">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-t-lg" />
        ))}
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-5">
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6">
            <div className="flex items-center gap-4 mb-6">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              <div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              <div className="space-y-1.5"><Skeleton className="h-3 w-12" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6">
            <Skeleton className="mb-4 h-4 w-36" />
            <div className="space-y-4">
              <div className="space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-full rounded-lg" /></div>
              <div className="space-y-1.5"><Skeleton className="h-3 w-36" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            </div>
          </div>
        </div>
        <div className="w-full lg:w-[320px]">
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5 space-y-4">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-3">
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-20" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-16" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-24" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
