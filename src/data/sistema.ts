import { Database, Server, Shield, HardDrive } from 'lucide-react';
import type { SystemStat, RecentLog, BackupEntry } from '@/types';

export const systemStats: SystemStat[] = [
  { label: 'Base de Datos', value: 'Conectada', icon: Database, color: 'text-emerald-500', bgColor: 'bg-emerald-50', status: 'ok' },
  { label: 'Servidor', value: 'Operativo', icon: Server, color: 'text-emerald-500', bgColor: 'bg-emerald-50', status: 'ok' },
  { label: 'Último Respaldo', value: 'Hoy, 03:00 AM', icon: HardDrive, color: 'text-primary-500', bgColor: 'bg-primary-50', status: 'ok' },
  { label: 'Autenticación', value: 'Supabase Auth', icon: Shield, color: 'text-sky-500', bgColor: 'bg-sky-50', status: 'ok' },
];

export const recentLogs: RecentLog[] = [
  { timestamp: '04 Sep 2026, 10:15 AM', user: 'Dra. Irina', accion: 'Inicio de sesión', tipo: 'auth' },
  { timestamp: '04 Sep 2026, 10:12 AM', user: 'Sofía González', accion: 'Inicio de sesión', tipo: 'auth' },
  { timestamp: '04 Sep 2026, 09:45 AM', user: 'Admin Carlos', accion: 'Creó usuario: Mateo Rodríguez', tipo: 'user' },
  { timestamp: '04 Sep 2026, 09:30 AM', user: 'Dra. Irina', accion: 'Consulta #1245 registrada', tipo: 'consulta' },
  { timestamp: '04 Sep 2026, 09:00 AM', user: 'Sistema', accion: 'Respaldo automático completado', tipo: 'system' },
  { timestamp: '03 Sep 2026, 04:30 PM', user: 'Dr. Héctor', accion: 'Consulta #1244 registrada', tipo: 'consulta' },
  { timestamp: '03 Sep 2026, 03:15 PM', user: 'Admin Carlos', accion: 'Actualizó inventario: Lente Progresivo', tipo: 'inventory' },
  { timestamp: '03 Sep 2026, 02:00 PM', user: 'Dra. Martha', accion: 'Consulta #1243 registrada', tipo: 'consulta' },
];

export const tipoColors: Record<string, string> = {
  auth: 'bg-sky-50 text-sky-700',
  user: 'bg-purple-50 text-purple-700',
  consulta: 'bg-primary-50 text-primary-700',
  system: 'bg-emerald-50 text-emerald-700',
  inventory: 'bg-amber-50 text-amber-700',
};

export const backupHistory: BackupEntry[] = [
  { fecha: '04 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.4 MB', estado: 'Completado' },
  { fecha: '03 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.3 MB', estado: 'Completado' },
  { fecha: '02 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.3 MB', estado: 'Completado' },
];
