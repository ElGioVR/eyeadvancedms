export default function ReportesLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-72 rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-96 rounded bg-gray-100" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-36 rounded-lg bg-gray-200" />
          <div className="h-10 w-36 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="h-12 rounded-lg bg-gray-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white p-5" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-xl border border-gray-200 bg-white" />
        <div className="h-80 rounded-xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
