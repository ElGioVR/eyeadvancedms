import Skeleton from '@/components/ui/Skeleton';

export default function UsuariosLoading() {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-12 gap-4 border-b border-gray-100 px-6 py-3">
          <Skeleton className="col-span-4 h-3 w-24" />
          <Skeleton className="col-span-2 h-3 w-16" />
          <Skeleton className="col-span-2 h-3 w-16" />
          <Skeleton className="col-span-2 h-3 w-20" />
          <Skeleton className="col-span-2 h-3 w-16" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid grid-cols-12 gap-4 items-center border-b border-gray-50 px-6 py-4">
            <div className="col-span-4 flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
            <Skeleton className="col-span-2 h-5 w-20 rounded-full" />
            <Skeleton className="col-span-2 h-5 w-16 rounded-full" />
            <Skeleton className="col-span-2 h-3 w-20" />
            <Skeleton className="col-span-2 h-6 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
