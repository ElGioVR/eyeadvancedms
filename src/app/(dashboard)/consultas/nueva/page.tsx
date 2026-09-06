'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  AlertTriangle,
  Eye,
  Banknote,
  User,
  Printer,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch } from '@/hooks/useFetch';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { FormInput, FormSelect } from '@/components/ui/FormField';

interface PacienteAPI {
  id: string;
  nombre_completo: string;
  edad: number | null;
  sexo: string | null;
  aseguradora: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

interface DoctorAPI {
  id: string;
  nombre: string;
}

const consultTypeOptions = ['Primera Consulta', 'Consulta de Urgencia', 'Revisión Pre-Operatoria', 'Control Post-Operatorio'];
const visitTypeOptions = ['Primera Vez', 'Visita de Retorno'];
const insuranceOptions = ['Particular', 'ISSSTECALI', 'JORNADA', 'GNP', 'Seguros Monterrey', 'AXA', 'MetLife'];
const paymentMethodOptions = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function getAvatarColor(id: string): string {
  const colors = ['bg-primary-500', 'bg-purple-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500', 'bg-amber-500'];
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function PreviewField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white px-4 py-3', full && 'col-span-2')}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <p className={cn('mt-1 text-sm font-medium text-gray-900', full && 'break-words')}>{value}</p>
    </div>
  );
}

export default function NuevaConsultaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: pacientes, loading: loadingPacientes } = useFetch<PacienteAPI>('/api/pacientes');
  const { data: doctores, loading: loadingDoctores } = useFetch<DoctorAPI>('/api/configuracion/doctores');

  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteAPI | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newPatient, setNewPatient] = useState({
    nombre_completo: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  const [consultationData, setConsultationData] = useState({
    doctorId: '',
    fecha: new Date().toISOString().split('T')[0],
    horaInicio: '10:00',
    horaFin: '10:30',
    tipo: 'Primera Consulta',
    tipoVisita: 'Primera Vez',
    diagnostico: '',
    estudios: '',
    procedimiento: '',
    aseguradora: 'Particular',
    metodoPago: '',
    moneda: 'MXN - Peso Mexicano',
    costo: '',
  });

  const filteredPacientes = useMemo(() => {
    if (!searchPaciente) return pacientes;
    const term = searchPaciente.toLowerCase();
    return pacientes.filter(
      (p) =>
        p.nombre_completo.toLowerCase().includes(term) ||
        (p.email && p.email.toLowerCase().includes(term))
    );
  }, [pacientes, searchPaciente]);

  const doctorSeleccionado = useMemo(
    () => doctores.find((d) => d.id === consultationData.doctorId),
    [doctores, consultationData.doctorId]
  );

  const updateConsultation = useCallback((field: string, value: string) => {
    setConsultationData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!pacienteSeleccionado) {
      setFormError('Debe seleccionar un paciente');
      return;
    }
    if (!consultationData.doctorId) {
      setFormError('Debe seleccionar un doctor');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const studies = consultationData.estudios
        ? consultationData.estudios.split('\n').filter((s) => s.trim())
        : [];

      const res = await fetch('/api/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: pacienteSeleccionado.id,
          doctor_id: consultationData.doctorId,
          fecha: consultationData.fecha,
          hora_inicio: consultationData.horaInicio,
          hora_fin: consultationData.horaFin || null,
          tipo_consulta: consultationData.tipo,
          tipo_visita: consultationData.tipoVisita,
          diagnostico: consultationData.diagnostico,
          estudios: studies,
          procedimiento: consultationData.procedimiento,
          aseguradora: consultationData.aseguradora,
          metodo_pago: consultationData.metodoPago,
          moneda: consultationData.moneda,
          costo: consultationData.costo,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al crear la consulta');
        return;
      }

      toast('Consulta creada exitosamente');
      router.push('/consultas');
    } catch {
      setFormError('Error de conexión con el servidor');
    } finally {
      setSaving(false);
    }
  }, [pacienteSeleccionado, consultationData, toast, router]);

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

      {/* Patient Selector */}
      <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Paciente</label>
          {loadingPacientes ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando pacientes...
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={searchPaciente}
                  onChange={(e) => { setSearchPaciente(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar por nombre..."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                />
                {showDropdown && (
                  <div className="absolute z-50 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {filteredPacientes.length > 0 ? (
                      filteredPacientes.map((p) => {
                        const initials = getInitials(p.nombre_completo);
                        const color = getAvatarColor(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => { setPacienteSeleccionado(p); setSearchPaciente(''); setShowDropdown(false); }}
                            className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                          >
                            <Avatar initials={initials} className={color} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-900 truncate">{p.nombre_completo}</div>
                              <div className="text-xs text-gray-500">{p.edad ? `${p.edad} años` : ''} {p.sexo ? `• ${p.sexo === 'M' ? 'Mujer' : 'Hombre'}` : ''} {p.aseguradora ? `• ${p.aseguradora}` : ''}</div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-400">No se encontraron pacientes</div>
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
                  <Avatar initials={getInitials(pacienteSeleccionado.nombre_completo)} className={getAvatarColor(pacienteSeleccionado.id)} size="sm" />
                  <span className="font-medium text-gray-900">{pacienteSeleccionado.nombre_completo}</span>
                  {pacienteSeleccionado.edad && <span className="hidden sm:inline">{pacienteSeleccionado.edad} años</span>}
                  {pacienteSeleccionado.sexo && <span className="hidden sm:inline">{pacienteSeleccionado.sexo === 'M' ? 'Mujer' : 'Hombre'}</span>}
                  {pacienteSeleccionado.aseguradora && <span className="font-medium text-primary-600">{pacienteSeleccionado.aseguradora}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          {/* Consulta Data */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 ring-1 ring-primary-100">
                <ClipboardList className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Datos de Consulta</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect
                  label="Doctor"
                  required
                  value={consultationData.doctorId}
                  onChange={(v) => updateConsultation('doctorId', v)}
                  options={['', ...doctores.map((d) => d.id)]}
                  displayOptions={['', ...doctores.map((d) => d.nombre)]}
                />
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
                <textarea rows={3} value={consultationData.estudios} onChange={(e) => updateConsultation('estudios', e.target.value)} placeholder="Un estudio por línea..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Procedimientos Aplicados</label>
                <textarea rows={3} value={consultationData.procedimiento} onChange={(e) => updateConsultation('procedimiento', e.target.value)} placeholder="Describa procedimientos realizados..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all" />
              </div>
            </div>
          </div>

          {/* Cobro Data */}
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

          {/* Form Error */}
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{formError}</div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-400">Los campos con <span className="text-red-500">*</span> son obligatorios.</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/consultas" className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</Link>
              <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors">
                <Eye className="h-4 w-4" /> PREVISUALIZAR
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !pacienteSeleccionado || !consultationData.doctorId}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><CheckCircle2 className="h-4 w-4" /> FINALIZAR CONSULTA</>}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[300px] lg:shrink-0 space-y-5">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Resumen</h2>
            </div>
            <div className="px-6 pb-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Paciente</span>
                <span className="font-bold text-gray-900 text-right truncate max-w-[160px]">{pacienteSeleccionado?.nombre_completo || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Doctor</span>
                <span className="font-bold text-gray-900">{doctorSeleccionado?.nombre || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fecha</span>
                <span className="font-bold text-gray-900">{consultationData.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Hora</span>
                <span className="font-bold text-gray-900">{consultationData.horaInicio} - {consultationData.horaFin || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Tipo</span>
                <span className="font-bold text-gray-900">{consultationData.tipo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Costo</span>
                <span className="font-bold text-primary-700">${consultationData.costo || '0.00'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Patient Form */}
      {showNewPatientForm && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
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
              <FormInput label="Nombre completo" required value={newPatient.nombre_completo} onChange={(v) => setNewPatient((p) => ({ ...p, nombre_completo: v }))} placeholder="Nombre del paciente" />
              <FormInput label="Teléfono" value={newPatient.telefono} onChange={(v) => setNewPatient((p) => ({ ...p, telefono: v }))} placeholder="Número de teléfono" />
              <FormInput label="Email" value={newPatient.email} onChange={(v) => setNewPatient((p) => ({ ...p, email: v }))} placeholder="correo@ejemplo.com" type="email" />
              <FormInput label="Dirección" value={newPatient.direccion} onChange={(v) => setNewPatient((p) => ({ ...p, direccion: v }))} placeholder="Dirección del paciente" />
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setShowNewPatientForm(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
              <button
                onClick={async () => {
                  if (!newPatient.nombre_completo.trim()) return;
                  try {
                    const res = await fetch('/api/pacientes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newPatient),
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setPacienteSeleccionado(created);
                      setShowNewPatientForm(false);
                      setNewPatient({ nombre_completo: '', telefono: '', email: '', direccion: '' });
                      toast('Paciente creado exitosamente');
                    }
                  } catch {}
                }}
                disabled={!newPatient.nombre_completo.trim()}
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                GUARDAR Y SELECCIONAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
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
          {pacienteSeleccionado && (
            <div className="rounded-xl bg-gray-50 p-5 ring-1 ring-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <Avatar initials={getInitials(pacienteSeleccionado.nombre_completo)} className={getAvatarColor(pacienteSeleccionado.id)} size="lg" />
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">{pacienteSeleccionado.nombre_completo}</h3>
                  <p className="text-xs text-gray-500">{pacienteSeleccionado.edad ? `${pacienteSeleccionado.edad} años` : ''} {pacienteSeleccionado.sexo ? `• ${pacienteSeleccionado.sexo === 'M' ? 'Mujer' : 'Hombre'}` : ''}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
              <ClipboardList className="h-4 w-4 text-primary-600" /> Datos de Consulta
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <PreviewField label="Doctor" value={doctorSeleccionado?.nombre || '—'} />
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
          <button
            onClick={() => { setShowPreview(false); handleCreate(); }}
            disabled={saving || !pacienteSeleccionado || !consultationData.doctorId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            FINALIZAR CONSULTA
          </button>
        </div>
      </Modal>
    </div>
  );
}
