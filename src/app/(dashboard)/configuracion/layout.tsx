'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Perfil', href: '/configuracion' },
  { label: 'Usuarios', href: '/configuracion/usuarios' },
  { label: 'Personal médico', href: '/configuracion/doctores' },
  { label: 'Aseguranzas', href: '/configuracion/aseguranzas' },
  { label: 'Marcas', href: '/configuracion/marcas' },
  { label: 'Sistema', href: '/configuracion/sistema' },
];

/** Enfermería: solo Perfil y Sistema. */
const TABS_ENFERMERIA = new Set(['/configuracion', '/configuracion/sistema']);

function getActiveTab(pathname: string) {
  if (pathname === '/configuracion') return 'Perfil';
  const match = tabs.find((t) => t.href !== '/configuracion' && pathname.startsWith(t.href));
  return match?.label || 'Perfil';
}

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const esEnfermero = user?.rol === 'enfermero';
  const activeTab = getActiveTab(pathname);
  const tabsVisibles = esEnfermero ? tabs.filter((t) => TABS_ENFERMERIA.has(t.href)) : tabs;
  const rutaPermitida = !esEnfermero || TABS_ENFERMERIA.has(pathname);

  useEffect(() => {
    if (!rutaPermitida) router.replace('/configuracion');
  }, [rutaPermitida, router]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">CONFIGURACIÓN</h1>
        <p className="mt-1 text-sm text-gray-400">
          Administra los accesos del personal, médicos vinculados e integraciones.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-line">
        <nav className="flex gap-1 -mb-px overflow-x-auto px-2 sm:px-0">
          {tabsVisibles.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
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

      {/* Fundido suave al cambiar de pestaña (solo opacidad: sin transform persistente). */}
      <div key={pathname} className="animate-fadeIn">
        {rutaPermitida ? children : null}
      </div>
    </div>
  );
}
