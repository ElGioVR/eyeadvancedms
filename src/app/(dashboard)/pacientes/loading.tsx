export default function PacientesLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-40 rounded-lg bg-gray-200" />
      </div>
      <div className="flex gap-3">
        <div className="h-10 flex-1 rounded-lg bg-gray-100" />
        <div className="h-10 w-32 rounded-lg bg-gray-100" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
