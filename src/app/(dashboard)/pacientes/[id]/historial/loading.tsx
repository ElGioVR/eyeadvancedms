export default function HistorialLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-10 w-24 rounded-lg bg-gray-200" />
        <div>
          <div className="h-7 w-80 rounded-lg bg-gray-200" />
          <div className="mt-1 h-4 w-64 rounded bg-gray-100" />
        </div>
      </div>
      <div className="h-24 rounded-xl border border-gray-200 bg-white" />
      <div className="h-12 rounded-lg bg-gray-100" />
      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
        <div className="w-[360px] space-y-5">
          <div className="h-32 rounded-xl border border-gray-200 bg-white" />
          <div className="h-24 rounded-xl border border-gray-200 bg-white" />
          <div className="h-28 rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
