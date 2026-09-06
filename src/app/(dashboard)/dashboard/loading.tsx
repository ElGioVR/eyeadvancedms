export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-end justify-between">
        <div>
          <div className="h-8 w-64 rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-100" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-7 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
