'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Calendar,
  FileText,
  Activity,
  ClipboardList,
  AlertTriangle,
  Eye,
  Clock,
  Banknote,
  User,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const pacientes = [
  { id: 1, nombre: 'Mateo Rodríguez', iniciales: 'MR', color: 'bg-primary-500', edad: 28, sexo: 'H', aseguradora: 'Seguros Monterrey', sx: '20/25', tipografia: 'Lion' },
  { id: 2, nombre: 'Sofía González', iniciales: 'SG', color: 'bg-purple-500', edad: 35, sexo: 'M', aseguradora: 'Particular', sx: '20/20', tipografia: 'Lion' },
  { id: 3, nombre: 'Carlos Mendoza', iniciales: 'CM', color: 'bg-emerald-500', edad: 52, sexo: 'H', aseguradora: 'AXA', sx: '20/30', tipografia: 'Lion' },
  { id: 4, nombre: 'Lucía Ortiz', iniciales: 'LO', color: 'bg-rose-500', edad: 67, sexo: 'M', aseguradora: 'MetLife', sx: '20/40', tipografia: 'Lion' },
  { id: 5, nombre: 'Roberto Vega', iniciales: 'RV', color: 'bg-sky-500', edad: 45, sexo: 'H', aseguradora: 'ISSSTECALI', sx: '20/20', tipografia: 'Lion' },
];

const doctores = [
  { id: 1, nombre: 'Dra. Irina Pérez' },
  { id: 2, nombre: 'Dr. Bayardo Martínez' },
  { id: 3, nombre: 'Dra. Martha López' },
];

const historico = [
  { id: 'CONS-2026-156', fecha: '05 Sep 2026, 10:30 AM', tipo: 'Seguimiento', doctor: 'Dra. Irina', diagnostico: 'Miopía progresiva', estado: 'Completada', sx: '20/25 OD, 20/30 OI' },
  { id: 'CONS-2026-142', fecha: '28 Ago 2026, 02:15 PM', tipo: 'Primera Vez', doctor: 'Dr. Bayardo', diagnostico: 'Estrabismo', estado: 'Completada', sx: '20/20 OD, 20/20 OI' },
  { id: 'CONS-2026-130', fecha: '20 Ago 2026, 09:00 AM', tipo: 'Graduación', doctor: 'Dra. Martha', diagnostico: 'Miopía', estado: 'Pendiente', sx: '20/30' },
];

export default function NuevaConsultaPage() {
  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacientes[0]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('historial');
  const [consultationData, setConsultationData] = useState({
    doctor: '',
    fecha: '2026-09-05',
    horaInicio: '10:30',
    horaFin: '11:15',
    tipo: 'Consulta de Seguimiento',
    tipoVisita: 'Nueva Visita',
    diagnostico: '',
    estudios: '',
    procedimiento: '',
    aseguradora: 'Seguros Monterrey',
    metodoPago: '',
    moneda: 'MXN',
    costo: '',
  });

  const filteredPacientes = pacientes.filter((p) =>
    p.nombre.toLowerCase().includes(searchPaciente.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/consultas" className="text-xs font-bold text-gray-400 hover:text-primary-600 transition-colors uppercase tracking-wider mb-1 inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Consultas
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">NUEVA CONSULTA</h1>
          <p className="mt-0.5 text-sm text-gray-400">Complete la información de la consulta oftalmológica.</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Patient selector */}
      <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Paciente</label>
          <div className="relative">
            <input
              type="text"
              value={searchPaciente}
              onChange={(e) => { setSearchPaciente(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Buscar por nombre o ID..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
            {showDropdown && filteredPacientes.length > 0 && (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                {filteredPacientes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setPacienteSeleccionado(p); setSearchPaciente(''); setShowDropdown(false); }}
                    className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', p.color)}>
                      {p.iniciales}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{p.nombre}</div>
                      <div className="text-xs text-gray-500">{p.edad} años • {p.sexo} • {p.aseguradora}</div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-md px-2 py-0.5">SX: {p.sx}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {pacienteSeleccionado && !showDropdown && (
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
              <span className="font-medium text-gray-900">{pacienteSeleccionado.nombre}</span>
              <span>{pacienteSeleccionado.edad} años</span>
              <span>{pacienteSeleccionado.sexo === 'H' ? 'Hombre' : 'Mujer'}</span>
              <span className="font-medium text-primary-600">{pacienteSeleccionado.aseguradora}</span>
              <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-600 ring-1 ring-sky-200">SX: {pacienteSeleccionado.sx}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main form */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Datos de Consulta */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 ring-1 ring-primary-100">
                <ClipboardList className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Datos de Consulta</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Doctor <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option value="">Seleccionar doctor</option>
                      {doctores.map((d) => <option key={d.id}>{d.nombre}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Fecha de Consulta</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="date" defaultValue={consultationData.fecha} className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Hora Inicio</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="time" defaultValue={consultationData.horaInicio} className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Hora Fin</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="time" defaultValue={consultationData.horaFin} className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Tipo de Consulta</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option>Consulta de Seguimiento</option>
                      <option>Primera Consulta</option>
                      <option>Consulta de Urgencia</option>
                      <option>Revisión Pre-Operatoria</option>
                      <option>Control Post-Operatorio</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Tipo de Visita</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option>Nueva Visita</option>
                      <option>Visita de Retorno</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Diagnóstico</label>
                <input type="text" placeholder="Escriba el diagnóstico del paciente..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Estudios Sugeridos</label>
                <textarea rows={3} placeholder="Agregue estudios o tratamientos sugeridos..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Procedimientos Aplicados</label>
                <textarea rows={3} placeholder="Describa procedimientos realizados..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
            </div>
          </div>

          {/* Datos de Cobro */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                <Banknote className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Datos de Cobro</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Aseguradora</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option>Particular</option>
                      <option>ISSSTECALI</option>
                      <option>JORNADA</option>
                      <option>GNP</option>
                      <option>Seguros Monterrey</option>
                      <option>AXA</option>
                      <option>MetLife</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Método de Pago</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option>Seleccionar método</option>
                      <option>Efectivo</option>
                      <option>Tarjeta de Crédito</option>
                      <option>Tarjeta de Débito</option>
                      <option>Transferencia</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Moneda</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                      <option>MXN - Peso Mexicano</option>
                      <option>USD - Dólar</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Costo</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                    <input type="text" placeholder="0.00" className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-4 py-2.5 text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-400">Los campos con <span className="text-red-500">*</span> son obligatorios.</span>
            </div>
            <div className="flex gap-3">
              <Link href="/consultas" className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</Link>
              <button className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">GUARDAR BORRADOR</button>
              <button className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">FINALIZAR CONSULTA</button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-[300px] shrink-0 space-y-5">
          {/* Recent history */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Historial Reciente</h2>
            </div>
            <div className="divide-y divide-gray-50 px-6 pb-4">
              {historico.map((h) => (
                <div key={h.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary-600">{h.id}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{h.tipo}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{h.fecha}</p>
                  <p className="mt-0.5 text-xs font-medium text-gray-700">{h.diagnostico}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Active diagnoses */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Activos</h2>
            </div>
            <div className="px-6 pb-4 space-y-2">
              {['Miopía progresiva', 'Estrabismo'].map((diag, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-xs font-medium text-gray-700">{diag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
