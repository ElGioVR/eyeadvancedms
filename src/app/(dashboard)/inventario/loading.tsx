export default function InventarioLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-56 rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-100" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-52 rounded-lg bg-gray-200" />
          <div className="h-10 w-36 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="h-20 rounded-xl border border-gray-200 bg-white" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
