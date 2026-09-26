'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import DoctorBottomNav from '@/components/layout/DoctorBottomNav';
import OfflineAndInstall from '@/components/layout/OfflineAndInstall';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/ui/Toast';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ToastProvider>
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
            'lg:ml-[76px]',
            sidebarCollapsed ? 'xl:ml-[76px]' : 'xl:ml-[272px]'
          )}
        >
          <TopBar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
          <main className="flex-1 overflow-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>

        <DoctorBottomNav onMenuOpen={() => setMobileMenuOpen(true)} />
        <OfflineAndInstall />
      </div>
    </ToastProvider>
  );
}
