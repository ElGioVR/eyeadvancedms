import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-5xl font-extrabold text-primary-600">404</p>
        <h1 className="text-lg font-extrabold text-fg">No encontramos esta página</h1>
        <p className="text-sm text-muted">Puede que el enlace esté mal escrito o que el registro ya no exista.</p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
