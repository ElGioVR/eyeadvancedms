export default function ConfigSubLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-10 flex-1 rounded-lg bg-gray-100" />
        <div className="h-10 w-40 rounded-lg bg-gray-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-52 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
