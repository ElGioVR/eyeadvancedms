'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
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
      <div className="min-h-screen flex bg-[#f5f7f9]">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />

        <div
          className={cn(
            'flex-1 flex flex-col min-w-0 transition-[margin] duration-300',
            'lg:ml-[72px]',
            sidebarCollapsed ? 'xl:ml-[72px]' : 'xl:ml-[260px]'
          )}
        >
          <TopBar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
          <main className="flex-1 overflow-auto px-4 sm:px-6 py-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
