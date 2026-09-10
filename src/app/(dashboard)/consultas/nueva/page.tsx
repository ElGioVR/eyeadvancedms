'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import Skeleton from '@/components/ui/Skeleton';

interface PacienteAPI {
  id: string;
  nombre: string;
  nombre_completo?: string;
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

interface MatrizCosto {
  id: string;
  tipo_consulta: string;
  tipo_visita: string;
  costo: number;
  descripcion: string | null;
  activo: boolean;
}

interface CatalogoEstudio {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  bilateral: boolean;
  activo: boolean;
}

interface CatalogoProcedimiento {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  por_ojo: boolean;
  activo: boolean;
}

interface EstudioSeleccionado {
  id: string;
  mismoDoctor: boolean;
  doctorId?: string;
}

interface ProcedimientoSeleccionado {
  id: string;
  motivo?: string;
  mismoDoctor: boolean;
  doctorId?: string;
}

const consultTypeOptions = ['Primera Consulta', 'Consulta de Urgencia', 'Revisión Pre-Operatoria', 'Control Post-Operatorio'];
const visitTypeOptions = ['Primera Vez', 'Visita de Retorno'];
const insuranceOptions = ['Particular', 'ISSSTECALI', 'JORNADA', 'GNP', 'Seguros Monterrey', 'AXA', 'MetLife'];
const paymentMethodOptions = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'];

const TIPO_CONSULTA_MAP: Record<string, string> = {
  'Primera Consulta': 'CONSULTA',
  'Consulta de Urgencia': 'CONSULTA',
  'Revisión Pre-Operatoria': 'REVISION',
  'Control Post-Operatorio': 'REVISION',
};

const TIPO_VISITA_MAP: Record<string, string> = {
  'Primera Vez': 'PRIMERA_VEZ',
  'Visita de Retorno': 'SUBSECUENTE',
};

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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
  const [matrizCostos, setMatrizCostos] = useState<MatrizCosto[]>([]);
  const [catalogoEstudios, setCatalogoEstudios] = useState<CatalogoEstudio[]>([]);
  const [catalogoProcedimientos, setCatalogoProcedimientos] = useState<CatalogoProcedimiento[]>([]);
  const [estudiosSeleccionados, setEstudiosSeleccionados] = useState<EstudioSeleccionado[]>([]);
  const [procedimientosSeleccionados, setProcedimientosSeleccionados] = useState<ProcedimientoSeleccionado[]>([]);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/configuracion/matriz-costos')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMatrizCostos(data); })
      .catch(() => {});
    fetch('/api/configuracion/catalogo-estudios')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCatalogoEstudios(data); })
      .catch(() => {});
    fetch('/api/configuracion/catalogo-procedimientos')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCatalogoProcedimientos(data); })
      .catch(() => {});
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then((r) => r.json())
      .then((data) => { if (data?.rates?.MXN) setTipoCambio(data.rates.MXN); })
      .catch(() => {});
  }, []);

  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteAPI | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newPatient, setNewPatient] = useState({
    nombre_completo: '',
    sexo: 'H',
    fecha_nacimiento: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  const [consultationData, setConsultationData] = useState({
    doctorId: '',
    fecha: '',
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

  useEffect(() => {
    setConsultationData((prev) => prev.fecha ? prev : { ...prev, fecha: new Date().toISOString().split('T')[0] });
  }, []);

  const esUSD = consultationData.moneda === 'USD - Dólar';
  const convertir = useCallback((montoMXN: number) => {
    if (!esUSD || !tipoCambio) return montoMXN;
    return montoMXN / tipoCambio;
  }, [esUSD, tipoCambio]);

  const filteredPacientes = useMemo(() => {
    if (!searchPaciente) return pacientes;
    const term = searchPaciente.toLowerCase();
    return pacientes.filter(
      (p) =>
        (p.nombre || '').toLowerCase().includes(term) ||
        (p.email && p.email.toLowerCase().includes(term))
    );
  }, [pacientes, searchPaciente]);

  const [searchEstudio, setSearchEstudio] = useState('');
  const [showEstudioDropdown, setShowEstudioDropdown] = useState(false);
  const [searchProcedimiento, setSearchProcedimiento] = useState('');
  const [showProcedimientoDropdown, setShowProcedimientoDropdown] = useState(false);

  const filteredEstudios = useMemo(() => {
    const activos = catalogoEstudios.filter((e) => e.activo);
    if (!searchEstudio) return activos;
    const term = searchEstudio.toLowerCase();
    return activos.filter((e) => e.nombre.toLowerCase().includes(term));
  }, [catalogoEstudios, searchEstudio]);

  const filteredProcedimientos = useMemo(() => {
    const activos = catalogoProcedimientos.filter((p) => p.activo);
    if (!searchProcedimiento) return activos;
    const term = searchProcedimiento.toLowerCase();
    return activos.filter((p) => p.nombre.toLowerCase().includes(term));
  }, [catalogoProcedimientos, searchProcedimiento]);

  const estudioInputRef = useRef<HTMLDivElement>(null);
  const procedimientoInputRef = useRef<HTMLDivElement>(null);
  const [estudioDropdownPos, setEstudioDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [procDropdownPos, setProcDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (showEstudioDropdown && estudioInputRef.current) {
      const updatePos = () => {
        if (estudioInputRef.current) {
          const r = estudioInputRef.current.getBoundingClientRect();
          setEstudioDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
      };
      updatePos();
      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
      return () => {
        window.removeEventListener('scroll', updatePos, true);
        window.removeEventListener('resize', updatePos);
      };
    }
  }, [showEstudioDropdown]);

  useEffect(() => {
    if (showProcedimientoDropdown && procedimientoInputRef.current) {
      const updatePos = () => {
        if (procedimientoInputRef.current) {
          const r = procedimientoInputRef.current.getBoundingClientRect();
          setProcDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
      };
      updatePos();
      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
      return () => {
        window.removeEventListener('scroll', updatePos, true);
        window.removeEventListener('resize', updatePos);
      };
    }
  }, [showProcedimientoDropdown]);

  const doctorSeleccionado = useMemo(
    () => doctores.find((d) => d.id === consultationData.doctorId),
    [doctores, consultationData.doctorId]
  );

  const calcularCosto = useCallback((tipo: string, tipoVisita: string) => {
    const tipoMatrix = TIPO_CONSULTA_MAP[tipo];
    const visitaMatrix = TIPO_VISITA_MAP[tipoVisita];
    if (!tipoMatrix || !visitaMatrix) return 0;
    const match = matrizCostos.find(
      (c) => c.tipo_consulta === tipoMatrix && c.tipo_visita === visitaMatrix && c.activo
    );
    return match ? match.costo : 0;
  }, [matrizCostos]);

  const costoTotal = useMemo(() => {
    const base = calcularCosto(consultationData.tipo, consultationData.tipoVisita);
    const costosEstudios = estudiosSeleccionados.reduce((sum, e) => {
      const estudio = catalogoEstudios.find((c) => c.id === e.id);
      return sum + (estudio ? estudio.costo : 0);
    }, 0);
    const costosProcs = procedimientosSeleccionados.reduce((sum, p) => {
      const proc = catalogoProcedimientos.find((c) => c.id === p.id);
      return sum + (proc ? proc.costo : 0);
    }, 0);
    return base + costosEstudios + costosProcs;
  }, [calcularCosto, consultationData.tipo, consultationData.tipoVisita, estudiosSeleccionados, procedimientosSeleccionados, catalogoEstudios, catalogoProcedimientos]);

  const addEstudio = useCallback((id: string) => {
    if (estudiosSeleccionados.length >= 3) return;
    if (estudiosSeleccionados.find((e) => e.id === id)) return;
    setEstudiosSeleccionados((prev) => [...prev, { id, mismoDoctor: true }]);
    setSearchEstudio('');
    setShowEstudioDropdown(false);
  }, [estudiosSeleccionados]);

  const removeEstudio = useCallback((index: number) => {
    setEstudiosSeleccionados((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleMismoDoctor = useCallback((index: number) => {
    setEstudiosSeleccionados((prev) =>
      prev.map((e, i) => (i === index ? { ...e, mismoDoctor: !e.mismoDoctor, doctorId: undefined } : e))
    );
  }, []);

  const setEstudioDoctor = useCallback((index: number, doctorId: string) => {
    setEstudiosSeleccionados((prev) =>
      prev.map((e, i) => (i === index ? { ...e, doctorId } : e))
    );
  }, []);

  const [procedimientoMotivo, setProcedimientoMotivo] = useState('');

  const addProcedimiento = useCallback((id: string, motivo?: string) => {
    if (procedimientosSeleccionados.find((p) => p.id === id)) return;
    setProcedimientosSeleccionados((prev) => [...prev, { id, motivo, mismoDoctor: true }]);
    setSearchProcedimiento('');
    setShowProcedimientoDropdown(false);
    setProcedimientoMotivo('');
    setAgregarOtroProcedimiento(false);
  }, [procedimientosSeleccionados]);

  const removeProcedimiento = useCallback((index: number) => {
    setProcedimientosSeleccionados((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleMismoDoctorProc = useCallback((index: number) => {
    setProcedimientosSeleccionados((prev) =>
      prev.map((p, i) => (i === index ? { ...p, mismoDoctor: !p.mismoDoctor, doctorId: undefined } : p))
    );
  }, []);

  const setProcedimientoDoctor = useCallback((index: number, doctorId: string) => {
    setProcedimientosSeleccionados((prev) =>
      prev.map((p, i) => (i === index ? { ...p, doctorId } : p))
    );
  }, []);

  const [agregarOtroProcedimiento, setAgregarOtroProcedimiento] = useState(false);

  const updateConsultation = useCallback((field: string, value: string) => {
    setConsultationData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }, []);

  useEffect(() => {
    if (matrizCostos.length > 0) {
      setConsultationData((prev) => ({ ...prev, costo: '' }));
    }
  }, [matrizCostos]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-estudio-dropdown]') && !target.closest('[data-estudio-portal]')) {
        setShowEstudioDropdown(false);
      }
      if (!target.closest('[data-procedimiento-dropdown]') && !target.closest('[data-procedimiento-portal]')) {
        setShowProcedimientoDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      const estudiosData = estudiosSeleccionados.map((e) => {
        const estudio = catalogoEstudios.find((c) => c.id === e.id);
        return estudio?.nombre || '';
      });

      const procedimientosData = procedimientosSeleccionados.map((p) => {
        const proc = catalogoProcedimientos.find((c) => c.id === p.id);
        return proc?.nombre || '';
      });

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
          estudios: estudiosData,
          procedimiento: procedimientosData.length > 0 ? procedimientosData.join(', ') : null,
          aseguradora: consultationData.aseguradora,
          metodo_pago: consultationData.metodoPago,
          moneda: consultationData.moneda,
          costo: costoTotal,
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
  }, [pacienteSeleccionado, consultationData, toast, router, estudiosSeleccionados, procedimientosSeleccionados, catalogoEstudios, catalogoProcedimientos, calcularCosto, costoTotal]);

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
            <Skeleton className="h-12 w-full rounded-lg" />
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

              {/* New Patient Form — inline below search */}
              {showNewPatientForm && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 ring-1 ring-primary-200">
                        <User className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Nuevo Paciente</h2>
                        <p className="text-xs text-gray-400">Complete los datos para registrar al paciente</p>
                      </div>
                    </div>
                    <button onClick={() => setShowNewPatientForm(false)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="Nombre completo" required value={newPatient.nombre_completo} onChange={(v) => setNewPatient((p) => ({ ...p, nombre_completo: v }))} placeholder="Nombre del paciente" />
                    <FormSelect label="Sexo" required value={newPatient.sexo} onChange={(v) => setNewPatient((p) => ({ ...p, sexo: v }))} options={['H', 'M']} displayOptions={['Hombre', 'Mujer']} />
                    <FormInput label="Fecha de nacimiento" required value={newPatient.fecha_nacimiento} onChange={(v) => setNewPatient((p) => ({ ...p, fecha_nacimiento: v }))} type="date" />
                    <FormInput label="Teléfono" value={newPatient.telefono} onChange={(v) => setNewPatient((p) => ({ ...p, telefono: v }))} placeholder="Número de teléfono" />
                    <FormInput label="Email" value={newPatient.email} onChange={(v) => setNewPatient((p) => ({ ...p, email: v }))} placeholder="correo@ejemplo.com" type="email" />
                    <FormInput label="Dirección" value={newPatient.direccion} onChange={(v) => setNewPatient((p) => ({ ...p, direccion: v }))} placeholder="Dirección del paciente" />
                  </div>
                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
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
                            setNewPatient({ nombre_completo: '', sexo: 'H', fecha_nacimiento: '', telefono: '', email: '', direccion: '' });
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
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Estudios</label>
                <div className="space-y-3">
                  {estudiosSeleccionados.map((estudio, index) => {
                    const cat = catalogoEstudios.find((c) => c.id === estudio.id);
                    return (
                      <div key={index} className="rounded-lg border border-primary-200 bg-primary-50 p-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Estudio</span>
                              <span className="text-sm font-bold text-gray-900 truncate">{cat?.nombre || 'Desconocido'}</span>
                            </div>
                            <span className="text-xs text-gray-500">${convertir(cat?.costo || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEstudio(index)}
                            className="shrink-0 rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={estudio.mismoDoctor}
                                onChange={() => toggleMismoDoctor(index)}
                                className="peer sr-only"
                              />
                              <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-primary-600 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                            </div>
                            <span className="text-xs font-medium text-gray-700">Mismo doctor de la consulta</span>
                          </label>
                          {!estudio.mismoDoctor && (
                            <select
                              value={estudio.doctorId || ''}
                              onChange={(e) => setEstudioDoctor(index, e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                            >
                              <option value="">Seleccionar doctor...</option>
                              {doctores.map((d) => (
                                <option key={d.id} value={d.id}>{d.nombre}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {estudiosSeleccionados.length < 3 && (
                    <div className="relative" ref={estudioInputRef} data-estudio-dropdown>
                      <input
                        type="text"
                        value={searchEstudio}
                        onChange={(e) => { setSearchEstudio(e.target.value); setShowEstudioDropdown(true); }}
                        onFocus={() => setShowEstudioDropdown(true)}
                        placeholder="Buscar estudio..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                      />
                      {showEstudioDropdown && createPortal(
                        <div
                          data-estudio-portal
                          className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                          style={{ top: estudioDropdownPos.top, left: estudioDropdownPos.left, width: estudioDropdownPos.width }}
                        >
                          {filteredEstudios.length > 0 ? (
                            filteredEstudios
                              .filter((e) => !estudiosSeleccionados.find((s) => s.id === e.id))
                              .map((e) => (
                                <button
                                  key={e.id}
                                  type="button"
                                  onClick={() => addEstudio(e.id)}
                                  className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                >
                                  <span className="text-sm font-medium text-gray-900 truncate">{e.nombre}</span>
                                  <span className="ml-2 shrink-0 text-xs font-bold text-gray-500">${convertir(e.costo).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </button>
                              ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-400">No se encontraron resultados</div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setShowEstudioDropdown(false); setSearchEstudio(''); }}
                            className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50"
                          >
                            Cerrar
                          </button>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}

                  {estudiosSeleccionados.length >= 3 && (
                    <p className="text-xs text-gray-400">Máximo 3 estudios alcanzado</p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Procedimientos</label>
                <div className="space-y-3">
                  {procedimientosSeleccionados.map((proc, index) => {
                    const cat = catalogoProcedimientos.find((c) => c.id === proc.id);
                    return (
                      <div key={index} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Procedimiento</span>
                              <span className="text-sm font-bold text-gray-900 truncate">{cat?.nombre || 'Desconocido'}</span>
                            </div>
                            <span className="text-xs text-gray-500">${convertir(cat?.costo || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProcedimiento(index)}
                            className="shrink-0 rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={proc.mismoDoctor}
                                onChange={() => toggleMismoDoctorProc(index)}
                                className="peer sr-only"
                              />
                              <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-primary-600 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                            </div>
                            <span className="text-xs font-medium text-gray-700">Mismo doctor de la consulta</span>
                          </label>
                          {!proc.mismoDoctor && (
                            <select
                              value={proc.doctorId || ''}
                              onChange={(e) => setProcedimientoDoctor(index, e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                            >
                              <option value="">Seleccionar doctor...</option>
                              {doctores.map((d) => (
                                <option key={d.id} value={d.id}>{d.nombre}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        {proc.motivo && (
                          <p className="text-xs text-gray-500 italic">Motivo: {proc.motivo}</p>
                        )}
                      </div>
                    );
                  })}

                  {procedimientosSeleccionados.length === 0 && (
                    <div className="relative" ref={procedimientoInputRef} data-procedimiento-dropdown>
                      <input
                        type="text"
                        value={searchProcedimiento}
                        onChange={(e) => { setSearchProcedimiento(e.target.value); setShowProcedimientoDropdown(true); }}
                        onFocus={() => setShowProcedimientoDropdown(true)}
                        placeholder="Buscar procedimiento..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                      />
                      {showProcedimientoDropdown && createPortal(
                        <div
                          data-procedimiento-portal
                          className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                          style={{ top: procDropdownPos.top, left: procDropdownPos.left, width: procDropdownPos.width }}
                        >
                          {filteredProcedimientos.length > 0 ? (
                            filteredProcedimientos.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => addProcedimiento(p.id)}
                                className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                              >
                                <span className="text-sm font-medium text-gray-900 truncate">{p.nombre}</span>
                                <span className="ml-2 shrink-0 text-xs font-bold text-gray-500">${convertir(p.costo).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-400">No se encontraron resultados</div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setShowProcedimientoDropdown(false); setSearchProcedimiento(''); }}
                            className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50"
                          >
                            Cerrar
                          </button>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}

                  {procedimientosSeleccionados.length >= 1 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agregarOtroProcedimiento}
                        onChange={(e) => { setAgregarOtroProcedimiento(e.target.checked); if (!e.target.checked) { setSearchProcedimiento(''); setShowProcedimientoDropdown(false); setProcedimientoMotivo(''); } }}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Agregar otro procedimiento</span>
                    </label>
                  )}

                  {agregarOtroProcedimiento && procedimientosSeleccionados.length >= 1 && (
                    <div className="space-y-2">
                      <textarea
                        value={procedimientoMotivo}
                        onChange={(e) => setProcedimientoMotivo(e.target.value)}
                        placeholder="Motivo para agregar otro procedimiento..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
                      />
                      {procedimientoMotivo.trim() && (
                        <div className="relative" ref={procedimientoInputRef} data-procedimiento-dropdown>
                          <input
                            type="text"
                            value={searchProcedimiento}
                            onChange={(e) => { setSearchProcedimiento(e.target.value); setShowProcedimientoDropdown(true); }}
                            onFocus={() => setShowProcedimientoDropdown(true)}
                            placeholder="Buscar otro procedimiento..."
                            className="w-full rounded-lg border border-primary-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                          />
                          {showProcedimientoDropdown && createPortal(
                            <div
                              data-procedimiento-portal
                              className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                              style={{ top: procDropdownPos.top, left: procDropdownPos.left, width: procDropdownPos.width }}
                            >
                              {filteredProcedimientos.length > 0 ? (
                                filteredProcedimientos
                                  .filter((p) => !procedimientosSeleccionados.find((s) => s.id === p.id))
                                  .map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => addProcedimiento(p.id, procedimientoMotivo.trim())}
                                      className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                    >
                                      <span className="text-sm font-medium text-gray-900 truncate">{p.nombre}</span>
                                      <span className="ml-2 shrink-0 text-xs font-bold text-gray-500">${convertir(p.costo).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </button>
                                  ))
                              ) : (
                                <div className="px-4 py-3 text-sm text-gray-400">No se encontraron resultados</div>
                              )}
                              <button
                                type="button"
                                onClick={() => { setShowProcedimientoDropdown(false); setSearchProcedimiento(''); }}
                                className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50"
                              >
                                Cerrar
                              </button>
                            </div>,
                            document.body
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
              <FormSelect label="Moneda" value={consultationData.moneda} onChange={(v) => updateConsultation('moneda', v)} options={['MXN - Peso Mexicano', 'USD - Dólar']} />
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Costo base (matriz):</span>
                  <span className="font-bold text-gray-900">${convertir(calcularCosto(consultationData.tipo, consultationData.tipoVisita)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {estudiosSeleccionados.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Estudios ({estudiosSeleccionados.length}):</span>
                    <span className="font-bold text-gray-900">
                      ${convertir(estudiosSeleccionados.reduce((sum, e) => {
                        const estudio = catalogoEstudios.find((c) => c.id === e.id);
                        return sum + (estudio ? estudio.costo : 0);
                      }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {procedimientosSeleccionados.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Procedimientos ({procedimientosSeleccionados.length}):</span>
                    <span className="font-bold text-gray-900">
                      ${convertir(procedimientosSeleccionados.reduce((sum, p) => {
                        const proc = catalogoProcedimientos.find((c) => c.id === p.id);
                        return sum + (proc ? proc.costo : 0);
                      }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {esUSD && tipoCambio && (
                  <div className="text-[10px] text-gray-400 text-right">Tipo de cambio: 1 USD = {tipoCambio.toFixed(2)} MXN</div>
                )}
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-bold text-gray-900">Total:</span>
                  <span className="text-lg font-extrabold text-primary-700">${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-gray-400">{esUSD ? 'USD' : 'MXN'}</span></span>
                </div>
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
        <div className="w-full lg:w-[300px] lg:shrink-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
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
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Base:</span>
                  <span className="font-bold text-gray-900">${convertir(calcularCosto(consultationData.tipo, consultationData.tipoVisita)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {estudiosSeleccionados.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estudios:</span>
                    <span className="font-bold text-gray-900">
                      ${convertir(estudiosSeleccionados.reduce((sum, e) => {
                        const estudio = catalogoEstudios.find((c) => c.id === e.id);
                        return sum + (estudio ? estudio.costo : 0);
                      }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {procedimientosSeleccionados.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Procs:</span>
                    <span className="font-bold text-gray-900">
                      ${convertir(procedimientosSeleccionados.reduce((sum, p) => {
                        const proc = catalogoProcedimientos.find((c) => c.id === p.id);
                        return sum + (proc ? proc.costo : 0);
                      }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-1">
                  <span className="text-gray-400">Total:</span>
                  <span className="font-extrabold text-primary-700">${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] font-bold text-gray-400">{esUSD ? 'USD' : 'MXN'}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estudios</span>
                {estudiosSeleccionados.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-500">Ninguno</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {estudiosSeleccionados.map((e, index) => {
                      const cat = catalogoEstudios.find((c) => c.id === e.id);
                      const doctorName = e.mismoDoctor
                        ? doctorSeleccionado?.nombre
                        : doctores.find((d) => d.id === e.doctorId)?.nombre;
                      return (
                        <li key={index} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900">{cat?.nombre}</span>
                            {doctorName && <span className="text-[10px] text-gray-400">({doctorName})</span>}
                          </div>
                          <span className="font-bold text-gray-900">${convertir(cat?.costo || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Procedimientos</span>
                {procedimientosSeleccionados.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-500">Ninguno</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {procedimientosSeleccionados.map((p, index) => {
                      const cat = catalogoProcedimientos.find((c) => c.id === p.id);
                      return (
                        <li key={index} className="flex justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900">{cat?.nombre}</span>
                            {p.motivo && <span className="text-[10px] text-gray-400 italic">({p.motivo})</span>}
                          </div>
                          <span className="font-bold text-gray-900">${convertir(cat?.costo || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900">
              <Banknote className="h-4 w-4 text-amber-600" /> Datos de Cobro
            </h4>
            <div className="space-y-3 text-sm">
              <PreviewField label="Aseguradora" value={consultationData.aseguradora || '—'} />
              <PreviewField label="Método de Pago" value={consultationData.metodoPago || 'No seleccionado'} />
              <PreviewField label="Moneda" value={consultationData.moneda || '—'} />
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo Total</span>
                <p className="mt-1 text-lg font-extrabold text-primary-700">
                  ${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-gray-400">{esUSD ? 'USD' : 'MXN'}</span>
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Base:</span>
                    <span className="text-gray-900">${convertir(calcularCosto(consultationData.tipo, consultationData.tipoVisita)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {estudiosSeleccionados.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Estudios:</span>
                      <span className="text-gray-900">
                        ${convertir(estudiosSeleccionados.reduce((sum, e) => {
                          const estudio = catalogoEstudios.find((c) => c.id === e.id);
                          return sum + (estudio ? estudio.costo : 0);
                        }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {procedimientosSeleccionados.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Procedimientos:</span>
                      <span className="text-gray-900">
                        ${convertir(procedimientosSeleccionados.reduce((sum, p) => {
                          const proc = catalogoProcedimientos.find((c) => c.id === p.id);
                          return sum + (proc ? proc.costo : 0);
                        }, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
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
