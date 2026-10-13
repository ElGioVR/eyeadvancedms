'use client';

import { RutaNavegacionProvider } from '@/components/layout/RutaNavegacion';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import DoctorBottomNav from '@/components/layout/DoctorBottomNav';
import OfflineAndInstall from '@/components/layout/OfflineAndInstall';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/ui/Toast';
import PestanaUnica from '@/components/providers/PestanaUnica';
import TiempoReal from '@/components/providers/TiempoReal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ToastProvider>
      <PestanaUnica>
        <RutaNavegacionProvider>
        <div className="min-h-screen flex bg-canvas">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
          />

          <div
            className={cn(
              'flex-1 flex flex-col min-w-0 transition-[margin] duration-300',
              'lg:ml-[76px] print:!ml-0',
              sidebarCollapsed ? 'xl:ml-[76px]' : 'xl:ml-[272px]'
            )}
          >
            <TopBar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
            <main className="flex-1 overflow-auto print:!overflow-visible print:!p-0 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-5 lg:px-6 lg:pb-6 lg:pt-5 2xl:px-8">
              {/* Entrada suave al cambiar de módulo (solo opacidad: sin transform, no rompe elementos fixed) */}
              <div key={pathname} className="animate-fadeIn">
                {children}
              </div>
            </main>
          </div>

          <DoctorBottomNav onMenuOpen={() => setMobileMenuOpen(true)} />
          <OfflineAndInstall />
          <TiempoReal />
        </div>
        </RutaNavegacionProvider>
      </PestanaUnica>
    </ToastProvider>
  );
}
