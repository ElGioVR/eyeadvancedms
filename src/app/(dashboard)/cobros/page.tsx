'use client';

import { DollarSign, Plus, Search } from 'lucide-react';
import Link from 'next/link';

export default function CobrosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobros y Facturación</h1>
          <p className="text-gray-500 text-sm mt-1">Control de pagos y generar recibos</p>
        </div>
        <Link
          href="/cobros/nuevo"
          className="btn-primary flex items-center gap-2 px-4 py-2.5"
        >
          <Plus className="w-5 h-5" />
          Nuevo Cobro
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente o folio..."
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <input
            type="date"
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Table placeholder */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-12 text-center">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Módulo en desarrollo</h3>
          <p className="text-gray-400 text-sm">Próximamente: registrar cobros, generar recibos, métodos de pago</p>
        </div>
      </div>
    </div>
  );
}
