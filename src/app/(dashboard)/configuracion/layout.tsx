'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Perfil', href: '/configuracion' },
  { label: 'Usuarios', href: '/configuracion/usuarios' },
  { label: 'Doctores', href: '/configuracion/doctores' },
  { label: 'Aseguranzas', href: '/configuracion/aseguranzas' },
  { label: 'Categorías Lentes', href: '/configuracion/categorias-lentes' },
  { label: 'Proveedores', href: '/configuracion/proveedores' },
  { label: 'Sistema', href: '/configuracion/sistema' },
];

function getActiveTab(pathname: string) {
  if (pathname === '/configuracion') return 'Perfil';
  const match = tabs.find((t) => t.href !== '/configuracion' && pathname.startsWith(t.href));
  return match?.label || 'Perfil';
}

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">CONFIGURACIÓN</h1>
        <p className="mt-1 text-sm text-gray-400">
          Administra los accesos del personal, médicos vinculados e integraciones.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto px-2 sm:px-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
