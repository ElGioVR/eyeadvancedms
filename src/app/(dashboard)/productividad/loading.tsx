export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 bg-gray-200 dark:bg-surface-2 rounded animate-pulse" />
      <div className="h-4 w-96 bg-surface-2 rounded animate-pulse" />
      <div className="h-24 bg-surface-2 rounded-xl animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-surface-2 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />
    </div>
  );
}
