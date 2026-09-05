'use client';

import { Users, Calendar, CreditCard, Package, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const stats = [
  { label: 'Pacientes Totales', value: '156', icon: Users, color: 'text-primary-500', bgColor: 'bg-primary-50', trend: '+8%' },
  { label: 'Consultas de Hoy', value: '12', icon: Calendar, color: 'text-accent', bgColor: 'bg-cyan-50' },
  { label: 'Cobros del Día', value: '$24,500', icon: CreditCard, color: 'text-primary-500', bgColor: 'bg-primary-50' },
  { label: 'Lentes Bajo Stock', value: '45', icon: Package, color: 'text-warning', bgColor: 'bg-orange-50', alert: true },
];

const citas = [
  { hora: '09:00 AM', paciente: 'Mateo Rodríguez', seguro: 'Seguros Monterrey', doctor: 'Dra. Irina', diagnostico: 'Miopía progresiva', tipo: 'Seguimiento', estado: 'COMPLETADO' },
  { hora: '10:15 AM', paciente: 'Sofía González', seguro: 'Particular', doctor: 'Dra. Irina', diagnostico: 'Estrabismo divergente', tipo: 'Primera Vez', estado: 'EN CURSO' },
  { hora: '11:30 AM', paciente: 'Carlos Mendoza', seguro: 'AXA', doctor: 'Dr. Sánchez', diagnostico: 'Astigmatismo', tipo: 'Graduación', estado: 'PENDIENTE' },
  { hora: '12:00 PM', paciente: 'Lucía Ortiz', seguro: 'MetLife', doctor: 'Dra. Irina', diagnostico: 'Chequeo General', tipo: 'Seguimiento', estado: 'PENDIENTE' },
];

const inventarioBajo = [
  { nombre: 'Lente de Contacto Acuvue Oasys', detalle: 'Miopía -2.50', stock: 5 },
  { nombre: 'Armazón Infantil Flexible Blue', detalle: 'Color Azul', stock: 2 },
  { nombre: 'Mica Policarbonato Anti-Reflejante', detalle: 'Corte estándar', stock: 8 },
];

const estadoColors: Record<string, string> = {
  COMPLETADO: 'bg-emerald-100 text-emerald-700',
  'EN CURSO': 'bg-blue-100 text-blue-700',
  PENDIENTE: 'bg-gray-100 text-gray-600',
};

const estadoIcons: Record<string, React.ReactNode> = {
  COMPLETADO: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  'EN CURSO': <Clock className="w-4 h-4 text-blue-500" />,
  PENDIENTE: <Clock className="w-4 h-4 text-gray-400" />,
};

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">HOLA, Dra. Irina 👋</h1>
        <p className="text-gray-500">Bienvenida de vuelta a tu panel clínico de hoy.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-gray-900">{stat.value}</span>
              {stat.trend && (
                <span className="text-sm font-medium text-emerald-500 mb-1">▲ {stat.trend}</span>
              )}
              {stat.alert && (
                <span className="text-xs font-medium text-warning bg-orange-50 px-2 py-0.5 rounded">Alert</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Citas de hoy */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">CITAS DE HOY</h2>
            <a href="/consultas" className="text-sm text-primary-500 hover:text-primary-600 font-medium">
              Ver agenda completa →
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {citas.map((cita, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50 flex items-center gap-4">
                <div className="text-sm font-medium text-gray-900 w-20">{cita.hora}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{cita.paciente}</div>
                  <div className="text-sm text-gray-500">{cita.seguro}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-700">{cita.doctor}</div>
                  <div className="text-xs text-gray-400">{cita.diagnostico}</div>
                </div>
                <span className="text-xs text-gray-500 w-24 text-right">{cita.tipo}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${estadoColors[cita.estado]}`}>
                  {cita.estado}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Inventario bajo */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">INVENTARIO BAJO</h2>
            <a href="/inventario" className="text-sm text-primary-500 hover:text-primary-600 font-medium">
              Ver inventario completo →
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {inventarioBajo.map((item, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">{item.nombre}</div>
                    <div className="text-xs text-gray-500">{item.detalle}</div>
                  </div>
                  <span className="text-xs font-medium text-warning bg-orange-50 px-2 py-1 rounded">
                    {item.stock} unidades
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
