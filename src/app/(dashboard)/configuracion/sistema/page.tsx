'use client';

import { Save, Database, Server, Shield, RefreshCw, HardDrive, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const systemStats = [
  { label: 'Base de Datos', value: 'Conectada', icon: Database, color: 'text-emerald-500', bgColor: 'bg-emerald-50', status: 'ok' },
  { label: 'Servidor', value: 'Operativo', icon: Server, color: 'text-emerald-500', bgColor: 'bg-emerald-50', status: 'ok' },
  { label: 'Último Respaldo', value: 'Hoy, 03:00 AM', icon: HardDrive, color: 'text-primary-500', bgColor: 'bg-primary-50', status: 'ok' },
  { label: 'Autenticación', value: 'Supabase Auth', icon: Shield, color: 'text-sky-500', bgColor: 'bg-sky-50', status: 'ok' },
];

const recentLogs = [
  { timestamp: '04 Sep 2026, 10:15 AM', user: 'Dra. Irina', accion: 'Inicio de sesión', tipo: 'auth' },
  { timestamp: '04 Sep 2026, 10:12 AM', user: 'Sofía González', accion: 'Inicio de sesión', tipo: 'auth' },
  { timestamp: '04 Sep 2026, 09:45 AM', user: 'Admin Carlos', accion: 'Creó usuario: Mateo Rodríguez', tipo: 'user' },
  { timestamp: '04 Sep 2026, 09:30 AM', user: 'Dra. Irina', accion: 'Consulta #1245 registrada', tipo: 'consulta' },
  { timestamp: '04 Sep 2026, 09:00 AM', user: 'Sistema', accion: 'Respaldo automático completado', tipo: 'system' },
  { timestamp: '03 Sep 2026, 04:30 PM', user: 'Dr. Héctor', accion: 'Consulta #1244 registrada', tipo: 'consulta' },
  { timestamp: '03 Sep 2026, 03:15 PM', user: 'Admin Carlos', accion: 'Actualizó inventario: Lente Progresivo', tipo: 'inventory' },
  { timestamp: '03 Sep 2026, 02:00 PM', user: 'Dra. Martha', accion: 'Consulta #1243 registrada', tipo: 'consulta' },
];

const tipoColors: Record<string, string> = {
  auth: 'bg-sky-50 text-sky-700',
  user: 'bg-purple-50 text-purple-700',
  consulta: 'bg-primary-50 text-primary-700',
  system: 'bg-emerald-50 text-emerald-700',
  inventory: 'bg-amber-50 text-amber-700',
};

export default function SistemaPage() {
  return (
    <div className="space-y-6">
      {/* System health */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {systemStats.map((stat) => (
          <div key={stat.label} className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', stat.bgColor)}>
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                OK
              </span>
            </div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{stat.label}</p>
            <p className="text-sm font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Config */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Configuración General</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre de la Clínica</label>
                  <input type="text" defaultValue="EyeAdvanced Medical Solutions" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Teléfono</label>
                  <input type="tel" defaultValue="664-100-2000" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Dirección</label>
                  <input type="text" defaultValue="Av. Revolución 1234, Zona Centro, Tijuana, B.C. 22000" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">RFC</label>
                  <input type="text" defaultValue="EAM240101XYZ" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Zona Horaria</label>
                  <select defaultValue="America/Tijuana" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                    <option value="America/Tijuana">America/Tijuana (UTC-8)</option>
                    <option value="America/Mexico_City">America/Mexico_City (UTC-6)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
                  <Save className="h-4 w-4" />
                  Guardar Configuración
                </button>
              </div>
            </div>
          </div>

          {/* Backup */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Respaldos</h3>
              <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <RefreshCw className="h-3.5 w-3.5" />
                Respaldar Ahora
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {[
                  { fecha: '04 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.4 MB', estado: 'Completado' },
                  { fecha: '03 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.3 MB', estado: 'Completado' },
                  { fecha: '02 Sep 2026, 03:00 AM', tipo: 'Automático', size: '2.3 MB', estado: 'Completado' },
                ].map((backup, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <HardDrive className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{backup.fecha}</p>
                        <p className="text-xs text-gray-400">{backup.tipo} • {backup.size}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {backup.estado}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Activity log */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Actividad Reciente</h3>
            <Activity className="h-4 w-4 text-gray-400" />
          </div>
          <div className="divide-y divide-gray-50">
            {recentLogs.map((log, idx) => (
              <div key={idx} className="px-6 py-3 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{log.accion}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{log.user}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold', tipoColors[log.tipo])}>
                    {log.tipo}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{log.timestamp}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
