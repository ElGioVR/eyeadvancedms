'use client';

import { Users, Plus, Search } from 'lucide-react';
import Link from 'next/link';

export default function PacientesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Pacientes</h1>
          <p className="text-gray-500 text-sm mt-1">Administra el registro de pacientes de la clínica</p>
        </div>
        <Link
          href="/pacientes/nuevo"
          className="btn-primary flex items-center gap-2 px-4 py-2.5"
        >
          <Plus className="w-5 h-5" />
          Nuevo Paciente
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o expediente..."
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todas las aseguranzas</option>
            <option>ISSSTECALI</option>
            <option>JORNADA</option>
            <option>GNP</option>
            <option>Seguros Monterrey</option>
            <option>AXA</option>
            <option>MetLife</option>
          </select>
        </div>
      </div>

      {/* Table placeholder */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Módulo en desarrollo</h3>
          <p className="text-gray-400 text-sm">Próximamente: registro, edición y búsqueda de pacientes</p>
        </div>
      </div>
    </div>
  );
}
