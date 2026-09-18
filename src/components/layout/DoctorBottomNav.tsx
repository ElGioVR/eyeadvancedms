'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Stethoscope, Calendar, TrendingUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { useState, useEffect } from 'react';

interface NavItem {
  icon: typeof LayoutDashboard;
  href: string;
  label: string;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, href: '/dashboard', label: 'Inicio' },
  { icon: Stethoscope, href: '/consultas', label: 'Consultas' },
  { icon: Calendar, href: '/agenda', label: 'Agenda' },
  { icon: TrendingUp, href: '/mis-honorarios', label: 'Honorarios' },
  { icon: User, href: '/mi-perfil', label: 'Perfil' },
];

export default function DoctorBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!isMobile || !user || user.rol !== 'doctor') return null;

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 lg:hidden">
      <div
        className="flex items-center gap-1 px-2 py-2 rounded-full
          bg-black/60 backdrop-blur-xl border border-white/10
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          supports-[backdrop-filter]:bg-black/50"
      >
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-full transition-all duration-300',
                isActive
                  ? 'w-14 h-14 bg-white/20 shadow-[0_0_16px_rgba(255,255,255,0.1)]'
                  : 'w-12 h-12 hover:bg-white/10'
              )}
              aria-label={item.label}
            >
              <Icon
                className={cn(
                  'transition-all duration-300',
                  isActive
                    ? 'w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                    : 'w-5 h-5 text-white/60'
                )}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              {isActive && (
                <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-white/80" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
