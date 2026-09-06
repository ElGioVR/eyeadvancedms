'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Calendar, FileText, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pacientesData } from '@/data/pacientes';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilteredData } from '@/hooks/useFilteredData';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import SidebarPanel from '@/components/ui/SidebarPanel';

const sexoOptions = ['Todos', 'Masculino', 'Femenino'] as const;

const sexoFilterMap: Record<string, string> = {
  Masculino: 'H',
  Femenino: 'M',
};

const sexoColors: Record<string, string> = {
  H: 'text-primary-600',
  M: 'text-rose-500',
};

const sexoLabel: Record<string, string> = {
  H: 'H',
  M: 'M',
};

export default function PacientesPage() {
  const [search, setSearch] = useState('');
  const [filterSexo, setFilterSexo] = useState('Todos');
  const [showNewPatient, setShowNewPatient] = useState(false);

  const debouncedSearch = useDebounce(search);

  const mappedSexo = filterSexo === 'Todos' ? 'Todos' : sexoFilterMap[filterSexo] || filterSexo;

  const filtered = useFilteredData(pacientesData, {
    searchFields: ['nombre', 'aseguradora'],
    searchTerm: debouncedSearch,
    filters: { sexo: mappedSexo },
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre, teléfono, ID..."
              className="flex-1 min-w-[280px]"
            />
            <FilterSelect
              value={filterSexo}
              onChange={setFilterSexo}
              options={[...sexoOptions]}
            />
          </div>

          <div className="space-y-3">
            {filtered.map((paciente) => (
              <div
                key={paciente.id}
                className="group flex items-center gap-5 rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300"
              >
                <Avatar
                  initials={paciente.iniciales}
                  className={paciente.color}
                  size="lg"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-gray-900">{paciente.nombre}</h3>
                    <span className="text-xs text-gray-400">|</span>
                    <span className={cn('text-xs font-semibold', sexoColors[paciente.sexo])}>
                      {sexoLabel[paciente.sexo]} · {paciente.edad} años
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{paciente.aseguradora}</p>
                </div>

                <div className="hidden sm:block text-right min-w-[140px]">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Aseguradora</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{paciente.aseguradora}</p>
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
