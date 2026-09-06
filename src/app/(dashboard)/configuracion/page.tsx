'use client';

import { Camera, Save } from 'lucide-react';
import type { PerfilActividad } from '@/types';

const perfilActividad: PerfilActividad[] = [
  { accion: 'Consulta #1245 completada', tiempo: 'Hoy, 10:15 AM' },
  { accion: 'Paciente Mateo Rodríguez registrado', tiempo: 'Hoy, 09:30 AM' },
  { accion: 'Receta #892 emitida', tiempo: 'Ayer, 04:20 PM' },
  { accion: 'Consulta #1240 completada', tiempo: 'Ayer, 02:10 PM' },
];

export default function PerfilPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Main form */}
      <div className="space-y-6">
        {/* Photo */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Foto de Perfil</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-500 text-2xl font-bold text-white">
                  DI
                </div>
                <button className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Dra. Irina Rostova</p>
                <p className="text-xs text-gray-400 mt-0.5">Oftalmóloga Pediatra</p>
                <button className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700">Cambiar foto</button>
              </div>
            </div>
          </div>
        </div>

        {/* Personal info */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Información Personal</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre Completo</label>
                <input type="text" defaultValue="Dra. Irina Rostova" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                <input type="email" defaultValue="irina.rostova@eyeadvanced.com" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Teléfono</label>
                <input type="tel" defaultValue="664-123-4567" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Especialidad</label>
                <input type="text" defaultValue="Oftalmología Pediátrica" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Cédula Profesional</label>
                <input type="text" defaultValue="12345678" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">RFC</label>
                <input type="text" defaultValue="RIRS850101ABC" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Cambiar Contraseña</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contraseña Actual</label>
              <input type="password" placeholder="••••••••" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nueva Contraseña</label>
                <input type="password" placeholder="••••••••" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Confirmar Contraseña</label>
                <input type="password" placeholder="••••••••" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
            <Save className="h-4 w-4" />
            Guardar Cambios
          </button>
        </div>
      </div>

      {/* Sidebar info */}
      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Resumen</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs text-gray-400">Rol</p>
              <p className="text-sm font-bold text-gray-900">Doctor (Médico Especialista)</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Estado</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Activo
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400">Fecha de Registro</p>
              <p className="text-sm font-medium text-gray-700">15 Ene 2024</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Último Acceso</p>
              <p className="text-sm font-medium text-gray-700">Hoy, 10:15 AM</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Consultas Totales</p>
              <p className="text-sm font-bold text-gray-900">342</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Actividad Reciente</h3>
          </div>
          <div className="p-4 space-y-3">
            {perfilActividad.map((item) => (
              <div key={item.accion} className="flex items-start gap-3 rounded-lg p-2 hover:bg-gray-50">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.accion}</p>
                  <p className="text-xs text-gray-400">{item.tiempo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
