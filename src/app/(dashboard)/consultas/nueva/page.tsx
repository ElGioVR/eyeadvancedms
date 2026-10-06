'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useInvalidar, useFetch } from '@/hooks/useFetch';
import { PacienteAPI, DoctorAPI, MatrizCosto, CatalogoConsulta, CatalogoEstudio, CatalogoProcedimiento, ServicioPaciente, EstudioSeleccionado, ProcedimientoSeleccionado, AseguranzaAPI, addMinutesToTime, PacienteDetalleAPI, normalizarPacienteDetalle, DRAFT_STORAGE_KEY, timeToMinutes, BusquedaPacienteResult, TIPO_CONSULTA_MAP, TIPO_VISITA_MAP, getInitials, getAvatarColor, validarNuevoPaciente, paymentMethodOptions, PreviewField } from '@/components/consultations/nueva-consulta-comun';
import { useMemo, useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { esMedicoTratante, esAnestesiologo } from '@/lib/catalogos/personal';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { type TelefonoPaciente, normalizarTelefonos, telefonoPrincipal } from '@/lib/telefonos-paciente';
import { deMinutos, DURACION_CITA_MIN } from '@/lib/agenda-slots';
import { opcionTipoConsulta, TIPOS_CONSULTA_AGENDA } from '@/lib/catalogos/tipos-consulta';
import { fetchJSON, nuevaClaveIdempotencia, enviarJSON, mensajeDeError, ApiError } from '@/lib/fetcher';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { CADUCIDAD_BORRADOR_MS } from '@/lib/borradores';
import { useDebounce } from '@/hooks/useDebounce';
import useSWR from 'swr';
import PageHeader from '@/components/ui/PageHeader';
import { Printer, User, Loader2, ClipboardList, Banknote, AlertTriangle, Eye, CheckCircle2 } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import Avatar from '@/components/ui/Avatar';
import { FormInput, FormSelect } from '@/components/ui/FormField';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import SelectorHoraSlot from '@/components/agenda/SelectorHoraSlot';
import BuscadorDiagnosticoCIE10 from '@/components/diagnosticos/BuscadorDiagnosticoCIE10';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import Modal from '@/components/ui/Modal';

function NuevaConsultaContent() {
  const router = useRouter();
  const { toast } = useToast();
  const invalidar = useInvalidar();
  // Primera página (pacientes recientes): misma URL que la precarga de /bienvenida.
  const { data: pacientes, loading: loadingPacientes } = useFetch<PacienteAPI>('/api/pacientes', { page: '1', pageSize: '15' });
  const { data: doctoresRaw, loading: loadingDoctores } = useFetch<DoctorAPI>('/api/configuracion/doctores');
  // El API devuelve `alias` (nombre de presentación) y `nombre` (nombre real, puede ser null).
  const doctores = useMemo(
    () => doctoresRaw.map((d) => ({ ...d, nombre: d.alias || d.nombre || d.id })),
    [doctoresRaw],
  );
  // Personal unificado: médicos para consultas y procedimientos; enfermería con
  // honorarios activos también puede realizar estudios (y consultas tipo Estudios).
  // Anestesiólogos fuera: solo ejercen la anestesia en cirugías.
  const medicos = useMemo(() => doctores.filter(esMedicoTratante), [doctores]);
  const personalEstudios = useMemo(
    () => doctores.filter((d) => !esAnestesiologo(d) && (d.tipo_personal !== 'ENFERMERO' || d.cobra_honorarios !== false)),
    [doctores],
  );
  const { data: matrizCostos } = useFetch<MatrizCosto>('/api/configuracion/matriz-costos');
  const { especialidades } = useEspecialidades();
  const [catalogoConsultas, setCatalogoConsultas] = useState<CatalogoConsulta[]>([]);
  const [catalogoEstudios, setCatalogoEstudios] = useState<CatalogoEstudio[]>([]);
  const [catalogoProcedimientos, setCatalogoProcedimientos] = useState<CatalogoProcedimiento[]>([]);
  const [serviciosPaciente, setServiciosPaciente] = useState<ServicioPaciente[]>([]);
  const [estudiosSeleccionados, setEstudiosSeleccionados] = useState<EstudioSeleccionado[]>([]);
  const [procedimientosSeleccionados, setProcedimientosSeleccionados] = useState<ProcedimientoSeleccionado[]>([]);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const { data: aseguranzas } = useFetch<AseguranzaAPI>('/api/configuracion/aseguranzas');
  const [editingMontos, setEditingMontos] = useState(false);
  const [costoBaseEdit, setCostoBaseEdit] = useState<string>('');
  const [costosEstudiosEdit, setCostosEstudiosEdit] = useState<Record<number, string>>({});
  const [costosProcsEdit, setCostosProcsEdit] = useState<Record<number, string>>({});

  // Ignora respuestas fuera de orden si el origen cambia rápido.
  const serviciosReqRef = useRef(0);
  const cargarServiciosOrigen = useCallback(async (origenId: string | null) => {
    const reqId = ++serviciosReqRef.current;
    if (!origenId) {
      setServiciosPaciente([]);
      setCatalogoConsultas([]);
      setCatalogoEstudios([]);
      setCatalogoProcedimientos([]);
      return;
    }

    try {
      const res = await fetch(`/api/catalogo-servicios?aseguranza_id=${encodeURIComponent(origenId)}`);
      if (reqId !== serviciosReqRef.current) return;
      if (!res.ok) {
        setServiciosPaciente([]);
        setCatalogoConsultas([]);
        setCatalogoEstudios([]);
        setCatalogoProcedimientos([]);
        return;
      }
      const data = await res.json();
      if (reqId !== serviciosReqRef.current) return;
      const servicios = (Array.isArray(data?.servicios) ? data.servicios : []) as ServicioPaciente[];
      setServiciosPaciente(servicios);
      setCatalogoConsultas(
        servicios
          .filter((s) => s.tipo === 'CONSULTA')
          .map((s) => ({ id: s.id, nombre: s.nombre, descripcion: null, costo: s.costo ?? 0, activo: true }))
      );
      setCatalogoEstudios(
        servicios
          .filter((s) => s.tipo === 'ESTUDIO')
          .map((s) => ({ id: s.id, nombre: s.nombre, descripcion: null, costo: s.costo ?? 0, bilateral: false, activo: true }))
      );
      setCatalogoProcedimientos(
        servicios
          .filter((s) => s.tipo === 'PROCEDIMIENTO')
          .map((s) => ({ id: s.id, nombre: s.nombre, descripcion: null, costo: s.costo ?? 0, por_ojo: false, activo: true }))
      );
    } catch {
      if (reqId !== serviciosReqRef.current) return;
      setServiciosPaciente([]);
      setCatalogoConsultas([]);
      setCatalogoEstudios([]);
      setCatalogoProcedimientos([]);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => { if (data?.rates?.MXN) setTipoCambio(data.rates.MXN); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteAPI | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [savingPaciente, setSavingPaciente] = useState(false);
  const [newPatientError, setNewPatientError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExitDraftModal, setShowExitDraftModal] = useState(false);
  const [pendingExitHref, setPendingExitHref] = useState<string | null>(null);
  const [pendingExitAction, setPendingExitAction] = useState<'navigate' | 'reload'>('navigate');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Misma clave en reintentos del mismo envío → el servidor no duplica la consulta. */
  const claveEnvioRef = useRef<string | null>(null);
  /** Tras crear la consulta ya no se autoguarda (evita revivir un borrador ya guardado). */
  const consultaGuardadaRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const initialDraftSignature = useRef<string | null>(null);
  const initialDraftState = useRef<Record<string, unknown> | null>(null);

  const [newPatient, setNewPatient] = useState({
    nombre_completo: '',
    sexo: 'H',
    fecha_nacimiento: '',
    telefono: '',
    email: '',
    direccion: '',
    numero_expediente: '',
    telefonos: [] as TelefonoPaciente[],
  });

  interface ConsultationForm {
    doctorId: string;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    tipo: string;
    tipoVisita: string;
    /** Punto II: Primera consulta / Subsecuente / Estudios / Procedimientos. */
    tipoAgenda: string;
    /** Punto II: clave de cat_especialidades. */
    especialidad: string;
    diagnostico: string;
    estudios: string;
    procedimiento: string;
    origenId: string;
    consultaServicioId: string;
    aseguradora: string;
    metodoPago: string;
    moneda: string;
    costo: string;
  }

  const defaultConsultation = (): ConsultationForm => {
    return {
      doctorId: '',
      fecha: '',
      horaInicio: '',
      horaFin: '',
      tipo: 'Consulta',
      tipoVisita: 'Primera Vez',
      tipoAgenda: 'PRIMERA',
      especialidad: '',
      diagnostico: '',
      estudios: '',
      procedimiento: '',
      origenId: '',
      consultaServicioId: '',
      aseguradora: 'Particular',
      metodoPago: 'Efectivo',
      moneda: 'MXN - Peso Mexicano',
      costo: '',
    };
  };

  const [consultationData, setConsultationData] = useState<ConsultationForm>(() => defaultConsultation());
  const searchParams = useSearchParams();
  // Enfermería solo puede ser responsable de una consulta tipo Estudios.
  useEffect(() => {
    if (consultationData.tipoAgenda === 'ESTUDIOS' || !consultationData.doctorId) return;
    if (doctores.find((d) => d.id === consultationData.doctorId)?.tipo_personal === 'ENFERMERO') {
      setConsultationData((prev) => ({ ...prev, doctorId: '' }));
    }
  }, [consultationData.tipoAgenda, consultationData.doctorId, doctores]);

  useEffect(() => {
    const now = new Date();
    // Hora por defecto: el siguiente intervalo de 15 min (10:07 → 10:15).
    const minutosAhora = now.getHours() * 60 + now.getMinutes();
    const horaAhora = deMinutos(Math.ceil(minutosAhora / DURACION_CITA_MIN) * DURACION_CITA_MIN);
    const fechaParam = searchParams.get('fecha');
    const horaParam = searchParams.get('hora');
    const horaInicio = horaParam && /^\d{2}:\d{2}$/.test(horaParam) ? horaParam : horaAhora;
    const tipoParam = (searchParams.get('tipo') || '').toUpperCase();
    const opcionUrl = tipoParam === 'ESTUDIO' ? opcionTipoConsulta('ESTUDIOS') : tipoParam === 'PROCEDIMIENTO' ? opcionTipoConsulta('PROCEDIMIENTOS') : null;
    setConsultationData(f => ({
      ...f,
      ...(opcionUrl ? { tipoAgenda: opcionUrl.value, tipo: opcionUrl.tipo, tipoVisita: opcionUrl.tipoVisita } : {}),
      fecha: fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : now.toISOString().split('T')[0],
      horaInicio,
      horaFin: addMinutesToTime(horaInicio, DURACION_CITA_MIN),
    }));
  }, [searchParams]);

  const pacienteParamId = searchParams.get('paciente_id');
  const pacienteParamApplied = useRef(false);

  useEffect(() => {
    if (!draftHydrated || !pacienteParamId || pacienteParamApplied.current) return;
    pacienteParamApplied.current = true;
    fetchJSON<PacienteDetalleAPI>(`/api/pacientes/${encodeURIComponent(pacienteParamId)}`)
      .then((p) => {
        if (!p?.id) return;
        setPacienteSeleccionado(normalizarPacienteDetalle(p));
        setSearchPaciente('');
        setShowDropdown(false);
        setEstudiosSeleccionados([]);
        setProcedimientosSeleccionados([]);
        setConsultationData(f => ({ ...f, origenId: p.aseguranza_id || '' }));
        if (p.aseguranza_id) cargarServiciosOrigen(p.aseguranza_id);
      })
      .catch(() => {});
  }, [draftHydrated, pacienteParamId, cargarServiciosOrigen]);

  // Precarga desde la agenda: doctor_id, especialidad (nombre o clave) y tipo_agenda.
  const precargaAplicada = useRef(false);
  useEffect(() => {
    if (!draftHydrated || precargaAplicada.current) return;
    const doctorParam = searchParams.get('doctor_id');
    const especialidadParam = searchParams.get('especialidad');
    const tipoAgendaParam = (searchParams.get('tipo_agenda') || '').toUpperCase();
    if (!doctorParam && !especialidadParam && !tipoAgendaParam) {
      precargaAplicada.current = true;
      return;
    }
    // Espera a que carguen los médicos para validar el doctor.
    if (doctorParam && doctores.length === 0) return;
    precargaAplicada.current = true;

    const tipoValido = TIPOS_CONSULTA_AGENDA.some((t) => t.value === tipoAgendaParam);
    const op = tipoValido ? opcionTipoConsulta(tipoAgendaParam) : null;
    const doctor = doctorParam ? doctores.find((d) => d.id === doctorParam) : undefined;
    // Enfermería solo atiende Estudios: si no aplica, se deja el doctor vacío.
    const doctorOk = doctor && !esAnestesiologo(doctor) && (doctor.tipo_personal !== 'ENFERMERO' || op?.value === 'ESTUDIOS') ? doctor : undefined;
    const esp = buscarEspecialidad(especialidades, especialidadParam) ?? buscarEspecialidad(especialidades, doctorOk?.especialidad);

    setConsultationData((f) => ({
      ...f,
      ...(op ? { tipoAgenda: op.value, tipo: op.tipo, tipoVisita: op.tipoVisita } : {}),
      ...(doctorOk ? { doctorId: doctorOk.id } : {}),
      ...(esp ? { especialidad: esp.clave } : {}),
    }));
  }, [draftHydrated, searchParams, doctores, especialidades]);

  const esUSD = consultationData.moneda === 'USD - Dólar';
  const convertir = useCallback((montoMXN: number) => {
    if (!esUSD || !tipoCambio) return montoMXN;
    return montoMXN / tipoCambio;
  }, [esUSD, tipoCambio]);
  const invertir = useCallback((monto: number) => {
    if (!esUSD || !tipoCambio) return monto;
    return monto * tipoCambio;
  }, [esUSD, tipoCambio]);

  const insuranceOptions = useMemo(() => {
    return aseguranzas.map((a) => a.id);
  }, [aseguranzas]);

  const insuranceDisplayOptions = useMemo(() => aseguranzas.map((a) => a.nombre), [aseguranzas]);


  const selectedInsurance = useMemo(
    () => aseguranzas.find((a) => a.id === consultationData.origenId),
    [aseguranzas, consultationData.origenId]
  );

  const selectedConsultaServicio = useMemo(
    () => catalogoConsultas.find((c) => c.id === consultationData.consultaServicioId),
    [catalogoConsultas, consultationData.consultaServicioId]
  );
  const doctorSeleccionado = useMemo(
    () => doctores.find((d) => d.id === consultationData.doctorId),
    [doctores, consultationData.doctorId]
  );
  const [procedimientoMotivo, setProcedimientoMotivo] = useState('');

  const draftState = useMemo(() => ({
    consultationData,
    pacienteId: pacienteSeleccionado?.id ?? null,
    pacienteNombre: pacienteSeleccionado?.nombre_completo ?? null,
    doctorNombre: doctorSeleccionado?.nombre ?? null,
    origenNombre: selectedInsurance?.nombre ?? null,
    consultaNombre: selectedConsultaServicio?.nombre ?? null,
    searchPaciente: searchPaciente.trim(),
    estudiosSeleccionados,
    estudiosNombres: estudiosSeleccionados.map((estudio) => catalogoEstudios.find((c) => c.id === estudio.id)?.nombre || 'Estudio'),
    procedimientosSeleccionados,
    procedimientosNombres: procedimientosSeleccionados.map((proc) => catalogoProcedimientos.find((c) => c.id === proc.id)?.nombre || 'Procedimiento'),
    procedimientoMotivo: procedimientoMotivo.trim(),
    newPatient,
    showNewPatientForm,
  }), [
    consultationData,
    pacienteSeleccionado?.id,
    pacienteSeleccionado?.nombre_completo,
    doctorSeleccionado?.nombre,
    selectedInsurance?.nombre,
    selectedConsultaServicio?.nombre,
    searchPaciente,
    estudiosSeleccionados,
    catalogoEstudios,
    procedimientosSeleccionados,
    catalogoProcedimientos,
    procedimientoMotivo,
    newPatient,
    showNewPatientForm,
  ]);

  const draftSignature = useMemo(() => JSON.stringify(draftState), [draftState]);

  useEffect(() => {
    try {
      // Si se llega con datos precargados (p. ej. «Agendar consulta» desde la agenda),
      // el borrador anterior no debe pisarlos.
      const conPrecarga = new URLSearchParams(window.location.search).has('paciente_id');
      if (conPrecarga) localStorage.removeItem(DRAFT_STORAGE_KEY);
      const rawDraft = conPrecarga ? null : localStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as {
          consultationData?: ConsultationForm;
          pacienteSeleccionado?: PacienteAPI | null;
          estudiosSeleccionados?: EstudioSeleccionado[];
          procedimientosSeleccionados?: ProcedimientoSeleccionado[];
          procedimientoMotivo?: string;
          saved_at?: string;
        };
        // Borradores de más de 12 h se descartan (pueden ser de otro turno/usuario).
        const edad = draft.saved_at ? Date.now() - Date.parse(draft.saved_at) : 0;
        if (edad > CADUCIDAD_BORRADOR_MS) throw new Error('borrador caducado');

        if (draft.consultationData) {
          setConsultationData(draft.consultationData);
          if (draft.consultationData.origenId) {
            cargarServiciosOrigen(draft.consultationData.origenId);
          }
        }
        if (draft.pacienteSeleccionado) setPacienteSeleccionado(draft.pacienteSeleccionado);
        if (Array.isArray(draft.estudiosSeleccionados)) setEstudiosSeleccionados(draft.estudiosSeleccionados);
        if (Array.isArray(draft.procedimientosSeleccionados)) setProcedimientosSeleccionados(draft.procedimientosSeleccionados);
        if (typeof draft.procedimientoMotivo === 'string') setProcedimientoMotivo(draft.procedimientoMotivo);
      }
    } catch {
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
    } finally {
      setDraftHydrated(true);
    }
  }, [cargarServiciosOrigen]);

  useEffect(() => {
    if (draftHydrated && initialDraftSignature.current === null) {
      initialDraftSignature.current = draftSignature;
      initialDraftState.current = JSON.parse(draftSignature) as Record<string, unknown>;
    }
  }, [draftHydrated, draftSignature]);

  const hasDraftChanges = draftHydrated && initialDraftSignature.current !== null && draftSignature !== initialDraftSignature.current;

  // Autoguardado del borrador (antes solo se guardaba al salir con el modal): un error,
  // recarga o sesión vencida ya no pierden la captura. Con retraso para no escribir en cada tecla.
  useEffect(() => {
    if (!hasDraftChanges || saving || consultaGuardadaRef.current) return;
    const t = window.setTimeout(() => {
      if (consultaGuardadaRef.current) return;
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          consultationData,
          pacienteSeleccionado,
          estudiosSeleccionados,
          procedimientosSeleccionados,
          procedimientoMotivo,
          saved_at: new Date().toISOString(),
        }));
      } catch {
        /* cuota llena o almacenamiento bloqueado */
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [hasDraftChanges, saving, consultationData, pacienteSeleccionado, estudiosSeleccionados, procedimientosSeleccionados, procedimientoMotivo]);

  const draftChangeSummary = useMemo(() => {
    const initial = initialDraftState.current as any;
    if (!hasDraftChanges || !initial) return [];

    const current = draftState as any;
    const changes: string[] = [];
    const currentForm = current.consultationData || {};
    const initialForm = initial.consultationData || {};
    const addChange = (label: string, value: unknown) => {
      const text = String(value || 'Sin capturar');
      changes.push(`${label}: ${text}`);
    };

    if (current.pacienteId !== initial.pacienteId || current.searchPaciente !== initial.searchPaciente) {
      addChange('Paciente', current.pacienteNombre || current.searchPaciente);
    }
    if (currentForm.doctorId !== initialForm.doctorId) addChange('Doctor', current.doctorNombre);
    if (currentForm.fecha !== initialForm.fecha) addChange('Fecha', currentForm.fecha);
    if (currentForm.horaInicio !== initialForm.horaInicio || currentForm.horaFin !== initialForm.horaFin) {
      addChange('Horario', `${currentForm.horaInicio || '--:--'} - ${currentForm.horaFin || '--:--'}`);
    }
    if (currentForm.origenId !== initialForm.origenId) addChange('Origen', current.origenNombre);
    if (currentForm.consultaServicioId !== initialForm.consultaServicioId) addChange('Consulta', current.consultaNombre);
    if ((currentForm.diagnostico || '') !== (initialForm.diagnostico || '')) addChange('Diagnóstico', currentForm.diagnostico);
    if (JSON.stringify(current.estudiosSeleccionados) !== JSON.stringify(initial.estudiosSeleccionados)) {
      addChange('Estudios', current.estudiosNombres?.length ? current.estudiosNombres.join(', ') : 'Sin estudios');
    }
    if (JSON.stringify(current.procedimientosSeleccionados) !== JSON.stringify(initial.procedimientosSeleccionados)) {
      addChange('Procedimientos', current.procedimientosNombres?.length ? current.procedimientosNombres.join(', ') : 'Sin procedimientos');
    }
    if ((current.procedimientoMotivo || '') !== (initial.procedimientoMotivo || '')) addChange('Motivo de procedimiento', current.procedimientoMotivo);
    if (currentForm.metodoPago !== initialForm.metodoPago) addChange('Método de pago', currentForm.metodoPago);
    if (currentForm.moneda !== initialForm.moneda) addChange('Moneda', currentForm.moneda);
    if (JSON.stringify(current.newPatient) !== JSON.stringify(initial.newPatient) || current.showNewPatientForm !== initial.showNewPatientForm) {
      addChange('Nuevo paciente', current.newPatient?.nombre_completo || 'Datos capturados');
    }

    return changes;
  }, [draftState, hasDraftChanges]);

  const dateTimeError = useMemo(() => {
    if (!consultationData.fecha) return 'Debe seleccionar una fecha de consulta';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consultationData.fecha)) return 'La fecha de consulta no es válida';
    const inicio = timeToMinutes(consultationData.horaInicio);
    const fin = timeToMinutes(consultationData.horaFin);
    if (inicio === null) return 'La hora de inicio no es válida';
    if (fin === null) return 'La hora fin no es válida';
    if (fin <= inicio) return 'La hora fin debe ser mayor a la hora de inicio';
    return null;
  }, [consultationData.fecha, consultationData.horaInicio, consultationData.horaFin]);

  useEffect(() => {
    if (catalogoConsultas.length === 0) {
      setConsultationData((prev) => prev.consultaServicioId ? { ...prev, consultaServicioId: '' } : prev);
      return;
    }
    setConsultationData((prev) => {
      if (!prev.consultaServicioId || catalogoConsultas.some((c) => c.id === prev.consultaServicioId)) return prev;
      // La consulta es opcional: si la elegida no existe en el nuevo origen, se deja vacía.
      return { ...prev, consultaServicioId: '' };
    });
  }, [catalogoConsultas]);

  // Búsqueda remota (con debounce) para encontrar pacientes fuera de la primera página.
  // /api/search?cirugia=todos devuelve solo pacientes (id, nombre, contacto; máx. 5).
  const debouncedSearchPaciente = useDebounce(searchPaciente.trim(), 300);
  const busquedaRemotaUrl = debouncedSearchPaciente.length >= 2 && debouncedSearchPaciente.length <= 60
    ? `/api/search?q=${encodeURIComponent(debouncedSearchPaciente)}&cirugia=todos`
    : null;
  const { data: busquedaRemota, isLoading: buscandoRemoto, isValidating: validandoRemoto } = useSWR<{ results?: BusquedaPacienteResult[] }>(
    busquedaRemotaUrl,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const buscandoPacientes = searchPaciente.trim().length >= 2 && (
    searchPaciente.trim() !== debouncedSearchPaciente || buscandoRemoto || validandoRemoto
  );

  const filteredPacientes = useMemo(() => {
    const termRaw = searchPaciente.trim();
    if (!termRaw) return pacientes;
    const term = termRaw.toLowerCase();
    const locales = pacientes.filter(
      (p) =>
        (p.nombre || p.nombre_completo || '').toLowerCase().includes(term) ||
        (p.email && p.email.toLowerCase().includes(term)) ||
        (p.telefono && p.telefono.toLowerCase().includes(term))
    );
    if (!busquedaRemotaUrl) return locales;
    const vistos = new Set(locales.map((p) => p.id));
    const remotos: PacienteAPI[] = (busquedaRemota?.results || [])
      .filter((r) => r.tipo === 'paciente' && !vistos.has(r.id))
      .map((r) => ({
        id: r.id,
        nombre: r.titulo,
        nombre_completo: r.titulo,
        edad: null,
        sexo: null,
        aseguradora: null,
        aseguranza_id: null,
        telefono: null,
        email: null,
        direccion: null,
        parcial: true,
        subtitulo: r.subtitulo,
      }));
    return [...locales, ...remotos];
  }, [pacientes, searchPaciente, busquedaRemota, busquedaRemotaUrl]);

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

  const calcularCosto = useCallback((tipo: string, tipoVisita: string) => {
    const tipoMatrix = TIPO_CONSULTA_MAP[tipo];
    const visitaMatrix = TIPO_VISITA_MAP[tipoVisita];
    if (!tipoMatrix || !visitaMatrix) return 0;
    const match = matrizCostos.find(
      (c) => c.tipo_consulta === tipoMatrix && c.tipo_visita === visitaMatrix && c.activo
    );
    return match ? match.costo : 0;
  }, [matrizCostos]);

  const costoBaseOriginal = useMemo(
    () => selectedConsultaServicio?.costo ?? calcularCosto(consultationData.tipo, consultationData.tipoVisita),
    [calcularCosto, consultationData.tipo, consultationData.tipoVisita, selectedConsultaServicio]
  );

  const costoBaseFinal = useMemo(() => {
    if (editingMontos && costoBaseEdit !== '') {
      const parsed = parseFloat(costoBaseEdit);
      return isNaN(parsed) ? 0 : invertir(parsed);
    }
    return costoBaseOriginal;
  }, [editingMontos, costoBaseEdit, costoBaseOriginal, invertir]);

  const subtotalAntesDescuento = useMemo(() => {
    const costosEstudios = estudiosSeleccionados.reduce((sum, e, idx) => {
      if (editingMontos && costosEstudiosEdit[idx] !== undefined) {
        const parsed = parseFloat(costosEstudiosEdit[idx]);
        return sum + (isNaN(parsed) ? 0 : invertir(parsed));
      }
      const estudio = catalogoEstudios.find((c) => c.id === e.id);
      return sum + (estudio ? estudio.costo : 0);
    }, 0);
    const costosProcs = procedimientosSeleccionados.reduce((sum, p, idx) => {
      if (editingMontos && costosProcsEdit[idx] !== undefined) {
        const parsed = parseFloat(costosProcsEdit[idx]);
        return sum + (isNaN(parsed) ? 0 : invertir(parsed));
      }
      const proc = catalogoProcedimientos.find((c) => c.id === p.id);
      return sum + (proc ? proc.costo : 0);
    }, 0);
    const doctorPrincipal = doctores.find((d) => d.id === consultationData.doctorId);
    const honorario = doctorPrincipal
      ? (TIPO_CONSULTA_MAP[consultationData.tipo] === 'ESTUDIO'
        ? doctorPrincipal.honorario_estudio
        : TIPO_CONSULTA_MAP[consultationData.tipo] === 'PROCEDIMIENTO'
        ? doctorPrincipal.honorario_procedimiento
        : doctorPrincipal.honorario_consulta) || 0
      : 0;
    return costoBaseFinal + costosEstudios + costosProcs + honorario;
  }, [editingMontos, costoBaseFinal, costosEstudiosEdit, costosProcsEdit, invertir, consultationData.tipo, consultationData.doctorId, estudiosSeleccionados, procedimientosSeleccionados, catalogoEstudios, catalogoProcedimientos, doctores]);

  const costoTotal = useMemo(() => {
    return subtotalAntesDescuento;
  }, [subtotalAntesDescuento]);

  const descuentoSeguro = useMemo(() => {
    const porcentaje = selectedInsurance?.porcentaje_cobertura || 0;
    return subtotalAntesDescuento * (porcentaje / 100);
  }, [subtotalAntesDescuento, selectedInsurance]);

  const pacientePaga = useMemo(() => {
    return subtotalAntesDescuento - descuentoSeguro;
  }, [subtotalAntesDescuento, descuentoSeguro]);

  const addEstudio = useCallback((id: string) => {
    if (estudiosSeleccionados.length >= 3) return;
    if (estudiosSeleccionados.find((e) => e.id === id)) return;
    setEstudiosSeleccionados((prev) => [...prev, { id, mismoDoctor: true }]);
    setSearchEstudio('');
    setShowEstudioDropdown(false);
  }, [estudiosSeleccionados]);

  const removeEstudio = useCallback((index: number) => {
    setEstudiosSeleccionados((prev) => prev.filter((_, i) => i !== index));
    if (editingMontos) {
      setCostosEstudiosEdit((prev) => {
        const next: Record<number, string> = {};
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k);
          if (ki < index) next[ki] = v;
          else if (ki > index) next[ki - 1] = v;
        });
        return next;
      });
    }
  }, [editingMontos]);

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
    if (editingMontos) {
      setCostosProcsEdit((prev) => {
        const next: Record<number, string> = {};
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k);
          if (ki < index) next[ki] = v;
          else if (ki > index) next[ki - 1] = v;
        });
        return next;
      });
    }
  }, [editingMontos]);

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

  const setEstudioIndicadoPor = useCallback((index: number, indicadoPorId: string) => {
    setEstudiosSeleccionados((prev) =>
      prev.map((e, i) => (i === index ? { ...e, indicadoPorId: indicadoPorId || undefined } : e))
    );
  }, []);

  const setProcedimientoIndicadoPor = useCallback((index: number, indicadoPorId: string) => {
    setProcedimientosSeleccionados((prev) =>
      prev.map((p, i) => (i === index ? { ...p, indicadoPorId: indicadoPorId || undefined } : p))
    );
  }, []);

  const [agregarOtroProcedimiento, setAgregarOtroProcedimiento] = useState(false);

  const updateConsultation = useCallback((field: string, value: string) => {
    setConsultationData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'tipoAgenda') {
        const op = opcionTipoConsulta(value);
        next.tipo = op.tipo;
        next.tipoVisita = op.tipoVisita;
      }
      if (field === 'horaInicio') {
        next.horaFin = addMinutesToTime(value, DURACION_CITA_MIN);
      }
      return next;
    });
    setFormError(null);
    if (field === 'origenId') {
      setEstudiosSeleccionados([]);
      setProcedimientosSeleccionados([]);
      setSearchEstudio('');
      setSearchProcedimiento('');
      setEditingMontos(false);
      setCostoBaseEdit('');
      setCostosEstudiosEdit({});
      setCostosProcsEdit({});
      cargarServiciosOrigen(value || null);
    }
    if (field === 'tipo' || field === 'tipoVisita' || field === 'tipoAgenda') {
      setEditingMontos(false);
      setCostoBaseEdit('');
      setCostosEstudiosEdit({});
      setCostosProcsEdit({});
    }
  }, [cargarServiciosOrigen]);

  const pacienteSelIdRef = useRef<string | null>(null);
  useEffect(() => { pacienteSelIdRef.current = pacienteSeleccionado?.id ?? null; }, [pacienteSeleccionado]);

  const seleccionarPaciente = useCallback((p: PacienteAPI) => {
    pacienteSelIdRef.current = p.id;
    setPacienteSeleccionado(p);
    setSearchPaciente('');
    setShowDropdown(false);
    setEstudiosSeleccionados([]);
    setProcedimientosSeleccionados([]);
    updateConsultation('origenId', p.aseguranza_id || '');
    if (!p.parcial) return;
    // Resultado de la búsqueda remota: completar edad/sexo/aseguranza con el detalle.
    fetchJSON<PacienteDetalleAPI>(`/api/pacientes/${encodeURIComponent(p.id)}`)
      .then((detalle) => {
        if (!detalle?.id) return;
        const completo = normalizarPacienteDetalle(detalle);
        if (pacienteSelIdRef.current !== completo.id) return; // el usuario ya eligió otro
        setPacienteSeleccionado(completo);
        if (completo.aseguranza_id) updateConsultation('origenId', completo.aseguranza_id);
      })
      .catch((err) => {
        if (pacienteSelIdRef.current === p.id) {
          pacienteSelIdRef.current = null;
          setPacienteSeleccionado(null);
        }
        toast(err instanceof Error && err.message ? err.message : 'No se pudieron cargar los datos del paciente', 'error');
      });
  }, [updateConsultation, toast]);

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

  useEffect(() => {
    const handleReloadShortcut = (event: KeyboardEvent) => {
      if (!hasDraftChanges) return;
      const isReloadShortcut = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
      if (!isReloadShortcut) return;
      event.preventDefault();
      setPendingExitHref(null);
      setPendingExitAction('reload');
      setShowExitDraftModal(true);
    };
    window.addEventListener('keydown', handleReloadShortcut);
    return () => window.removeEventListener('keydown', handleReloadShortcut);
  }, [hasDraftChanges]);

  const requestExit = useCallback((href: string) => {
    if (hasDraftChanges) {
      setPendingExitHref(href);
      setPendingExitAction('navigate');
      setShowExitDraftModal(true);
      return;
    }
    router.push(href);
  }, [hasDraftChanges, router]);

  const saveDraftAndExit = useCallback(() => {
    const href = pendingExitHref || '/agenda';
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        consultationData,
        pacienteSeleccionado,
        estudiosSeleccionados,
        procedimientosSeleccionados,
        procedimientoMotivo,
        saved_at: new Date().toISOString(),
      }));
      toast('Borrador guardado');
    } catch {
      toast('No se pudo guardar el borrador');
    }
    setShowExitDraftModal(false);
    if (pendingExitAction === 'reload') {
      window.location.reload();
      return;
    }
    router.push(href);
  }, [consultationData, pacienteSeleccionado, estudiosSeleccionados, procedimientosSeleccionados, procedimientoMotivo, pendingExitAction, pendingExitHref, router, toast]);

  const exitWithoutSaving = useCallback(() => {
    const href = pendingExitHref || '/agenda';
    setShowExitDraftModal(false);
    if (pendingExitAction === 'reload') {
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
      window.location.reload();
      return;
    }
    router.push(href);
  }, [pendingExitAction, pendingExitHref, router]);

  const handleCreate = useCallback(async () => {
    if (saving) return;
    if (!pacienteSeleccionado) {
      setFormError('Debe seleccionar un paciente');
      return;
    }
    if (pacienteSeleccionado.parcial) {
      setFormError('Cargando datos del paciente, intente de nuevo en un momento');
      return;
    }
    if (!consultationData.doctorId) {
      setFormError('Debe seleccionar un doctor');
      return;
    }
    if (dateTimeError) {
      setFormError(dateTimeError);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const estudiosData = estudiosSeleccionados.map((e) => {
        const estudio = catalogoEstudios.find((c) => c.id === e.id);
        const doctorId = e.mismoDoctor ? consultationData.doctorId : (e.doctorId || null);
        return { id: e.id, nombre: estudio?.nombre || '', doctor_id: doctorId, indicado_por_id: e.indicadoPorId || consultationData.doctorId || null };
      });

      const procedimientosData = procedimientosSeleccionados.map((p) => {
        const proc = catalogoProcedimientos.find((c) => c.id === p.id);
        const doctorId = p.mismoDoctor ? consultationData.doctorId : (p.doctorId || null);
        return { id: p.id, nombre: proc?.nombre || '', doctor_id: doctorId, motivo: p.motivo || null, indicado_por_id: p.indicadoPorId || consultationData.doctorId || null };
      });

      const primerProcedimiento = procedimientosSeleccionados[0];
      const procDoctorId = primerProcedimiento
        ? (primerProcedimiento.mismoDoctor ? consultationData.doctorId : (primerProcedimiento.doctorId || null))
        : null;

      if (!claveEnvioRef.current) claveEnvioRef.current = nuevaClaveIdempotencia();
      await enviarJSON('/api/consultas', 'POST', {
          paciente_id: pacienteSeleccionado.id,
          doctor_id: consultationData.doctorId,
          fecha: consultationData.fecha,
          hora_inicio: consultationData.horaInicio,
          hora_fin: consultationData.horaFin || null,
          tipo_consulta: consultationData.tipo,
          tipo_visita: consultationData.tipoVisita,
          especialidad_id: especialidades.find((e) => e.clave === consultationData.especialidad)?.id || null,
          aseguranza_id: consultationData.origenId || null,
          consulta_servicio_id: consultationData.consultaServicioId || null,
          diagnostico: consultationData.diagnostico,
          estudios: estudiosData,
          procedimientos: procedimientosData,
          procedimiento: procedimientosData.length > 0 ? procedimientosData.map((p) => p.nombre).join(', ') : null,
          procedimiento_doctor_id: procDoctorId,
          metodo_pago: consultationData.metodoPago,
          moneda: consultationData.moneda,
      }, { idempotencia: claveEnvioRef.current });
      claveEnvioRef.current = null;
      consultaGuardadaRef.current = true;

      toast('Consulta creada exitosamente');
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
      // Las pantallas afectadas se refrescan en segundo plano (sin recargar ni vaciar).
      void invalidar('/api/consultas', '/api/agenda', '/api/dashboard', '/api/pacientes');
      router.push('/agenda');
    } catch (err) {
      // Nada se pierde: el formulario conserva lo capturado y el borrador sigue guardado.
      let msg = mensajeDeError(err, 'Error al crear la consulta');
      const conflictos = err instanceof ApiError && err.status === 409
        ? (err.datos?.conflictos as { descripcion?: string; hora_inicio?: string; hora_fin?: string }[] | undefined)
        : undefined;
      if (conflictos?.length) {
        const c = conflictos[0];
        msg = `${c.descripcion || 'El médico ya tiene una cita'} (${(c.hora_inicio || '').slice(0, 5)}–${(c.hora_fin || '').slice(0, 5)}). Elige otro horario.`;
      }
      setFormError(msg);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, pacienteSeleccionado, consultationData, toast, router, estudiosSeleccionados, procedimientosSeleccionados, catalogoEstudios, catalogoProcedimientos, dateTimeError, invalidar, especialidades]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="NUEVA CONSULTA"
        subtitle="Complete la información de la consulta oftalmológica."
        backLink={{
          href: '/agenda',
          label: 'Agenda',
          onClick: (event) => {
            event.preventDefault();
            requestExit('/agenda');
          },
        }}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      />

      {/* Patient Selector */}
      <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
        <div className="px-6 py-5">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted">Paciente</label>
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
                  placeholder="Buscar por nombre, teléfono o email..."
                  aria-label="Buscar paciente"
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface-2 dark:text-fg dark:placeholder-muted transition-all"
                />
                {showDropdown && (
                  <div
                    className="absolute z-50 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-line dark:bg-surface animate-fadeIn"
                    aria-busy={buscandoPacientes}
                  >
                    <BarraRevalidando activo={buscandoPacientes} />
                    {filteredPacientes.length > 0 ? (
                      filteredPacientes.map((p) => {
                        const initials = getInitials(p.nombre_completo);
                        const color = getAvatarColor(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => seleccionarPaciente(p)}
                            className="flex w-full items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left"
                          >
                            <Avatar initials={initials} className={color} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-fg truncate">{p.nombre_completo}</div>
                              <div className="text-xs text-muted truncate">
                                {p.parcial
                                  ? p.subtitulo
                                  : <>{p.edad ? `${p.edad} años` : ''} {p.sexo ? `• ${p.sexo === 'M' ? 'Mujer' : 'Hombre'}` : ''} {p.aseguradora ? `• ${p.aseguradora}` : ''}</>}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-muted">
                        {buscandoPacientes ? 'Buscando pacientes…' : 'No se encontraron pacientes'}
                      </div>
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
                <div key={pacienteSeleccionado.id} className="mt-3 animate-fadeIn flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-muted">
                  <Avatar initials={getInitials(pacienteSeleccionado.nombre_completo)} className={getAvatarColor(pacienteSeleccionado.id)} size="sm" />
                  <span className="font-medium text-fg">{pacienteSeleccionado.nombre_completo}</span>
                  {pacienteSeleccionado.numero_expediente && <span>Exp. {pacienteSeleccionado.numero_expediente}</span>}
                  {pacienteSeleccionado.edad && <span className="hidden sm:inline">{pacienteSeleccionado.edad} años</span>}
                  {pacienteSeleccionado.sexo && <span className="hidden sm:inline">{pacienteSeleccionado.sexo === 'M' ? 'Mujer' : 'Hombre'}</span>}
                  {pacienteSeleccionado.aseguradora && <span className="font-medium text-primary-600">{pacienteSeleccionado.aseguradora}</span>}
                </div>
              )}

              {/* New Patient Form — inline below search */}
              {showNewPatientForm && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-line dark:bg-surface-2 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 ring-1 ring-primary-200">
                        <User className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-widest text-fg">Nuevo Paciente</h2>
                        <p className="text-xs text-muted">Complete los datos para registrar al paciente</p>
                      </div>
                    </div>
                    <button onClick={() => setShowNewPatientForm(false)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-muted dark:hover:bg-surface-2 transition-colors">Cancelar</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="Número de expediente" value={newPatient.numero_expediente} onChange={(v) => setNewPatient((p) => ({ ...p, numero_expediente: v }))} placeholder="Ej. 12345" />
                    <FormInput label="Nombre completo" required value={newPatient.nombre_completo} onChange={(v) => setNewPatient((p) => ({ ...p, nombre_completo: v }))} placeholder="Nombre del paciente" />
                    <FormSelect label="Sexo" required value={newPatient.sexo} onChange={(v) => setNewPatient((p) => ({ ...p, sexo: v }))} options={['H', 'M']} displayOptions={['Hombre', 'Mujer']} />
                    <FormInput label="Fecha de nacimiento (opcional)" value={newPatient.fecha_nacimiento} onChange={(v) => setNewPatient((p) => ({ ...p, fecha_nacimiento: v }))} type="date" />
                    <FormInput label="Email" value={newPatient.email} onChange={(v) => setNewPatient((p) => ({ ...p, email: v }))} placeholder="correo@ejemplo.com" type="email" />
                    <div className="sm:col-span-2">
                      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Teléfonos <span className="text-muted">(hasta 3)</span></span>
                      <EditorTelefonos value={newPatient.telefonos ?? []} onChange={(lista) => setNewPatient((p) => ({ ...p, telefonos: lista }))} />
                    </div>
                    <FormInput label="Dirección" value={newPatient.direccion} onChange={(v) => setNewPatient((p) => ({ ...p, direccion: v }))} placeholder="Dirección del paciente" />
                  </div>
                  {newPatientError && (
                    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 animate-fadeIn dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      {newPatientError}
                    </p>
                  )}
                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-line">
                    <button type="button" onClick={() => { setShowNewPatientForm(false); setNewPatientError(null); }} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors">CANCELAR</button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (savingPaciente) return;
                        const error = validarNuevoPaciente(newPatient);
                        if (error) { setNewPatientError(error); return; }
                        setNewPatientError(null);
                        // No enviar campos vacíos (el servidor rechaza p. ej. email '').
                        const payload: Record<string, unknown> = {
                          nombre_completo: newPatient.nombre_completo.trim(),
                          sexo: newPatient.sexo,
                        };
                        if (newPatient.fecha_nacimiento) payload.fecha_nacimiento = newPatient.fecha_nacimiento;
                        // Varios teléfonos (el principal también va en `telefono`); borradores antiguos traen solo `telefono`.
                        const telefonosNuevo = normalizarTelefonos(newPatient.telefonos, newPatient.telefono.trim() || null);
                        if (telefonosNuevo.length) {
                          payload.telefonos = telefonosNuevo;
                          payload.telefono = telefonoPrincipal(telefonosNuevo);
                        }
                        if (newPatient.email.trim()) payload.email = newPatient.email.trim();
                        if (newPatient.direccion.trim()) payload.direccion = newPatient.direccion.trim();
                        if (newPatient.numero_expediente.trim()) payload.numero_expediente = newPatient.numero_expediente.trim();
                        setSavingPaciente(true);
                        try {
                          const created = await enviarJSON<PacienteAPI>('/api/pacientes', 'POST', payload);
                          pacienteSelIdRef.current = created.id;
                          setPacienteSeleccionado(created);
                          setShowNewPatientForm(false);
                          setNewPatient({ nombre_completo: '', sexo: 'H', fecha_nacimiento: '', telefono: '', email: '', direccion: '', numero_expediente: '', telefonos: [] });
                          setEstudiosSeleccionados([]);
                          setProcedimientosSeleccionados([]);
                          updateConsultation('origenId', created?.aseguranza_id || '');
                          toast('Paciente creado exitosamente');
                          void invalidar('/api/pacientes', '/api/search', '/api/dashboard');
                        } catch (err) {
                          const msg = err instanceof Error && err.message ? err.message : 'No se pudo crear el paciente';
                          setNewPatientError(msg);
                          toast(msg, 'error');
                        } finally {
                          setSavingPaciente(false);
                        }
                      }}
                      disabled={savingPaciente || !newPatient.nombre_completo.trim()}
                      aria-busy={savingPaciente}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                      {savingPaciente ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : 'GUARDAR Y SELECCIONAR'}
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-line dark:bg-surface-2/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 ring-1 ring-primary-100">
                <ClipboardList className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-fg">Datos de Consulta</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect
                  label="Asignar doctor a la consulta"
                  required
                  value={consultationData.doctorId}
                  onChange={(v) => {
                    updateConsultation('doctorId', v);
                    // Especialidad: se toma del médico (ya no hay selector propio).
                    const esp = buscarEspecialidad(especialidades, doctores.find((d) => d.id === v)?.especialidad);
                    updateConsultation('especialidad', esp?.clave || '');
                  }}
                  options={['', ...(consultationData.tipoAgenda === 'ESTUDIOS' ? personalEstudios : medicos).map((d) => d.id)]}
                  displayOptions={['', ...(consultationData.tipoAgenda === 'ESTUDIOS' ? personalEstudios : medicos).map((d) => `${d.nombre}${d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}`)]}
                />
                <FormInput label="Fecha de Consulta" value={consultationData.fecha} onChange={(v) => updateConsultation('fecha', v)} type="date" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SelectorHoraSlot
                  label="Hora Inicio"
                  required
                  medicoId={consultationData.doctorId}
                  fecha={consultationData.fecha}
                  value={consultationData.horaInicio}
                  onChange={(v) => updateConsultation('horaInicio', v)}
                />
                <FormInput label="Hora Fin" value={consultationData.horaFin} onChange={(v) => updateConsultation('horaFin', v)} type="time" />
              </div>
              {dateTimeError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
                  {dateTimeError}
                </div>
              )}
              <FormSelect
                label="Origen"
                value={consultationData.origenId}
                onChange={(v) => updateConsultation('origenId', v)}
                options={['', ...insuranceOptions]}
                displayOptions={['Seleccionar origen...', ...insuranceDisplayOptions]}
              />
              {/* Consulta unificada (servicio del origen); la especialidad se toma del médico. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect
                  label="Consulta (opcional)"
                  value={consultationData.consultaServicioId}
                  onChange={(v) => updateConsultation('consultaServicioId', v)}
                  options={['', ...catalogoConsultas.map((c) => c.id)]}
                  displayOptions={[
                    catalogoConsultas.length > 0
                      ? 'Sin consulta específica'
                      : consultationData.origenId ? 'El origen no tiene consultas' : 'Selecciona primero el origen',
                    ...catalogoConsultas.map((c) => c.nombre),
                  ]}
                />
                <FormSelect
                  label="Tipo de consulta"
                  required
                  value={consultationData.tipoAgenda || 'PRIMERA'}
                  onChange={(v) => updateConsultation('tipoAgenda', v)}
                  options={TIPOS_CONSULTA_AGENDA.map((t) => t.value)}
                  displayOptions={TIPOS_CONSULTA_AGENDA.map((t) => t.label)}
                />
              </div>
              <div>
                <label htmlFor="consulta-diagnostico" className="mb-1.5 block text-[13px] font-medium text-fg-2">Diagnóstico</label>
                <BuscadorDiagnosticoCIE10
                  id="consulta-diagnostico"
                  value={consultationData.diagnostico}
                  onChange={(v) => updateConsultation('diagnostico', v)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-muted">Estudios <span className="normal-case">(Opcional)</span></label>
                <div className="space-y-3">
                  {estudiosSeleccionados.map((estudio, index) => {
                    const cat = catalogoEstudios.find((c) => c.id === estudio.id);
                    return (
                      <div key={index} className="rounded-lg border border-primary-200 bg-primary-50 p-3 space-y-2 dark:border-primary-900/40 dark:bg-primary-900/10">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Estudio</span>
                              <span className="text-sm font-bold text-fg truncate">{cat?.nombre || 'Desconocido'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEstudio(index)}
                            className="shrink-0 rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:border-line dark:bg-surface dark:text-muted transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="font-medium">Indicado por:</span>
                          <select
                            value={estudio.indicadoPorId || ''}
                            onChange={(e) => setEstudioIndicadoPor(index, e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                          >
                            <option value="">{doctorSeleccionado?.nombre ? `${doctorSeleccionado.nombre} (doctor de la consulta)` : 'Doctor de la consulta'}</option>
                            {medicos.filter((d) => d.id !== consultationData.doctorId).map((d) => (
                              <option key={d.id} value={d.id}>{d.nombre}</option>
                            ))}
                          </select>
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
                              <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-primary-600 dark:bg-surface-2 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm dark:bg-surface transition-transform peer-checked:translate-x-4" />
                            </div>
                            <span className="text-xs font-medium text-fg-2">Realizado por el mismo doctor de la consulta</span>
                          </label>
                          {!estudio.mismoDoctor && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted">Realizado por:</span>
                              <select
                                value={estudio.doctorId || ''}
                                onChange={(e) => setEstudioDoctor(index, e.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                              >
                                <option value="">Seleccionar doctor...</option>
                                {personalEstudios.map((d) => (
                                  <option key={d.id} value={d.id}>{d.nombre}{d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}</option>
                                ))}
                              </select>
                            </div>
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
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg dark:placeholder-muted transition-all"
                      />
                      {showEstudioDropdown && createPortal(
                        <div
                          data-estudio-portal
                          className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-line dark:bg-surface"
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
                                  className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors text-left"
                                >
                                  <span className="text-sm font-medium text-fg truncate">{e.nombre}</span>
                                </button>
                              ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-muted">No se encontraron resultados</div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setShowEstudioDropdown(false); setSearchEstudio(''); }}
                            className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50 dark:text-muted dark:hover:bg-surface-2"
                          >
                            Cerrar
                          </button>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}

                  {estudiosSeleccionados.length >= 3 && (
                    <p className="text-xs text-muted">Máximo 3 estudios alcanzado</p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-muted">Procedimientos <span className="normal-case">(Opcional)</span></label>
                <div className="space-y-3">
                  {procedimientosSeleccionados.map((proc, index) => {
                    const cat = catalogoProcedimientos.find((c) => c.id === proc.id);
                    return (
                      <div key={index} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Procedimiento</span>
                              <span className="text-sm font-bold text-fg truncate">{cat?.nombre || 'Desconocido'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProcedimiento(index)}
                            className="shrink-0 rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:border-line dark:bg-surface dark:text-muted transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="font-medium">Indicado por:</span>
                          <select
                            value={proc.indicadoPorId || ''}
                            onChange={(e) => setProcedimientoIndicadoPor(index, e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                          >
                            <option value="">{doctorSeleccionado?.nombre ? `${doctorSeleccionado.nombre} (doctor de la consulta)` : 'Doctor de la consulta'}</option>
                            {medicos.filter((d) => d.id !== consultationData.doctorId).map((d) => (
                              <option key={d.id} value={d.id}>{d.nombre}</option>
                            ))}
                          </select>
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
                              <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-primary-600 dark:bg-surface-2 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm dark:bg-surface transition-transform peer-checked:translate-x-4" />
                            </div>
                            <span className="text-xs font-medium text-fg-2">Realizado por el mismo doctor de la consulta</span>
                          </label>
                          {!proc.mismoDoctor && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted">Realizado por:</span>
                              <select
                                value={proc.doctorId || ''}
                                onChange={(e) => setProcedimientoDoctor(index, e.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                              >
                                <option value="">Seleccionar doctor...</option>
                                {medicos.map((d) => (
                                  <option key={d.id} value={d.id}>{d.nombre}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        {proc.motivo && (
                          <p className="text-xs text-muted italic">Motivo: {proc.motivo}</p>
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
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg dark:placeholder-muted transition-all"
                      />
                      {showProcedimientoDropdown && createPortal(
                        <div
                          data-procedimiento-portal
                          className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-line dark:bg-surface"
                          style={{ top: procDropdownPos.top, left: procDropdownPos.left, width: procDropdownPos.width }}
                        >
                          {filteredProcedimientos.length > 0 ? (
                            filteredProcedimientos.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => addProcedimiento(p.id)}
                                className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors text-left"
                              >
                                <span className="text-sm font-medium text-fg truncate">{p.nombre}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-muted">No se encontraron resultados</div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setShowProcedimientoDropdown(false); setSearchProcedimiento(''); }}
                            className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50 dark:text-muted dark:hover:bg-surface-2"
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
                      <span className="text-sm font-medium text-fg-2">Agregar otro procedimiento</span>
                    </label>
                  )}

                  {agregarOtroProcedimiento && procedimientosSeleccionados.length >= 1 && (
                    <div className="space-y-2">
                      <textarea
                        value={procedimientoMotivo}
                        onChange={(e) => setProcedimientoMotivo(e.target.value)}
                        placeholder="Motivo para agregar otro procedimiento..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg dark:placeholder-muted transition-all resize-none"
                      />
                      {procedimientoMotivo.trim() && (
                        <div className="relative" ref={procedimientoInputRef} data-procedimiento-dropdown>
                          <input
                            type="text"
                            value={searchProcedimiento}
                            onChange={(e) => { setSearchProcedimiento(e.target.value); setShowProcedimientoDropdown(true); }}
                            onFocus={() => setShowProcedimientoDropdown(true)}
                            placeholder="Buscar otro procedimiento..."
                            className="w-full rounded-lg border border-primary-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-primary-700 dark:bg-surface dark:text-fg dark:placeholder-muted transition-all"
                          />
                          {showProcedimientoDropdown && createPortal(
                            <div
                              data-procedimiento-portal
                              className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-line dark:bg-surface"
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
                                      className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors text-left"
                                    >
                                      <span className="text-sm font-medium text-fg truncate">{p.nombre}</span>
                                    </button>
                                  ))
                              ) : (
                                <div className="px-4 py-3 text-sm text-muted">No se encontraron resultados</div>
                              )}
                              <button
                                type="button"
                                onClick={() => { setShowProcedimientoDropdown(false); setSearchProcedimiento(''); }}
                                className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50 dark:text-muted dark:hover:bg-surface-2"
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-line dark:bg-surface-2/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                <Banknote className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-fg">Datos de Cobro</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormSelect label="Método de Pago" value={consultationData.metodoPago} onChange={(v) => updateConsultation('metodoPago', v)} options={paymentMethodOptions} />
                <FormSelect label="Moneda" value={consultationData.moneda} onChange={(v) => updateConsultation('moneda', v)} options={['MXN - Peso Mexicano', 'USD - Dólar']} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 dark:border-line dark:bg-surface-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (editingMontos) {
                        setEditingMontos(false);
                        setCostoBaseEdit('');
                        setCostosEstudiosEdit({});
                        setCostosProcsEdit({});
                      } else {
                        setEditingMontos(true);
                      }
                    }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      editingMontos
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-line dark:text-fg-2 dark:hover:bg-surface-2'
                    )}
                  >
                    {editingMontos ? 'Terminar edición' : 'Editar montos'}
                  </button>
                </div>
                <div className="flex justify-between text-sm items-center gap-3">
                  <span className="text-muted shrink-0">Consulta:</span>
                  {editingMontos ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={costoBaseEdit}
                        onChange={(e) => setCostoBaseEdit(e.target.value)}
                        placeholder={selectedConsultaServicio ? convertir(selectedConsultaServicio.costo).toFixed(2) : '0.00'}
                        className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                      />
                    </div>
                  ) : (
                    <span className="font-bold text-fg text-right">{selectedConsultaServicio?.nombre || 'Servicio pendiente'}</span>
                  )}
                </div>
                {estudiosSeleccionados.length > 0 && (
                  <>
                    <div className="border-t border-line pt-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">Estudios ({estudiosSeleccionados.length})</span>
                    </div>
                    {estudiosSeleccionados.map((estudio, idx) => {
                      const cat = catalogoEstudios.find((c) => c.id === estudio.id);
                      const doctorAsignado = estudio.mismoDoctor
                        ? doctores.find((d) => d.id === consultationData.doctorId)
                        : doctores.find((d) => d.id === estudio.doctorId);
                      return (
                        <div key={idx} className="text-sm pl-3 flex items-center justify-between gap-3">
                          <span className="text-muted">
                            {cat?.nombre || 'Desconocido'}
                            {doctorAsignado && <span className="text-xs text-muted ml-1">({doctorAsignado.nombre})</span>}
                          </span>
                          {editingMontos && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={costosEstudiosEdit[idx] ?? ''}
                                onChange={(e) => setCostosEstudiosEdit((p) => ({ ...p, [idx]: e.target.value }))}
                                placeholder={cat ? convertir(cat.costo).toFixed(2) : '0.00'}
                                className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {procedimientosSeleccionados.length > 0 && (
                  <>
                    <div className="border-t border-line pt-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">Procedimientos ({procedimientosSeleccionados.length})</span>
                    </div>
                    {procedimientosSeleccionados.map((proc, idx) => {
                      const cat = catalogoProcedimientos.find((c) => c.id === proc.id);
                      const doctorAsignado = proc.mismoDoctor
                        ? doctores.find((d) => d.id === consultationData.doctorId)
                        : doctores.find((d) => d.id === proc.doctorId);
                      return (
                        <div key={idx} className="text-sm pl-3 flex items-center justify-between gap-3">
                          <span className="text-muted">
                            {cat?.nombre || 'Desconocido'}
                            {doctorAsignado && <span className="text-xs text-muted ml-1">({doctorAsignado.nombre})</span>}
                          </span>
                          {editingMontos && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={costosProcsEdit[idx] ?? ''}
                                onChange={(e) => setCostosProcsEdit((p) => ({ ...p, [idx]: e.target.value }))}
                                placeholder={cat ? convertir(cat.costo).toFixed(2) : '0.00'}
                                className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:border-line dark:bg-surface dark:text-fg"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {(() => {
                  const doctorPrincipal = doctores.find((d) => d.id === consultationData.doctorId);
                  if (!doctorPrincipal) return null;
                  const honorario = TIPO_CONSULTA_MAP[consultationData.tipo] === 'ESTUDIO'
                    ? doctorPrincipal.honorario_estudio
                    : TIPO_CONSULTA_MAP[consultationData.tipo] === 'PROCEDIMIENTO'
                    ? doctorPrincipal.honorario_procedimiento
                    : doctorPrincipal.honorario_consulta;
                  if (!honorario) return null;
                  return (
                    <>
                      <div className="border-t border-line pt-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted">Honorarios</span>
                      </div>
                      <div className="flex justify-between text-sm pl-3">
                        <span className="text-muted">
                          Dr. {doctorPrincipal.nombre}
                          <span className="text-xs text-muted ml-1">({TIPO_CONSULTA_MAP[consultationData.tipo] || 'Consulta'})</span>
                        </span>
                        <span className="font-bold text-fg">${convertir(honorario).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  );
                })()}
                {esUSD && tipoCambio && (
                  <div className="text-[10px] text-muted text-right">Tipo de cambio: 1 USD = {tipoCambio.toFixed(2)} MXN</div>
                )}
                {selectedInsurance && selectedInsurance.porcentaje_cobertura != null && selectedInsurance.porcentaje_cobertura > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Cobertura {selectedInsurance.nombre} ({selectedInsurance.porcentaje_cobertura}%):</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">-${convertir(descuentoSeguro).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Paciente paga:</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">${convertir(pacientePaga).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-line pt-2 flex justify-between">
                  <span className="text-sm font-bold text-fg">Total Clínica:</span>
                  <span className="text-lg font-extrabold text-primary-700 dark:text-primary-400">${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-muted">{esUSD ? 'USD' : 'MXN'}</span></span>
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
              <AlertTriangle className="h-4 w-4 text-muted" />
              <span className="text-xs text-muted">Los campos con <span className="text-red-500">*</span> son obligatorios.</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => requestExit('/agenda')} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors">CANCELAR</button>
              <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors">
                <Eye className="h-4 w-4" /> PREVISUALIZAR
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !pacienteSeleccionado || !consultationData.doctorId || Boolean(dateTimeError)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><CheckCircle2 className="h-4 w-4" /> FINALIZAR CONSULTA</>}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[300px] lg:shrink-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <div className="px-6 py-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-fg">Resumen</h2>
            </div>
            <div className="px-6 pb-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Paciente</span>
                <span className="font-bold text-fg text-right truncate max-w-[160px]">{pacienteSeleccionado?.nombre_completo || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Doctor</span>
                <span className="font-bold text-fg">{doctorSeleccionado?.nombre || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Fecha</span>
                <span className="font-bold text-fg">{consultationData.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Hora</span>
                <span className="font-bold text-fg">{consultationData.horaInicio} - {consultationData.horaFin || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Origen</span>
                <span className="font-bold text-fg">{selectedInsurance?.nombre || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Consulta</span>
                <span className="font-bold text-fg text-right truncate max-w-[160px]">{selectedConsultaServicio?.nombre || '—'}</span>
              </div>
              <div className="border-t border-line/70 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted">Base:</span>
                  <span className="font-bold text-fg">{selectedConsultaServicio?.nombre || '—'}</span>
                </div>
                {estudiosSeleccionados.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Estudios:</span>
                    <span className="font-bold text-fg">{estudiosSeleccionados.length}</span>
                  </div>
                )}
                {procedimientosSeleccionados.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Procs:</span>
                    <span className="font-bold text-fg">{procedimientosSeleccionados.length}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-line/70 pt-1">
                  <span className="text-muted">Total:</span>
                  <span className="font-extrabold text-primary-700 dark:text-primary-400">${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] font-bold text-muted">{esUSD ? 'USD' : 'MXN'}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={showExitDraftModal} onClose={() => setShowExitDraftModal(false)} maxWidth="max-w-md">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-extrabold text-fg">Guardar borrador</h2>
            <p className="mt-2 text-sm text-muted">
              Hay cambios en esta consulta. Revise el resumen antes de {pendingExitAction === 'reload' ? 'recargar' : 'salir'}.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-line dark:bg-surface-2">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">Cambios capturados</p>
            {draftChangeSummary.length > 0 ? (
              <ul className="max-h-56 space-y-2 overflow-y-auto text-sm text-fg-2">
                {draftChangeSummary.map((change, index) => (
                  <li key={index} className="rounded-md bg-white px-3 py-2 dark:bg-surface">{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No hay cambios relevantes para guardar.</p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={exitWithoutSaving}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors"
            >
              {pendingExitAction === 'reload' ? 'Recargar sin guardar' : 'Salir sin guardar'}
            </button>
            <button
              type="button"
              onClick={() => setShowExitDraftModal(false)}
              className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors"
            >
              Seguir editando
            </button>
            <button
              type="button"
              onClick={saveDraftAndExit}
              className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              Guardar borrador
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} maxWidth="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
            <Eye className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-fg">Vista Previa de Consulta</h2>
            <p className="text-xs text-muted">Revise la información antes de finalizar</p>
          </div>
        </div>

        <div className="space-y-6">
          {pacienteSeleccionado && (
            <div className="rounded-xl bg-gray-50 p-5 ring-1 ring-gray-100 dark:bg-surface-2 dark:ring-line">
              <div className="flex items-center gap-3 mb-3">
                <Avatar initials={getInitials(pacienteSeleccionado.nombre_completo)} className={getAvatarColor(pacienteSeleccionado.id)} size="lg" />
                <div>
                  <h3 className="text-base font-extrabold text-fg">{pacienteSeleccionado.nombre_completo}</h3>
                  <p className="text-xs text-muted">{pacienteSeleccionado.edad ? `${pacienteSeleccionado.edad} años` : ''} {pacienteSeleccionado.sexo ? `• ${pacienteSeleccionado.sexo === 'M' ? 'Mujer' : 'Hombre'}` : ''}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <ClipboardList className="h-4 w-4 text-primary-600" /> Datos de Consulta
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <PreviewField label="Doctor" value={doctorSeleccionado?.nombre || '—'} />
              <PreviewField label="Fecha" value={consultationData.fecha || '—'} />
              <PreviewField label="Hora Inicio" value={consultationData.horaInicio || '—'} />
              <PreviewField label="Hora Fin" value={consultationData.horaFin || '—'} />
              <PreviewField label="Origen" value={selectedInsurance?.nombre || '—'} />
              <PreviewField label="Consulta" value={selectedConsultaServicio?.nombre || '—'} />
              <PreviewField label="Tipo de consulta" value={opcionTipoConsulta(consultationData.tipoAgenda).label} />
            </div>
            <div className="mt-3 space-y-3">
              <PreviewField label="Diagnóstico" value={consultationData.diagnostico || 'No especificado'} full />
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-line dark:bg-surface">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Estudios</span>
                {estudiosSeleccionados.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">Ninguno</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {estudiosSeleccionados.map((e, index) => {
                      const cat = catalogoEstudios.find((c) => c.id === e.id);
                      const doctorName = e.mismoDoctor
                        ? doctorSeleccionado?.nombre
                        : doctores.find((d) => d.id === e.doctorId)?.nombre;
                      return (
                        <li key={index} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-fg">{cat?.nombre}</span>
                            {doctorName && <span className="text-[10px] text-muted">({doctorName})</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-line dark:bg-surface">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Procedimientos</span>
                {procedimientosSeleccionados.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">Ninguno</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {procedimientosSeleccionados.map((p, index) => {
                      const cat = catalogoProcedimientos.find((c) => c.id === p.id);
                      return (
                        <li key={index} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-fg">{cat?.nombre}</span>
                            {p.motivo && <span className="text-[10px] text-muted italic">({p.motivo})</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Banknote className="h-4 w-4 text-amber-600" /> Datos de Cobro
            </h4>
            <div className="space-y-3 text-sm">
              <PreviewField label="Método de Pago" value={consultationData.metodoPago || 'No seleccionado'} />
              <PreviewField label="Moneda" value={consultationData.moneda || '—'} />
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-line dark:bg-surface">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Costo Total</span>
                <p className="mt-1 text-lg font-extrabold text-primary-700 dark:text-primary-400">
                  ${convertir(costoTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-muted">{esUSD ? 'USD' : 'MXN'}</span>
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  <div>
                    <span className="text-muted">Consulta: </span>
                    <span className="text-fg">{selectedConsultaServicio?.nombre || '—'}</span>
                  </div>
                  {estudiosSeleccionados.map((e, idx) => {
                    const cat = catalogoEstudios.find((c) => c.id === e.id);
                    const doctorName = e.mismoDoctor ? doctorSeleccionado?.nombre : doctores.find((d) => d.id === e.doctorId)?.nombre;
                    return (
                      <div key={idx}>
                        <span className="text-muted">Estudio: </span>
                        <span className="text-fg">{cat?.nombre || 'Desconocido'}{doctorName ? ` (${doctorName})` : ''}</span>
                      </div>
                    );
                  })}
                  {procedimientosSeleccionados.map((p, idx) => {
                    const cat = catalogoProcedimientos.find((c) => c.id === p.id);
                    return (
                      <div key={idx}>
                        <span className="text-muted">Procedimiento: </span>
                        <span className="text-fg">{cat?.nombre || 'Desconocido'}</span>
                      </div>
                    );
                  })}
                  {(() => {
                    const doctorPrincipal = doctores.find((d) => d.id === consultationData.doctorId);
                    if (!doctorPrincipal) return null;
                    const honorario = TIPO_CONSULTA_MAP[consultationData.tipo] === 'ESTUDIO'
                      ? doctorPrincipal.honorario_estudio
                      : TIPO_CONSULTA_MAP[consultationData.tipo] === 'PROCEDIMIENTO'
                      ? doctorPrincipal.honorario_procedimiento
                      : doctorPrincipal.honorario_consulta;
                    if (!honorario) return null;
                    return (
                      <div className="flex justify-between">
                        <span className="text-muted">Honorarios Dr. {doctorPrincipal.nombre}:</span>
                        <span className="text-fg">${convertir(honorario).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 mt-6 pt-5">
          <button onClick={() => setShowPreview(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors">CERRAR</button>
          <button
            onClick={() => { setShowPreview(false); handleCreate(); }}
            disabled={saving || !pacienteSeleccionado || !consultationData.doctorId || Boolean(dateTimeError)}
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

export default function NuevaConsultaPage() {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-12 bg-surface-2 rounded-lg" /><div className="h-32 bg-surface-2 rounded-lg" /></div>}>
      <NuevaConsultaContent />
    </Suspense>
  );
}
