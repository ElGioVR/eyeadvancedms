'use client';

import { useState } from 'react';
import {
  Search,
  Plus,
  X,
  Calendar,
  FileText,
  ChevronDown,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Paciente {
  id: number;
  nombre: string;
  telefono: string;
  sexo: string;
  edad: number;
  fechaNacimiento: string;
  email: string;
  ultimaVisita: string;
  consultas: number;
  iniciales: string;
  avatarColor: string;
  aseguranza?: string;
  contactoEmergencia?: string;
  telefonoEmergencia?: string;
}

const pacientesData: Paciente[] = [
  { id: 1, nombre: 'Mateo Rodríguez', telefono: '664-123-4567', sexo: 'M', edad: 8, fechaNacimiento: '2018-03-15', email: 'mateo.rodriguez@email.com', ultimaVisita: '28 Ago 2024', consultas: 3, iniciales: 'MR', avatarColor: 'bg-primary-500', aseguranza: 'Seguros Monterrey', contactoEmergencia: 'Laura Rodríguez', telefonoEmergencia: '664-111-2222' },
  { id: 2, nombre: 'Sofía González', telefono: '664-987-6543', sexo: 'F', edad: 12, fechaNacimiento: '2014-07-22', email: 'sofia.gonzalez@email.com', ultimaVisita: 'Hoy, 10:15 AM', consultas: 1, iniciales: 'SG', avatarColor: 'bg-purple-500', aseguranza: 'Particular', contactoEmergencia: 'Pedro González', telefonoEmergencia: '664-333-4444' },
  { id: 3, nombre: 'Carlos Mendoza', telefono: '664-456-7890', sexo: 'M', edad: 35, fechaNacimiento: '1991-01-10', email: 'carlos.mendoza@email.com', ultimaVisita: '15 Jul 2024', consultas: 5, iniciales: 'CM', avatarColor: 'bg-emerald-500', aseguranza: 'AXA', contactoEmergencia: 'Ana Mendoza', telefonoEmergencia: '664-555-6666' },
  { id: 4, nombre: 'Lucía Ortiz', telefono: '664-321-0987', sexo: 'F', edad: 42, fechaNacimiento: '1984-11-05', email: 'lucia.ortiz@email.com', ultimaVisita: '01 Sep 2024', consultas: 2, iniciales: 'LO', avatarColor: 'bg-rose-500', aseguranza: 'MetLife', contactoEmergencia: 'Roberto Ortiz', telefonoEmergencia: '664-777-8888' },
  { id: 5, nombre: 'Roberto Vega', telefono: '664-234-5678', sexo: 'M', edad: 58, fechaNacimiento: '1968-06-18', email: 'roberto.vega@email.com', ultimaVisita: '20 Ago 2024', consultas: 8, iniciales: 'RV', avatarColor: 'bg-sky-500', aseguranza: 'ISSSTECALI', contactoEmergencia: 'Carmen Vega', telefonoEmergencia: '664-999-0000' },
  { id: 6, nombre: 'Ana Luisa Pérez', telefono: '664-876-5432', sexo: 'F', edad: 29, fechaNacimiento: '1997-09-30', email: 'ana.perez@email.com', ultimaVisita: 'Hoy, 09:00 AM', consultas: 4, iniciales: 'AP', avatarColor: 'bg-amber-500', aseguranza: 'GNP', contactoEmergencia: 'Miguel Pérez', telefonoEmergencia: '664-123-0987' },
  { id: 7, nombre: 'Diego Herrera', telefono: '664-543-2109', sexo: 'M', edad: 45, fechaNacimiento: '1981-04-12', email: 'diego.herrera@email.com', ultimaVisita: '10 Ago 2024', consultas: 2, iniciales: 'DH', avatarColor: 'bg-cyan-500', aseguranza: 'JORNADA', contactoEmergencia: 'Patricia Herrera', telefonoEmergencia: '664-876-5432' },
  { id: 8, nombre: 'Valentina Cruz', telefono: '664-654-3210', sexo: 'F', edad: 6, fechaNacimiento: '2020-08-25', email: 'valentina.cruz@email.com', ultimaVisita: '25 Ago 2024', consultas: 6, iniciales: 'VC', avatarColor: 'bg-violet-500', aseguranza: 'ISSSTECALI', contactoEmergencia: 'Fernando Cruz', telefonoEmergencia: '664-321-6543' },
];

const sexoColors: Record<string, string> = {
  M: 'text-primary-600',
  F: 'text-rose-500',
};

export default function PacientesPage() {
  const [search, setSearch] = useState('');
  const [filterSexo, setFilterSexo] = useState('Todos');
  const [showNewPatient, setShowNewPatient] = useState(false);

  const filtered = pacientesData.filter((p) => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.telefono.includes(search) ||
      p.email.toLowerCase().includes(search.toLowerCase());
    const matchSexo = filterSexo === 'Todos' || p.sexo === (filterSexo === 'Masculino' ? 'M' : 'F');
    return matchSearch && matchSexo;
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">PACIENTES</h1>
        <p className="mt-1 text-sm text-gray-400">Listado general y altas del sistema.</p>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search & Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono, ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
            <span className="text-sm text-gray-400 font-medium">Filtrar:</span>
            <div className="relative">
              <select
                value={filterSexo}
                onChange={(e) => setFilterSexo(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option>Todos</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                <option>Edad</option>
                <option>0-10</option>
                <option>11-20</option>
                <option>21-40</option>
                <option>41-60</option>
                <option>60+</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                <option>Última visita</option>
                <option>Hoy</option>
                <option>Esta semana</option>
                <option>Este mes</option>
                <option>Más de 30 días</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Patient list */}
          <div className="space-y-3">
            {filtered.map((paciente) => (
              <div
                key={paciente.id}
                className="group flex items-center gap-5 rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300"
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                    paciente.avatarColor
                  )}
                >
                  {paciente.iniciales}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-gray-900">{paciente.nombre}</h3>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-400">{paciente.telefono}</span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className={cn('text-xs font-semibold', sexoColors[paciente.sexo])}>
                      {paciente.sexo} · {paciente.edad} años
                    </span>
                  </div>
                </div>

                {/* Última visita */}
                <div className="hidden sm:block text-right min-w-[140px]">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Última Visita</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{paciente.ultimaVisita}</p>
                </div>

                {/* Consultas */}
                <div className="text-right min-w-[100px]">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Consultas</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{paciente.consultas} registros</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/pacientes/${paciente.id}/historial`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                    <FileText className="h-3.5 w-3.5" />
                    Historial
                  </Link>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100 transition-colors">
                    <Calendar className="h-3.5 w-3.5" />
                    Agendar
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
                <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No se encontraron pacientes</h3>
                <p className="text-gray-400 text-sm">Intenta con otros términos de búsqueda</p>
              </div>
            )}
          </div>
        </div>

        {/* New Patient sidebar */}
        {showNewPatient && (
          <div className="w-[400px] shrink-0">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-base font-extrabold text-gray-900">Nuevo Paciente</h3>
                <button onClick={() => setShowNewPatient(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto">
                {/* Datos personales */}
                <div>
                  <h4 className="text-xs font-extrabold text-primary-600 uppercase tracking-wider mb-3">Datos Personales</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="Ej. Juan Pérez González" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sexo <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                            <option value="">Seleccionar</option>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Fecha de Nacimiento <span className="text-red-500">*</span></label>
                        <input type="date" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Teléfono <span className="text-red-500">*</span></label>
                      <input type="tel" placeholder="Ej. 664 123 4567" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Email</label>
                      <input type="email" placeholder="correo@ejemplo.com" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Aseguranza</label>
                      <div className="relative">
                        <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                          <option value="">Seleccionar</option>
                          <option>ISSSTECALI</option>
                          <option>JORNADA</option>
                          <option>GNP</option>
                          <option>Seguros Monterrey</option>
                          <option>AXA</option>
                          <option>MetLife</option>
                          <option>Particular</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contacto de emergencia */}
                <div className="border-t border-gray-100 pt-5">
                  <h4 className="text-xs font-extrabold text-primary-600 uppercase tracking-wider mb-3">Contacto de Emergencia</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Nombre del contacto</label>
                      <input type="text" placeholder="Ej. María Pérez" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Teléfono de emergencia</label>
                      <input type="tel" placeholder="Ej. 664 987 6543" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowNewPatient(false)}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
                    GUARDAR PACIENTE
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating button to open sidebar */}
        {!showNewPatient && (
          <button
            onClick={() => setShowNewPatient(true)}
            className="fixed bottom-8 right-8 z-40 inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            Nuevo Paciente
          </button>
        )}
      </div>
    </div>
  );
}
