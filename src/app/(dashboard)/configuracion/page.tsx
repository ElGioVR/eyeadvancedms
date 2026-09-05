'use client';

import { Settings, Building2, Users, Database } from 'lucide-react';

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Ajustes generales del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <Building2 className="w-8 h-8 text-primary-500 mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Datos de la Clínica</h3>
          <p className="text-gray-400 text-sm mb-4">Nombre, dirección, teléfono, RFC</p>
          <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">Configurar</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <Users className="w-8 h-8 text-primary-500 mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Usuarios y Doctores</h3>
          <p className="text-gray-400 text-sm mb-4">Gestionar cuentas y roles del sistema</p>
          <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">Configurar</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <Database className="w-8 h-8 text-primary-500 mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">Base de Datos</h3>
          <p className="text-gray-400 text-sm mb-4">Respaldos, conexión y migraciones</p>
          <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">Configurar</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-12 text-center">
          <Settings className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Módulo en desarrollo</h3>
          <p className="text-gray-400 text-sm">Próximamente: ajustes completos de la clínica</p>
        </div>
      </div>
    </div>
  );
}
