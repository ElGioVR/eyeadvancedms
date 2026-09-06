'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, ChevronDown, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const pacientesBusqueda = [
  { id: 1, nombre: 'Mateo Rodríguez', telefono: '664-123-4567', edad: 8, sexo: 'M', seguro: 'Seguros Monterrey', diagnostico: 'Miopía progresiva', iniciales: 'MR', color: 'bg-primary-500' },
  { id: 2, nombre: 'Sofía González', telefono: '664-987-6543', edad: 12, sexo: 'F', seguro: 'Particular', diagnostico: 'Estrabismo divergente', iniciales: 'SG', color: 'bg-purple-500' },
  { id: 3, nombre: 'Carlos Mendoza', telefono: '664-456-7890', edad: 35, sexo: 'M', seguro: 'AXA', diagnostico: 'Astigmatismo', iniciales: 'CM', color: 'bg-emerald-500' },
  { id: 4, nombre: 'Lucía Ortiz', telefono: '664-321-0987', edad: 42, sexo: 'F', seguro: 'MetLife', diagnostico: 'Glaucoma sospecha', iniciales: 'LO', color: 'bg-rose-500' },
  { id: 5, nombre: 'María García', telefono: '664-555-0199', edad: 29, sexo: 'F', seguro: 'GNP', diagnostico: 'Queratocono', iniciales: 'MG', color: 'bg-amber-500' },
];

const historialReciente = [
  { fecha: '28 Ago 2024', tipo: 'Seguimiento', doctor: 'Dra. Irina', nota: 'Miopía bajo control' },
  { fecha: '15 May 2024', tipo: 'Graduación', doctor: 'Dr. Sánchez', nota: 'Cambio de micas' },
  { fecha: '10 Ene 2024', tipo: 'Primera Vez', doctor: 'Dra. Irina', nota: 'Diagnóstico inicial' },
];

const diagnosticosActivos = ['Miopía Progresiva OD/OI', 'Astigmatismo Miópico', 'Insuficiencia de Convergencia'];

export default function ConsultasPage() {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState<typeof pacientesBusqueda[0] | null>(null);

  const filtered = pacientesBusqueda.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (paciente: typeof pacientesBusqueda[0]) => {
    setSelectedPaciente(paciente);
    setSearch(paciente.nombre);
    setShowDropdown(false);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">NUEVA CONSULTA</h1>
        <p className="mt-0.5 text-sm text-gray-400">
          Registra una nueva atención médica, prescripción de lentes y datos de cobro.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Main form */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* DATOS DEL PACIENTE */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold text-primary-600 uppercase tracking-wider">Datos del Paciente</h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Search */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Buscar Paciente</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); setSelectedPaciente(null); }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Buscar paciente..."
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  {showDropdown && !selectedPaciente && filtered.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                      {filtered.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelect(p)}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', p.color)}>
                            {p.iniciales}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="text-sm font-bold text-gray-900">{p.nombre}</div>
                            <div className="text-xs text-gray-400">{p.telefono} · {p.edad} años</div>
                          </div>
                          <span className="text-xs text-gray-400">{p.diagnostico}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected patient info */}
              {selectedPaciente && (
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Nombre</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPaciente.nombre}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Edad / Sexo</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPaciente.edad} años / {selectedPaciente.sexo === 'M' ? 'Masculino' : 'Femenino'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Aseguradora</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPaciente.seguro}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DATOS DE LA CONSULTA */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold text-primary-600 uppercase tracking-wider">Datos de la Consulta</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Médico Especialista <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar médico</option>
                      <option>Dra. Irina Rostova</option>
                      <option>Dr. Héctor Sánchez</option>
                      <option>Dra. Martha López</option>
                      <option>Dra. Sadia Khan</option>
                      <option>Dr. Luis Morales</option>
                      <option>Dr. Piloto García</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Fecha <span className="text-red-500">*</span></label>
                  <input type="date" defaultValue="2026-01-13" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Hora Inicio <span className="text-red-500">*</span></label>
                  <input type="time" defaultValue="09:00" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Hora Fin <span className="text-red-500">*</span></label>
                  <input type="time" defaultValue="09:45" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Tipo de Consulta <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar especialidad</option>
                      <option>Oftalmología Pediátrica</option>
                      <option>Oftalmología General</option>
                      <option>Cataratas y Cirugía Refractiva</option>
                      <option>Glaucoma y Retina</option>
                      <option>Estrabismo</option>
                      <option>Córnea y Superficie Ocular</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Tipo de Visita <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar tipo</option>
                      <option>Primera Vez</option>
                      <option>Seguimiento Clínico</option>
                      <option>Graduación</option>
                      <option>Control</option>
                      <option>Urgencia</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Diagnóstico Clínico <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Ej. Miopía progresiva bilateral" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Estudios Solicitados</label>
                  <input type="text" placeholder="Ej. Topografía Corneal, Retinografía" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Procedimiento Realizado</label>
                <input type="text" placeholder="Ej. Evaluación refractiva ciclopléjica completa" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
            </div>
          </div>

          {/* DATOS DE COBRO Y FACTURACIÓN */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold text-primary-600 uppercase tracking-wider">Datos de Cobro y Facturación</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Aseguradora Aplicable</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar aseguradora</option>
                      <option>ISSSTECALI</option>
                      <option>JORNADA</option>
                      <option>GNP</option>
                      <option>Seguros Monterrey (Coaseguro 10%)</option>
                      <option>AXA</option>
                      <option>MetLife</option>
                      <option>Particular</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Método de Pago <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>Seleccionar método</option>
                      <option>Efectivo</option>
                      <option>Tarjeta de Crédito</option>
                      <option>Tarjeta de Débito</option>
                      <option>Transferencia Bancaria</option>
                      <option>Cheque</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Moneda <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                      <option>MXN ($)</option>
                      <option>USD ($)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Costo de Consulta <span className="text-red-500">*</span></label>
                  <input type="text" defaultValue="$ 1,200.00" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 pb-4">
            <Link href="/consultas" className="rounded-lg border border-gray-200 bg-white px-8 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
              CANCELAR
            </Link>
            <button className="rounded-lg border border-gray-200 bg-white px-8 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
              GUARDAR BORRADOR
            </button>
            <button className="rounded-lg bg-primary-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
              FINALIZAR CONSULTA
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-[340px] shrink-0 space-y-5">
          {/* Historial reciente */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Historial Reciente</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {historialReciente.map((h, idx) => (
                <div key={idx} className="px-5 py-3 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-extrabold text-primary-700">{h.fecha}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{h.tipo}</span>
                  </div>
                  <p className="text-xs text-gray-500">{h.doctor} · {h.nota}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Diagnósticos activos */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Diagnósticos Activos</h3>
            </div>
            <div className="p-4 space-y-2">
              {diagnosticosActivos.map((d, idx) => (
                <div key={idx} className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                  <p className="text-sm font-bold text-red-700">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
