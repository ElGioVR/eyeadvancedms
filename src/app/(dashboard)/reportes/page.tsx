'use client';

import { BarChart3, Calendar } from 'lucide-react';

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-gray-500 text-sm mt-1">Estadísticas y reportes de la clínica</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          Septiembre 2026
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
          <BarChart3 className="w-8 h-8 text-primary-500 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Consultas por Doctor</h3>
          <p className="text-gray-400 text-sm">Próximamente</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
          <BarChart3 className="w-8 h-8 text-primary-500 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Ingresos Mensuales</h3>
          <p className="text-gray-400 text-sm">Próximamente</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
          <BarChart3 className="w-8 h-8 text-primary-500 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Lentes Más Vendidos</h3>
          <p className="text-gray-400 text-sm">Próximamente</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Módulo en desarrollo</h3>
          <p className="text-gray-400 text-sm">Próximamente: gráficas, reportes exportables, KPIs en tiempo real</p>
        </div>
      </div>
    </div>
  );
}
