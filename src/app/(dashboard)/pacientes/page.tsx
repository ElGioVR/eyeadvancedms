'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pacientesData } from '@/data/pacientes';
import { useDebounce } from '@/hooks/useDebounce';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import SidebarPanel from '@/components/ui/SidebarPanel';

const sexoOptions = ['Todos', 'Masculino', 'Femenino'] as const;
const edadOptions = ['Todos', '0-18', '19-35', '36-50', '51+'] as const;
const visitaOptions = ['Todos', 'Hoy', 'Esta semana', 'Este mes', 'Anterior'] as const;

const sexoFilterMap: Record<string, string> = {
  Masculino: 'H',
  Femenino: 'M',
};

function filterByEdad(edad: number, filter: string): boolean {
  if (filter === 'Todos') return true;
  if (filter === '0-18') return edad <= 18;
  if (filter === '19-35') return edad >= 19 && edad <= 35;
  if (filter === '36-50') return edad >= 36 && edad <= 50;
  if (filter === '51+') return edad >= 51;
  return true;
}

export default function PacientesPage() {
  const [search, setSearch] = useState('');
  const [filterSexo, setFilterSexo] = useState('Todos');
  const [filterEdad, setFilterEdad] = useState('Todos');
  const [filterVisita, setFilterVisita] = useState('Todos');
  const [showNewPatient, setShowNewPatient] = useState(false);

  const debouncedSearch = useDebounce(search);

  const mappedSexo = filterSexo === 'Todos' ? 'Todos' : sexoFilterMap[filterSexo] || filterSexo;

  const filtered = pacientesData.filter((p) => {
    const term = debouncedSearch.toLowerCase();
    const matchesSearch = !term || p.nombre.toLowerCase().includes(term) || p.telefono?.toLowerCase().includes(term) || p.id.toString().includes(term);
    const matchesSexo = mappedSexo === 'Todos' || p.sexo === mappedSexo;
    const matchesEdad = filterByEdad(p.edad, filterEdad);
    return matchesSearch && matchesSexo && matchesEdad;
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="PACIENTES"
        subtitle="Listado general y altas del sistema."
        action={
          <button
            onClick={() => setShowNewPatient(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo Paciente
          </button>
        }
      />

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono, ID..."
                className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            <span className="text-sm font-bold text-gray-500">Filtrar:</span>

            <select
              value={filterSexo}
              onChange={(e) => setFilterSexo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="Todos">Todos</option>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
            </select>

            <select
              value={filterEdad}
              onChange={(e) => setFilterEdad(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              {edadOptions.map((o) => (
                <option key={o} value={o}>{o === 'Todos' ? 'Edad' : o}</option>
              ))}
            </select>

            <select
              value={filterVisita}
              onChange={(e) => setFilterVisita(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              {visitaOptions.map((o) => (
                <option key={o} value={o}>{o === 'Todos' ? 'Última visita' : o}</option>
              ))}
            </select>
          </div>

          {/* Patient list */}
          <div className="space-y-2">
            {filtered.map((paciente) => (
              <div
                key={paciente.id}
                className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm transition-all hover:shadow-md hover:border-primary-200"
              >
                <Avatar
                  initials={paciente.iniciales}
                  className={paciente.color}
                  size="lg"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{paciente.nombre}</h3>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>{paciente.telefono}</span>
                    <span className="text-gray-300">|</span>
                    <span>{paciente.sexo === 'H' ? 'M' : 'F'} · {paciente.edad} años</span>
                  </div>
                </div>

                <div className="hidden sm:block text-right min-w-[120px]">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Última visita</p>
                  <p className="text-xs font-bold text-gray-900 mt-0.5">{paciente.ultimaVisita || '—'}</p>
                </div>

                <div className="hidden sm:block text-right min-w-[100px]">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Consultas</p>
                  <p className="text-xs font-bold text-gray-900 mt-0.5">{paciente.consultas || 0} registros</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/pacientes/${paciente.id}/historial`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
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
              <EmptyState
                icon={User}
                title="No se encontraron pacientes"
                description="Intenta con otros términos de búsqueda"
              />
            )}
          </div>
        </div>

        {/* Sidebar — visible on lg+ when no sidebar panel is open, or when panel is open */}
        <SidebarPanel
          isOpen={showNewPatient}
          onClose={() => setShowNewPatient(false)}
          title="Nuevo Paciente"
        >
          <div className="space-y-5">
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
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option value="">Seleccionar</option>
                      <option value="H">Masculino</option>
                      <option value="M">Femenino</option>
                    </select>
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
                </div>
              </div>
            </div>

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
        </SidebarPanel>
      </div>
    </div>
  );
}
