'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  FileText,
  Activity,
  ClipboardList,
  AlertTriangle,
  Eye,
  Clock,
  Banknote,
  User,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { pacientesData } from '@/data/pacientes';
import { doctoresData } from '@/data/doctores';
import { useDebounce, useFilteredData } from '@/hooks';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { FormInput, FormSelect } from '@/components/ui/FormField';

const historico = [
  { id: 'CONS-2026-156', fecha: '05 Sep 2026, 10:30 AM', tipo: 'Seguimiento', doctor: 'Dra. Irina', diagnostico: 'Miopía progresiva', estado: 'Completada', sx: '20/25 OD, 20/30 OI' },
  { id: 'CONS-2026-142', fecha: '28 Ago 2026, 02:15 PM', tipo: 'Primera Vez', doctor: 'Dr. Bayardo', diagnostico: 'Estrabismo', estado: 'Completada', sx: '20/20 OD, 20/20 OI' },
  { id: 'CONS-2026-130', fecha: '20 Ago 2026, 09:00 AM', tipo: 'Graduación', doctor: 'Dra. Martha', diagnostico: 'Miopía', estado: 'Pendiente', sx: '20/30' },
];

const consultTypeOptions = ['Primera Consulta', 'Consulta de Urgencia', 'Revisión Pre-Operatoria', 'Control Post-Operatorio'];
const visitTypeOptions = ['Visita de Retorno'];
const insuranceOptions = ['Particular', 'ISSSTECALI', 'JORNADA', 'GNP', 'Seguros Monterrey', 'AXA', 'MetLife'];
const paymentMethodOptions = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'];
const sexoOptions = ['Hombre', 'Mujer'];

function PreviewField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white px-4 py-3', full && 'col-span-2')}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <p className={cn('mt-1 text-sm font-medium text-gray-900', full && 'break-words')}>{value}</p>
    </div>
  );
}

export default function NuevaConsultaPage() {
  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacientesData[0]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatient, setNewPatient] = useState({
    nombre: '',
    edad: '',
    sexo: 'Hombre',
    telefono: '',
    email: '',
    aseguradora: 'Particular',
    direccion: '',
    seguro_medico: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [consultationData, setConsultationData] = useState({
    doctor: '',
    fecha: '2026-09-05',
    horaInicio: '10:30',
    horaFin: '11:15',
    tipo: 'Consulta de Seguimiento',
    tipoVisita: 'Visita de Retorno',
    diagnostico: '',
    estudios: '',
    procedimiento: '',
    aseguradora: 'Particular',
    metodoPago: '',
    moneda: 'MXN - Peso Mexicano',
    costo: '',
  });

  const debouncedSearch = useDebounce(searchPaciente);
  const filteredPacientes = useFilteredData(pacientesData, {
    searchFields: ['nombre'],
    searchTerm: debouncedSearch,
  });

  const updateConsultation = (field: string, value: string) =>
    setConsultationData((prev) => ({ ...prev, [field]: value }));

  const updateNewPatient = (field: string, value: string) =>
    setNewPatient((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="NUEVA CONSULTA"
        subtitle="Complete la información de la consulta oftalmológica."
        backLink={{ href: '/consultas', label: 'Consultas' }}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      />

      <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm">
        {showNewPatientForm ? (
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 ring-1 ring-primary-200">
                  <User className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Nuevo Paciente</h2>
                  <p className="text-xs text-gray-400">Complete los datos para registrar al paciente</p>
                </div>
              </div>
              <button onClick={() => setShowNewPatientForm(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormInput label="Nombre completo" required value={newPatient.nombre} onChange={(v) => updateNewPatient('nombre', v)} placeholder="Nombre del paciente" />
              <FormInput label="Edad" required value={newPatient.edad} onChange={(v) => updateNewPatient('edad', v)} placeholder="Edad" type="number" />
              <FormSelect label="Sexo" required value={newPatient.sexo} onChange={(v) => updateNewPatient('sexo', v)} options={sexoOptions} />
              <FormInput label="Teléfono" value={newPatient.telefono} onChange={(v) => updateNewPatient('telefono', v)} placeholder="Número de teléfono" />
              <FormInput label="Email" value={newPatient.email} onChange={(v) => updateNewPatient('email', v)} placeholder="correo@ejemplo.com" type="email" />
              <FormSelect label="Aseguradora" value={newPatient.aseguradora} onChange={(v) => updateNewPatient('aseguradora', v)} options={insuranceOptions} />
              <FormInput label="Dirección" value={newPatient.direccion} onChange={(v) => updateNewPatient('direccion', v)} placeholder="Dirección del paciente" className="col-span-2" />
              <FormInput label="No. Seguro Médico" value={newPatient.seguro_medico} onChange={(v) => updateNewPatient('seguro_medico', v)} placeholder="Número de póliza o afiliación" className="col-span-2" />
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setShowNewPatientForm(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
              <button
                onClick={() => {
                  const initials = newPatient.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  const colors = ['bg-primary-500', 'bg-purple-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500', 'bg-amber-500'];
                  const randomColor = colors[Math.floor(Math.random() * colors.length)];
                  const created = {
                    id: Date.now(),
                    nombre: newPatient.nombre,
                    iniciales: initials || 'NP',
                    color: randomColor,
                    edad: parseInt(newPatient.edad) || 0,
                    sexo: (newPatient.sexo === 'Hombre' ? 'H' : 'M') as 'H' | 'M',
                    aseguradora: newPatient.aseguradora,
                    sx: '—',
                    tipografia: 'Lion',
                  };
                  setPacienteSeleccionado(created);
                  setShowNewPatientForm(false);
                  setNewPatient({ nombre: '', edad: '', sexo: 'Hombre', telefono: '', email: '', aseguradora: 'Particular', direccion: '', seguro_medico: '' });
                }}
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
              >
                GUARDAR Y SELECCIONAR
              </button>
            </div>
          </div>
        ) : (
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
              {showDropdown && (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  {filteredPacientes.length > 0 ? (
                    filteredPacientes.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setPacienteSeleccionado(p); setSearchPaciente(''); setShowDropdown(false); }}
                        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Avatar initials={p.iniciales} className={p.color} />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">{p.nombre}</div>
                          <div className="text-xs text-gray-500">{p.edad} años • {p.sexo} • {p.aseguradora}</div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-md px-2 py-0.5">SX: {p.sx}</span>
                      </button>
                    ))
                  ) : (
                    <EmptyState icon={User} title="No se encontraron pacientes" />
                  )}
                  <button
                    onClick={() => { setShowNewPatientForm(true); setShowDropdown(false); }}
                    className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left hover:bg-primary-50 transition-colors"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 ring-1 ring-primary-200">
                      <User className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-primary-700">Crear nuevo paciente</div>
                      <div className="text-xs text-primary-400">Agregar paciente no registrado al sistema</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
            {pacienteSeleccionado && !showDropdown && (
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-500">
                <Avatar initials={pacienteSeleccionado.iniciales} className={pacienteSeleccionado.color} size="sm" />
                <span className="font-medium text-gray-900">{pacienteSeleccionado.nombre}</span>
                <span className="hidden sm:inline">{pacienteSeleccionado.edad} años</span>
                <span className="hidden sm:inline">{pacienteSeleccionado.sexo === 'H' ? 'Hombre' : 'Mujer'}</span>
                <span className="font-medium text-primary-600">{pacienteSeleccionado.aseguradora}</span>
                <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-600 ring-1 ring-sky-200">SX: {pacienteSeleccionado.sx}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 ring-1 ring-primary-100">
                <ClipboardList className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Datos de Consulta</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect label="Doctor" required value={consultationData.doctor} onChange={(v) => updateConsultation('doctor', v)} options={['', ...doctoresData.map((d) => d.nombre)]} />
                <FormInput label="Fecha de Consulta" value={consultationData.fecha} onChange={(v) => updateConsultation('fecha', v)} type="date" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormInput label="Hora Inicio" value={consultationData.horaInicio} onChange={(v) => updateConsultation('horaInicio', v)} type="time" />
                <FormInput label="Hora Fin" value={consultationData.horaFin} onChange={(v) => updateConsultation('horaFin', v)} type="time" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect label="Tipo de Consulta" value={consultationData.tipo} onChange={(v) => updateConsultation('tipo', v)} options={consultTypeOptions} />
                <FormSelect label="Tipo de Visita" value={consultationData.tipoVisita} onChange={(v) => updateConsultation('tipoVisita', v)} options={visitTypeOptions} />
              </div>
              <FormInput label="Diagnóstico" value={consultationData.diagnostico} onChange={(v) => updateConsultation('diagnostico', v)} placeholder="Escriba el diagnóstico del paciente..." />
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Estudios Sugeridos</label>
                <textarea rows={3} value={consultationData.estudios} onChange={(e) => updateConsultation('estudios', e.target.value)} placeholder="Agregue estudios o tratamientos sugeridos..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Procedimientos Aplicados</label>
                <textarea rows={3} value={consultationData.procedimiento} onChange={(e) => updateConsultation('procedimiento', e.target.value)} placeholder="Describa procedimientos realizados..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                <Banknote className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Datos de Cobro</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect label="Aseguradora" value={consultationData.aseguradora} onChange={(v) => updateConsultation('aseguradora', v)} options={insuranceOptions} />
                <FormSelect label="Método de Pago" value={consultationData.metodoPago} onChange={(v) => updateConsultation('metodoPago', v)} options={paymentMethodOptions} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect label="Moneda" value={consultationData.moneda} onChange={(v) => updateConsultation('moneda', v)} options={['MXN - Peso Mexicano', 'USD - Dólar']} />
                <FormInput label="Costo" value={consultationData.costo} onChange={(v) => updateConsultation('costo', v)} placeholder="0.00" />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-400">Los campos con <span className="text-red-500">*</span> son obligatorios.</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/consultas" className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</Link>
              <button className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">GUARDAR BORRADOR</button>
              <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors">
                <Eye className="h-4 w-4" /> PREVISUALIZAR
              </button>
              <button className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">FINALIZAR CONSULTA</button>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[300px] lg:shrink-0 space-y-5">
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Activos</h2>
            </div>
            <div className="px-6 pb-4 space-y-2">
              {['Miopía progresiva', 'Estrabismo'].map((diag) => (
                <div key={diag} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-xs font-medium text-gray-700">{diag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} maxWidth="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
            <Eye className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">Vista Previa de Consulta</h2>
            <p className="text-xs text-gray-400">Revise la información antes de finalizar</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-gray-50 p-5 ring-1 ring-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <Avatar initials={pacienteSeleccionado?.iniciales} className={pacienteSeleccionado?.color} size="lg" />
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{pacienteSeleccionado?.nombre}</h3>
                <p className="text-xs text-gray-500">{pacienteSeleccionado?.edad} años • {pacienteSeleccionado?.sexo === 'H' ? 'Hombre' : 'Mujer'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                <span className="text-gray-400">Aseguradora</span>
                <p className="font-bold text-gray-900">{pacienteSeleccionado?.aseguradora}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                <span className="text-gray-400">Agudeza Visual</span>
                <p className="font-bold text-gray-900">{pacienteSeleccionado?.sx}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                <span className="text-gray-400">Tipografía</span>
                <p className="font-bold text-gray-900">{pacienteSeleccionado?.tipografia}</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
              <ClipboardList className="h-4 w-4 text-primary-600" /> Datos de Consulta
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <PreviewField label="Doctor" value={consultationData.doctor || '—'} />
              <PreviewField label="Fecha" value={consultationData.fecha || '—'} />
              <PreviewField label="Hora Inicio" value={consultationData.horaInicio || '—'} />
              <PreviewField label="Hora Fin" value={consultationData.horaFin || '—'} />
              <PreviewField label="Tipo de Consulta" value={consultationData.tipo || '—'} />
              <PreviewField label="Tipo de Visita" value={consultationData.tipoVisita || '—'} />
            </div>
            <div className="mt-3 space-y-3">
              <PreviewField label="Diagnóstico" value={consultationData.diagnostico || 'No especificado'} full />
              <PreviewField label="Estudios Sugeridos" value={consultationData.estudios || 'Ninguno'} full />
              <PreviewField label="Procedimientos" value={consultationData.procedimiento || 'Ninguno'} full />
            </div>
          </div>

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
              <Banknote className="h-4 w-4 text-amber-600" /> Datos de Cobro
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <PreviewField label="Aseguradora" value={consultationData.aseguradora || '—'} />
              <PreviewField label="Método de Pago" value={consultationData.metodoPago || 'No seleccionado'} />
              <PreviewField label="Moneda" value={consultationData.moneda || '—'} />
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo</span>
                <p className="mt-1 text-lg font-extrabold text-primary-700">${consultationData.costo || '0.00'} <span className="text-xs font-bold text-gray-400">{consultationData.moneda === 'USD - Dólar' ? 'USD' : 'MXN'}</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 mt-6 pt-5">
          <button onClick={() => setShowPreview(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CERRAR</button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            <Printer className="h-4 w-4" /> IMPRIMIR
          </button>
          <button className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">FINALIZAR CONSULTA</button>
        </div>
      </Modal>
    </div>
  );
}
