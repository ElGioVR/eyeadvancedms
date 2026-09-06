export default function NuevaConsultaLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
        </div>
      </div>
      <div className="h-24 rounded-xl border border-gray-200 bg-white" />
      <div className="flex gap-6">
        <div className="flex-1 space-y-5">
          <div className="h-80 rounded-xl border border-gray-200 bg-white" />
          <div className="h-48 rounded-xl border border-gray-200 bg-white" />
        </div>
        <div className="w-[300px] space-y-5">
          <div className="h-48 rounded-xl border border-gray-200 bg-white" />
          <div className="h-32 rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
