'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Calendar, User, ChevronDown, Stethoscope, Scissors } from 'lucide-react';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useFetch } from '@/hooks/useFetch';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import SidebarPanel from '@/components/ui/SidebarPanel';
import ClientDate from '@/components/ui/ClientDate';

interface PacienteAPI {
  id: string;
  nombre: string;
  iniciales: string;
  sexo: string;
  edad: number;
  telefono: string;
  email: string;
  aseguradora: string;
  aseguranza_id: string | null;
  consultas_count: number;
  ultima_visita: string | null;
}

interface AseguranzaOption {
  id: string;
  nombre: string;
}

const sexoFilterOptions = ['Todos', 'Masculino', 'Femenino'] as const;
const edadOptions = ['Todos', '0-18', '19-35', '36-50', '51+'] as const;

const nuevoPacienteSchema = z.object({
  nombre_completo: z.string().min(1, 'El nombre es requerido'),
  sexo: z.enum(['H', 'M'], { errorMap: () => ({ message: 'Selecciona un sexo' }) }),
  fecha_nacimiento: z.string().min(1, 'La fecha de nacimiento es requerida'),
  telefono: z.string().min(1, 'El teléfono es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  aseguranza_id: z.string().optional().or(z.literal('')),
  contacto_emergencia: z.string().optional().or(z.literal('')),
  tel_emergencia: z.string().optional().or(z.literal('')),
});

function filterByEdad(edad: number, filter: string): boolean {
  if (filter === 'Todos') return true;
  if (filter === '0-18') return edad <= 18;
  if (filter === '19-35') return edad >= 19 && edad <= 35;
  if (filter === '36-50') return edad >= 36 && edad <= 50;
  if (filter === '51+') return edad >= 51;
  return true;
}

export default function PacientesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data: pacientes, loading, error, total, page: currentPage, refetch } = useFetch<PacienteAPI>('/api/pacientes', { page: String(page), pageSize: '15' });
  const [search, setSearch] = useState('');
  const [filterSexo, setFilterSexo] = useState('Todos');
  const [filterEdad, setFilterEdad] = useState('Todos');
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [agendarMenuId, setAgendarMenuId] = useState<string | null>(null);
  const [filterAseguradora, setFilterAseguradora] = useState('Todas');
  const [aseguranzas, setAseguranzas] = useState<AseguranzaOption[]>([]);
  const [newPatientAseguranzaId, setNewPatientAseguranzaId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/configuracion/aseguranzas', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAseguranzas(data); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const debouncedSearch = useDebounce(search);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return pacientes.filter((p) => {
      const matchesSearch = !term || p.nombre.toLowerCase().includes(term) || p.telefono?.toLowerCase().includes(term);
      const matchesSexo = filterSexo === 'Todos' || (filterSexo === 'Masculino' && p.sexo === 'H') || (filterSexo === 'Femenino' && p.sexo === 'M');
      const matchesEdad = filterByEdad(p.edad, filterEdad);
      const matchesAseguradora = filterAseguradora === 'Todas' || p.aseguradora === filterAseguradora;
      return matchesSearch && matchesSexo && matchesEdad && matchesAseguradora;
    });
  }, [pacientes, debouncedSearch, filterSexo, filterEdad, filterAseguradora]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="PACIENTES"
        subtitle="Listado general y altas del sistema."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewPatient(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors sm:px-5 sm:py-2.5"
            >
              <Plus className="h-4 w-4" />
              Nuevo Paciente
            </button>
          </div>
        }
      />

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#71767B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono, ID..."
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            <span className="hidden sm:inline text-sm font-bold text-gray-500 dark:text-[#71767B]">Filtrar:</span>

            <select
              value={filterSexo}
              onChange={(e) => setFilterSexo(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              {sexoFilterOptions.map((o) => (
                <option key={o} value={o}>{o === 'Todos' ? 'Todos' : o}</option>
              ))}
            </select>

            <select
              value={filterEdad}
              onChange={(e) => setFilterEdad(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              {edadOptions.map((o) => (
                <option key={o} value={o}>{o === 'Todos' ? 'Edad' : o}</option>
              ))}
            </select>

            {aseguranzas.length > 0 && (
              <select
                value={filterAseguradora}
                onChange={(e) => setFilterAseguradora(e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 max-w-[140px] sm:max-w-none"
              >
                <option value="Todas">Aseguradora</option>
                {aseguranzas.map((a) => (
                  <option key={a.id} value={a.nombre}>{a.nombre}</option>
                ))}
              </select>
            )}
          </div>

          {/* Patient list */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 sm:px-5 sm:py-3.5">
                  <div className="h-11 w-11 rounded-full bg-gray-200 dark:bg-[#2F3336]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-[#2F3336] rounded w-1/3 max-w-[200px]" />
                    <div className="h-3 bg-gray-200 dark:bg-[#2F3336] rounded w-1/4 max-w-[140px]" />
                  </div>
                  <div className="hidden sm:flex items-center gap-6">
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-16 bg-gray-200 dark:bg-[#2F3336] rounded ml-auto" />
                      <div className="h-3 w-12 bg-gray-200 dark:bg-[#2F3336] rounded ml-auto" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-20 bg-gray-200 dark:bg-[#2F3336] rounded ml-auto" />
                      <div className="h-3 w-14 bg-gray-200 dark:bg-[#2F3336] rounded ml-auto" />
                    </div>
                  </div>
                  <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-[#2F3336]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((paciente) => (
                <div
                  key={paciente.id}
                  className="group flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm transition-all hover:shadow-md hover:border-primary-200"
                >
                  <Avatar
                    initials={paciente.iniciales}
                    className="bg-primary-500"
                    size="lg"
                  />

                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{paciente.nombre}</h3>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-[#71767B]">
                      <span>{paciente.telefono || '—'}</span>
                      <span className="hidden sm:inline text-gray-300 dark:text-[#71767B]">|</span>
                      <span>{paciente.sexo === 'H' ? 'M' : 'F'} · {paciente.edad} años</span>
                    </div>
                  </div>

                  <div className="hidden sm:block text-right min-w-[120px]">
                    <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Última visita</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-[#E7E9EA] mt-0.5">{paciente.ultima_visita ? <ClientDate date={paciente.ultima_visita} options={{ day: '2-digit', month: 'short', year: 'numeric' }} /> : '—'}</p>
                  </div>

                  <div className="hidden sm:block text-right min-w-[100px]">
                    <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Consultas</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-[#E7E9EA] mt-0.5">{paciente.consultas_count} registros</p>
                  </div>

                  <div className="flex w-full sm:w-auto items-center justify-end gap-2 shrink-0">
                    <Link
                      href={`/pacientes/${paciente.id}/historial`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Historial
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setAgendarMenuId(agendarMenuId === paciente.id ? null : paciente.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100 transition-colors dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/30"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        Agendar
                        <ChevronDown className="h-3 w-3 text-primary-400" />
                      </button>
                      {agendarMenuId === paciente.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setAgendarMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl shadow-lg z-50 overflow-hidden">
                            <div className="p-1">
                              <button
                                onClick={() => { setAgendarMenuId(null); router.push(`/consultas/nueva?paciente_id=${paciente.id}`); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#1D1F23] rounded-lg text-sm transition-colors"
                              >
                                <Stethoscope className="h-4 w-4 text-primary-500" />
                                <span className="text-gray-700 dark:text-[#E7E9EA]">Consulta</span>
                              </button>
                              <button
                                onClick={() => { setAgendarMenuId(null); router.push(`/cirugias/nueva?paciente_id=${paciente.id}`); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#1D1F23] rounded-lg text-sm transition-colors"
                              >
                                <Scissors className="h-4 w-4 text-emerald-500" />
                                <span className="text-gray-700 dark:text-[#E7E9EA]">Cirugía</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
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
          )}

          <Pagination
            page={currentPage}
            total={total}
            pageSize={15}
            totalItems={filtered.length}
            onPageChange={(p) => setPage(p)}
            label="pacientes"
          />
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
                  <label htmlFor="nombre-completo" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Nombre completo <span className="text-red-500">*</span></label>
                  <input id="nombre-completo" type="text" placeholder="Ej. Juan Pérez González" className={cn("w-full rounded-lg border bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", formErrors.nombre_completo ? 'border-red-500 dark:border-red-500' : 'border-gray-200 dark:border-[#2F3336]')} />
                  {formErrors.nombre_completo && <p className="mt-1 text-xs text-red-500">{formErrors.nombre_completo}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sexo" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Sexo <span className="text-red-500">*</span></label>
                    <select id="sexo" className={cn("w-full appearance-none rounded-lg border bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", formErrors.sexo ? 'border-red-500 dark:border-red-500' : 'border-gray-200 dark:border-[#2F3336]')}>
                      <option value="">Seleccionar</option>
                      <option value="H">Masculino</option>
                      <option value="M">Femenino</option>
                    </select>
                    {formErrors.sexo && <p className="mt-1 text-xs text-red-500">{formErrors.sexo}</p>}
                  </div>
                  <div>
                    <label htmlFor="fecha-nacimiento" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Fecha de Nacimiento <span className="text-red-500">*</span></label>
                    <input id="fecha-nacimiento" type="date" className={cn("w-full rounded-lg border bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", formErrors.fecha_nacimiento ? 'border-red-500 dark:border-red-500' : 'border-gray-200 dark:border-[#2F3336]')} />
                    {formErrors.fecha_nacimiento && <p className="mt-1 text-xs text-red-500">{formErrors.fecha_nacimiento}</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor="telefono" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Teléfono <span className="text-red-500">*</span></label>
                  <input id="telefono" type="tel" placeholder="Ej. 664 123 4567" className={cn("w-full rounded-lg border bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", formErrors.telefono ? 'border-red-500 dark:border-red-500' : 'border-gray-200 dark:border-[#2F3336]')} />
                  {formErrors.telefono && <p className="mt-1 text-xs text-red-500">{formErrors.telefono}</p>}
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Email</label>
                  <input id="email" type="email" placeholder="correo@ejemplo.com" className={cn("w-full rounded-lg border bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", formErrors.email ? 'border-red-500 dark:border-red-500' : 'border-gray-200 dark:border-[#2F3336]')} />
                  {formErrors.email && <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>}
                </div>
                <div>
                  <label htmlFor="aseguradora" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Aseguradora</label>
                  <select
                    id="aseguradora"
                    value={newPatientAseguranzaId}
                    onChange={(e) => setNewPatientAseguranzaId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="">Seleccionar</option>
                    {aseguranzas.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-[#2F3336] pt-5">
              <h4 className="text-xs font-extrabold text-primary-600 uppercase tracking-wider mb-3">Contacto de Emergencia</h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="contacto-nombre" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Nombre del contacto</label>
                  <input id="contacto-nombre" type="text" placeholder="Ej. María Pérez" className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label htmlFor="contacto-telefono" className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Teléfono de emergencia</label>
                  <input id="contacto-telefono" type="tel" placeholder="Ej. 664 987 6543" className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-[#2F3336]">
              <button
                onClick={() => { setShowNewPatient(false); setNewPatientAseguranzaId(''); setFormErrors({}); }}
                className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
              >
                CANCELAR
              </button>
              <button
                onClick={async () => {
                  const nombreEl = document.getElementById('nombre-completo') as HTMLInputElement;
                  const sexoEl = document.getElementById('sexo') as HTMLSelectElement;
                  const fechaEl = document.getElementById('fecha-nacimiento') as HTMLInputElement;
                  const telEl = document.getElementById('telefono') as HTMLInputElement;
                  const emailEl = document.getElementById('email') as HTMLInputElement;
                  const contactoEl = document.getElementById('contacto-nombre') as HTMLInputElement;
                  const contactoTelEl = document.getElementById('contacto-telefono') as HTMLInputElement;

                  const result = nuevoPacienteSchema.safeParse({
                    nombre_completo: nombreEl?.value?.trim() || '',
                    sexo: sexoEl?.value || '',
                    fecha_nacimiento: fechaEl?.value || '',
                    telefono: telEl?.value || '',
                    email: emailEl?.value || '',
                    aseguranza_id: newPatientAseguranzaId || '',
                    contacto_emergencia: contactoEl?.value || '',
                    tel_emergencia: contactoTelEl?.value || '',
                  });

                  if (!result.success) {
                    const errors: Record<string, string> = {};
                    result.error.errors.forEach((err) => {
                      if (err.path[0]) errors[err.path[0] as string] = err.message;
                    });
                    setFormErrors(errors);
                    return;
                  }

                  setFormErrors({});
                  const payload: Record<string, unknown> = {
                    nombre_completo: result.data.nombre_completo,
                    sexo: result.data.sexo,
                    fecha_nacimiento: result.data.fecha_nacimiento,
                    telefono: result.data.telefono,
                  };
                  if (result.data.email) payload.email = result.data.email;
                  if (result.data.aseguranza_id) payload.aseguranza_id = result.data.aseguranza_id;
                  if (result.data.contacto_emergencia) payload.contacto_emergencia = result.data.contacto_emergencia;
                  if (result.data.tel_emergencia) payload.tel_emergencia = result.data.tel_emergencia;

                  try {
                    const res = await fetch('/api/pacientes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    if (res.ok) {
                      setShowNewPatient(false);
                      setNewPatientAseguranzaId('');
                      setFormErrors({});
                      await refetch();
                    }
                  } catch {}
                }}
                className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
              >
                GUARDAR PACIENTE
              </button>
            </div>
          </div>
        </SidebarPanel>
      </div>
    </div>
  );
}
