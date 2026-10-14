'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useInvalidar, useFetch } from '@/hooks/useFetch';
import { PacienteAPI, DoctorAPI, MatrizCosto, CatalogoConsulta, CatalogoEstudio, CatalogoProcedimiento, ServicioPaciente, EstudioSeleccionado, ProcedimientoSeleccionado, AseguranzaAPI, addMinutesToTime, PacienteDetalleAPI, normalizarPacienteDetalle, DRAFT_STORAGE_KEY, timeToMinutes, BusquedaPacienteResult, TIPO_CONSULTA_MAP, TIPO_VISITA_MAP, getInitials, getAvatarColor, validarNuevoPaciente, paymentMethodOptions, PreviewField } from '@/components/consultations/nueva-consulta-comun';
import { useMemo, useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { DatosPacienteFicha, PanelExpediente } from '@/components/pacientes/PanelExpediente';
import { BuscadorServicio } from '@/components/consultations/BuscadorServicio';
import { esMedicoTratante, esAnestesiologo } from '@/lib/catalogos/personal';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { type TelefonoPaciente, normalizarTelefonos, telefonoPrincipal } from '@/lib/telefonos-paciente';
import { deMinutos, DURACION_CITA_MIN } from '@/lib/agenda-slots';
import { opcionTipoConsulta, TIPOS_CONSULTA_AGENDA } from '@/lib/catalogos/tipos-consulta';
import { fetchJSON, nuevaClaveIdempotencia, enviarJSON, mensajeDeError, ApiError } from '@/lib/fetcher';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { useDebounce } from '@/hooks/useDebounce';
import useSWR from 'swr';
import PageHeader from '@/components/ui/PageHeader';
import { useVolver } from '@/components/layout/RutaNavegacion';
import { Printer, User, Loader2, ClipboardList, Banknote, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import Avatar from '@/components/ui/Avatar';
import { FormInput, FormSelect } from '@/components/ui/FormField';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import SelectorHoraSlot from '@/components/agenda/SelectorHoraSlot';
import BuscadorDiagnosticoCIE10 from '@/components/diagnosticos/BuscadorDiagnosticoCIE10';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { estadoCerrado } from '@/lib/permisos-edicion';

/** Tipo que se guarda (tipo_consulta / tipo_visita) a partir de los tipos seleccionados. */
function derivarTipoConsulta(tipos: string[]): { tipo: string; tipoVisita: string } {
  const tieneConsulta = tipos.includes('PRIMERA') || tipos.includes('SUBSECUENTE');
  const tipo = tieneConsulta ? 'Consulta' : tipos.includes('ESTUDIOS') ? 'Estudio' : 'Procedimiento';
  const tipoVisita = tipos.includes('SUBSECUENTE') && !tipos.includes('PRIMERA') ? 'Visita de Retorno' : 'Primera Vez';
  return { tipo, tipoVisita };
}

type ServSel = { id: string; mismoDoctor?: boolean; doctorId?: string; indicadoPorId?: string };
/** Cuerpo de PUT /api/consultas/[id]/servicios a partir de la selección del formulario. */
function serviciosPayload(
  estudios: ServSel[], procedimientos: ServSel[], doctorPrincipal: string,
  catalogo: { id: string; nombre: string; tipo: string }[],
  sinCatalogo: { tipo: 'ESTUDIO' | 'PROCEDIMIENTO'; nombre: string; doctor_id: string | null; indicado_por_id: string | null }[],
) {
  const map = (tipo: 'ESTUDIO' | 'PROCEDIMIENTO', lista: ServSel[]) => [
    ...lista.map((e) => ({
      id: e.id,
      nombre: catalogo.find((c) => c.id === e.id && c.tipo === tipo)?.nombre || '',
      doctor_id: e.mismoDoctor ? doctorPrincipal : (e.doctorId || null),
      indicado_por_id: e.indicadoPorId || doctorPrincipal || null,
    })),
    ...sinCatalogo.filter((x) => x.tipo === tipo).map((x) => ({ id: null, nombre: x.nombre, doctor_id: x.doctor_id, indicado_por_id: x.indicado_por_id })),
  ];
  return { estudios: map('ESTUDIO', estudios), procedimientos: map('PROCEDIMIENTO', procedimientos) };
}

interface EdicionConsultaData {
  consulta: {
    id: string; paciente_id: string; doctor_id: string; fecha: string; hora_inicio: string; hora_fin: string | null;
    tipo_consulta: string | null; tipo_visita: string | null; diagnostico: string | null; notas: string | null;
    estatus: string; estatus_pago?: string | null; costo_total?: number | null; metodo_pago?: string | null; moneda?: string | null; aseguranza_id: string | null;
    especialidad_id: string | null; folio?: string | null;
    estudios_editables: { id: string | null; nombre: string; doctor_id: string | null; indicado_por_id: string | null }[];
    procedimientos_editables: { id: string | null; nombre: string; doctor_id: string | null; indicado_por_id: string | null }[];
  };
  conceptos: { tipo_concepto: string; concepto_id: string | null }[];
}

function FormularioConsultaContent({ consultaId }: { consultaId?: string }) {
  const modoEdicion = Boolean(consultaId);
  const { user } = useUser();
  const esUsuarioEnfermeria = user?.rol === 'enfermero';
  const router = useRouter();
  // Ruta recorrida: cancelar / guardar regresan a la pantalla de origen (Pacientes, Agenda, Consulta…).
  const volver = useVolver({ href: consultaId ? `/consultas/${consultaId}` : '/agenda', label: consultaId ? 'Consulta' : 'Agenda' });
  // Barra de acciones flotante: fixed, alineada al ancho de su hueco en el flujo
  const barraHuecoRef = useRef<HTMLDivElement | null>(null);
  const [barraRect, setBarraRect] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const medir = () => {
      const r = barraHuecoRef.current?.getBoundingClientRect();
      if (!r) return;
      setBarraRect(prev => (prev && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1 ? prev : { left: r.left, width: r.width }));
    };
    medir();
    window.addEventListener('resize', medir);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (ro && barraHuecoRef.current) ro.observe(barraHuecoRef.current);
    if (ro) ro.observe(document.body);
    return () => { window.removeEventListener('resize', medir); ro?.disconnect(); };
  });
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
  // Ids de conceptos del catálogo general (para separarlos de los de la aseguradora)
  const genericosIds = useMemo(
    () => new Set(serviciosPaciente.filter((s) => s.generico).map((s) => s.id)),
    [serviciosPaciente]
  );
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
  const cargarServiciosOrigen = useCallback(async (origenId: string | null): Promise<ServicioPaciente[] | null> => {
    const reqId = ++serviciosReqRef.current;
    if (!origenId) {
      setServiciosPaciente([]);
      setCatalogoConsultas([]);
      setCatalogoEstudios([]);
      setCatalogoProcedimientos([]);
      return [];
    }

    try {
      const res = await fetch(`/api/catalogo-servicios?aseguranza_id=${encodeURIComponent(origenId)}`);
      if (reqId !== serviciosReqRef.current) return null;
      if (!res.ok) {
        setServiciosPaciente([]);
        setCatalogoConsultas([]);
        setCatalogoEstudios([]);
        setCatalogoProcedimientos([]);
        return [];
      }
      const data = await res.json();
      if (reqId !== serviciosReqRef.current) return null;
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
      return servicios;
    } catch {
      if (reqId !== serviciosReqRef.current) return null;
      setServiciosPaciente([]);
      setCatalogoConsultas([]);
      setCatalogoEstudios([]);
      setCatalogoProcedimientos([]);
      return [];
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
  const [saving, setSaving] = useState(false);
  /** Misma clave en reintentos del mismo envío → el servidor no duplica la consulta. */
  const claveEnvioRef = useRef<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
    tiposAgenda: string[];
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
      tiposAgenda: ['PRIMERA'],
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
    if (consultationData.tiposAgenda.includes('ESTUDIOS') || !consultationData.doctorId) return;
    if (doctores.find((d) => d.id === consultationData.doctorId)?.tipo_personal === 'ENFERMERO') {
      setConsultationData((prev) => ({ ...prev, doctorId: '' }));
    }
  }, [consultationData.tiposAgenda, consultationData.doctorId, doctores]);

  useEffect(() => {
    if (modoEdicion) return;
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
      ...(opcionUrl ? { tiposAgenda: [opcionUrl.value], tipo: opcionUrl.tipo, tipoVisita: opcionUrl.tipoVisita } : {}),
      fecha: fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : now.toISOString().split('T')[0],
      horaInicio,
      horaFin: addMinutesToTime(horaInicio, DURACION_CITA_MIN),
    }));
  }, [searchParams, modoEdicion]);

  // Los borradores ya no se guardan ni se restauran: se elimina el que haya quedado de versiones anteriores.
  useEffect(() => {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
  }, []);

  const pacienteParamId = searchParams.get('paciente_id');
  const pacienteParamApplied = useRef(false);

  useEffect(() => {
    if (modoEdicion || !pacienteParamId || pacienteParamApplied.current) return;
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
  }, [pacienteParamId, cargarServiciosOrigen, modoEdicion]);

  // Precarga desde la agenda: doctor_id, especialidad (nombre o clave) y tipo_agenda.
  const precargaAplicada = useRef(false);
  useEffect(() => {
    if (precargaAplicada.current) return;
    if (modoEdicion) { precargaAplicada.current = true; return; }
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
      ...(op ? { tiposAgenda: [op.value], tipo: op.tipo, tipoVisita: op.tipoVisita } : {}),
      ...(doctorOk ? { doctorId: doctorOk.id } : {}),
      ...(esp ? { especialidad: esp.clave } : {}),
    }));
  }, [searchParams, doctores, especialidades, modoEdicion]);

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
    // En edición la consulta del catálogo es de solo lectura: no se limpia.
    if (modoEdicion) return;
    if (catalogoConsultas.length === 0) {
      setConsultationData((prev) => prev.consultaServicioId ? { ...prev, consultaServicioId: '' } : prev);
      return;
    }
    setConsultationData((prev) => {
      if (!prev.consultaServicioId || catalogoConsultas.some((c) => c.id === prev.consultaServicioId)) return prev;
      // La consulta es opcional: si la elegida no existe en el nuevo origen, se deja vacía.
      return { ...prev, consultaServicioId: '' };
    });
  }, [catalogoConsultas, modoEdicion]);

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

  const filteredEstudios = useMemo(() => catalogoEstudios.filter((e) => e.activo), [catalogoEstudios]);
  const filteredProcedimientos = useMemo(() => catalogoProcedimientos.filter((p) => p.activo), [catalogoProcedimientos]);

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
      if (field === 'horaInicio') {
        next.horaFin = addMinutesToTime(value, DURACION_CITA_MIN);
      }
      return next;
    });
    setFormError(null);
    if (field === 'origenId') {
      setEstudiosSeleccionados([]);
      setProcedimientosSeleccionados([]);
      setEditingMontos(false);
      setCostoBaseEdit('');
      setCostosEstudiosEdit({});
      setCostosProcsEdit({});
      cargarServiciosOrigen(value || null);
    }
    if (field === 'tipo' || field === 'tipoVisita') {
      setEditingMontos(false);
      setCostoBaseEdit('');
      setCostosEstudiosEdit({});
      setCostosProcsEdit({});
    }
  }, [cargarServiciosOrigen]);

  /** Tipos de consulta (multi-selección). Primera y Subsecuente son excluyentes entre sí. */
  const toggleTipoAgenda = (value: string) => {
    const actuales = consultationData.tiposAgenda;
    const quitando = actuales.includes(value);
    if (quitando && actuales.length === 1) return; // siempre queda al menos un tipo
    const esConsultaTipo = value === 'PRIMERA' || value === 'SUBSECUENTE';
    const nuevos = quitando
      ? actuales.filter((t) => t !== value)
      : esConsultaTipo
        ? [...actuales.filter((t) => t !== 'PRIMERA' && t !== 'SUBSECUENTE'), value]
        : [...actuales, value];
    const tieneConsulta = nuevos.includes('PRIMERA') || nuevos.includes('SUBSECUENTE');
    const derivado = derivarTipoConsulta(nuevos);
    setConsultationData((prev) => ({
      ...prev,
      tiposAgenda: nuevos,
      tipo: derivado.tipo,
      tipoVisita: derivado.tipoVisita,
      consultaServicioId: tieneConsulta ? prev.consultaServicioId : '',
    }));
    // Lo que deja de aplicar no debe enviarse.
    if (quitando && value === 'ESTUDIOS') setEstudiosSeleccionados([]);
    if (quitando && value === 'PROCEDIMIENTOS') setProcedimientosSeleccionados([]);
    setFormError(null);
    setEditingMontos(false);
    setCostoBaseEdit('');
    setCostosEstudiosEdit({});
    setCostosProcsEdit({});
  };
  const tieneConsultaTipo = consultationData.tiposAgenda.includes('PRIMERA') || consultationData.tiposAgenda.includes('SUBSECUENTE');
  const tieneEstudiosTipo = consultationData.tiposAgenda.includes('ESTUDIOS');
  const tieneProcedimientosTipo = consultationData.tiposAgenda.includes('PROCEDIMIENTOS');

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
    // Sin detalle completo (búsqueda remota o lista sin teléfonos/nacimiento): cargar la ficha.
    if (!p.parcial && p.telefonos !== undefined) return;
    fetchJSON<PacienteDetalleAPI>(`/api/pacientes/${encodeURIComponent(p.id)}`)
      .then((detalle) => {
        if (!detalle?.id) return;
        const completo = normalizarPacienteDetalle(detalle);
        if (pacienteSelIdRef.current !== completo.id) return; // el usuario ya eligió otro
        setPacienteSeleccionado(completo);
        if (completo.aseguranza_id) updateConsultation('origenId', completo.aseguranza_id);
      })
      .catch((err) => {
        if (p.parcial && pacienteSelIdRef.current === p.id) {
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

  // ── Edición: carga la consulta y rellena el mismo formulario ──
  const [notas, setNotas] = useState('');
  const [cargandoEdicion, setCargandoEdicion] = useState(modoEdicion);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const edicionCargadaRef = useRef(false);
  /** Estudios/procedimientos tal como estaban al cargar (para enviar solo si cambian). */
  const serviciosInicialesRef = useRef<string>('');
  /** Servicios antiguos sin concepto en el catálogo: se conservan tal cual al guardar. */
  const sinCatalogoRef = useRef<{ tipo: 'ESTUDIO' | 'PROCEDIMIENTO'; nombre: string; doctor_id: string | null; indicado_por_id: string | null }[]>([]);
  const consultaEstatusRef = useRef<string>('');
  const listoParaHidratar = modoEdicion && doctores.length > 0 && especialidades.length > 0 && !loadingDoctores;
  const { data: edicionRaw, error: edicionError } = useSWR<EdicionConsultaData>(
    modoEdicion ? `/api/consultas/${consultaId}` : null,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!modoEdicion || edicionCargadaRef.current || !listoParaHidratar || !edicionRaw?.consulta) return;
    edicionCargadaRef.current = true;
    const c = edicionRaw.consulta;
    consultaEstatusRef.current = c.estatus;
    if (c.estatus === 'CANCELADA' || (esUsuarioEnfermeria && estadoCerrado(c.estatus))) {
      toast('Esta consulta ya no se puede editar', 'error');
      router.replace(`/consultas/${consultaId}`);
      return;
    }
    void (async () => {
      try {
        const detalle = await fetchJSON<PacienteDetalleAPI>(`/api/pacientes/${encodeURIComponent(c.paciente_id)}`).catch(() => null);
        const paciente = detalle?.id ? normalizarPacienteDetalle(detalle) : null;
        if (paciente) setPacienteSeleccionado(paciente);
        const origenId = c.aseguranza_id || paciente?.aseguranza_id || '';
        const servicios = (await cargarServiciosOrigen(origenId || null)) ?? [];
        const norm = (t: string | null | undefined) => (t || '').trim().toLowerCase();
        const buscar = (tipo: 'ESTUDIO' | 'PROCEDIMIENTO', conceptoId: string | null, nombre: string) =>
          servicios.find((x) => x.tipo === tipo && (conceptoId ? x.id === conceptoId : norm(x.nombre) === norm(nombre)))
          ?? servicios.find((x) => x.tipo === tipo && norm(x.nombre) === norm(nombre));
        const sinCat: typeof sinCatalogoRef.current = [];
        const aSel = (tipo: 'ESTUDIO' | 'PROCEDIMIENTO', lista: EdicionConsultaData['consulta']['estudios_editables']) => {
          const out: EstudioSeleccionado[] = [];
          for (const e of lista) {
            const cat = buscar(tipo, e.id, e.nombre);
            if (!cat || out.some((o) => o.id === cat.id)) {
              if (!cat) sinCat.push({ tipo, nombre: e.nombre, doctor_id: e.doctor_id, indicado_por_id: e.indicado_por_id });
              continue;
            }
            const mismo = !e.doctor_id || e.doctor_id === c.doctor_id;
            out.push({
              id: cat.id,
              mismoDoctor: mismo,
              doctorId: mismo ? undefined : (e.doctor_id ?? undefined),
              indicadoPorId: e.indicado_por_id && e.indicado_por_id !== c.doctor_id ? e.indicado_por_id : undefined,
            });
          }
          return out;
        };
        const estSel = aSel('ESTUDIO', c.estudios_editables);
        const procSel = aSel('PROCEDIMIENTO', c.procedimientos_editables) as ProcedimientoSeleccionado[];
        sinCatalogoRef.current = sinCat;

        const esConsulta = (c.tipo_consulta || 'Consulta') === 'Consulta';
        const tiposAgenda: string[] = [];
        if (esConsulta) tiposAgenda.push(c.tipo_visita === 'Visita de Retorno' ? 'SUBSECUENTE' : 'PRIMERA');
        if (c.tipo_consulta === 'Estudio' || estSel.length || c.estudios_editables.length) tiposAgenda.push('ESTUDIOS');
        if (c.tipo_consulta === 'Procedimiento' || procSel.length || c.procedimientos_editables.length) tiposAgenda.push('PROCEDIMIENTOS');
        if (!tiposAgenda.length) tiposAgenda.push('PRIMERA');
        const consultaConcepto = edicionRaw.conceptos?.find((x) => x.tipo_concepto === 'CONSULTA');
        const esp = especialidades.find((e) => e.id === c.especialidad_id);

        setEstudiosSeleccionados(estSel);
        setProcedimientosSeleccionados(procSel);
        setNotas(c.notas || '');
        setConsultationData({
          ...defaultConsultation(),
          doctorId: c.doctor_id,
          fecha: c.fecha,
          horaInicio: (c.hora_inicio || '').slice(0, 5),
          horaFin: (c.hora_fin || '').slice(0, 5) || addMinutesToTime((c.hora_inicio || '').slice(0, 5), DURACION_CITA_MIN),
          tipo: c.tipo_consulta || 'Consulta',
          tipoVisita: c.tipo_visita || 'Primera Vez',
          tiposAgenda,
          especialidad: esp?.clave || '',
          diagnostico: c.diagnostico || '',
          origenId,
          consultaServicioId: consultaConcepto?.concepto_id || '',
          metodoPago: c.metodo_pago || 'Efectivo',
          moneda: c.moneda || 'MXN - Peso Mexicano',
        });
        serviciosInicialesRef.current = JSON.stringify(serviciosPayload(estSel, procSel, c.doctor_id, servicios, sinCat));
      } catch (err) {
        setErrorEdicion(mensajeDeError(err, 'No se pudo cargar la consulta'));
      } finally {
        setCargandoEdicion(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEdicion, listoParaHidratar, edicionRaw]);

  useEffect(() => {
    if (edicionError) { setErrorEdicion('No se pudo cargar la consulta'); setCargandoEdicion(false); }
  }, [edicionError]);

  const salida = volver.href;
  const requestExit = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  const crearConsulta = useCallback(async () => {
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
          notas: notas.trim() || null,
          estudios: estudiosData,
          procedimientos: procedimientosData,
          procedimiento: procedimientosData.length > 0 ? procedimientosData.map((p) => p.nombre).join(', ') : null,
          procedimiento_doctor_id: procDoctorId,
          metodo_pago: consultationData.metodoPago,
          moneda: consultationData.moneda,
      }, { idempotencia: claveEnvioRef.current });
      claveEnvioRef.current = null;

      toast('Consulta creada exitosamente');
      // Las pantallas afectadas se refrescan en segundo plano (sin recargar ni vaciar).
      void invalidar('/api/consultas', '/api/agenda', '/api/dashboard', '/api/pacientes');
      router.push(volver.href);
    } catch (err) {
      // El formulario conserva lo capturado para corregir y reintentar.
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
  }, [saving, pacienteSeleccionado, consultationData, toast, router, estudiosSeleccionados, procedimientosSeleccionados, catalogoEstudios, catalogoProcedimientos, dateTimeError, invalidar, especialidades, volver.href, notas]);

  const guardarEdicion = useCallback(async () => {
    if (saving || !consultaId) return;
    if (!consultationData.doctorId) { setFormError('Debe seleccionar un doctor'); return; }
    if (dateTimeError) { setFormError(dateTimeError); return; }
    setSaving(true);
    setFormError(null);
    try {
      const espId = especialidades.find((e) => e.clave === consultationData.especialidad)?.id || null;
      await enviarJSON(`/api/consultas/${consultaId}`, 'PATCH', {
        doctor_id: consultationData.doctorId,
        fecha: consultationData.fecha,
        hora_inicio: consultationData.horaInicio,
        hora_fin: consultationData.horaFin || null,
        tipo_consulta: consultationData.tipo,
        tipo_visita: consultationData.tipoVisita,
        especialidad_id: espId,
        diagnostico: consultationData.diagnostico || null,
        notas: notas.trim() || null,
        ...(esUsuarioEnfermeria ? {} : { metodo_pago: consultationData.metodoPago }),
      });
      // Estudios y procedimientos: solo si cambiaron (enfermería no puede editarlos por API).
      if (!esUsuarioEnfermeria) {
        const body = serviciosPayload(estudiosSeleccionados, procedimientosSeleccionados, consultationData.doctorId, serviciosPaciente, sinCatalogoRef.current);
        if (JSON.stringify(body) !== serviciosInicialesRef.current) {
          await enviarJSON(`/api/consultas/${consultaId}/servicios`, 'PUT', body);
        }
      }
      toast('Consulta actualizada');
      void invalidar('/api/consultas', '/api/agenda', '/api/dashboard', '/api/pacientes');
      router.push(`/consultas/${consultaId}`);
    } catch (err) {
      let msg = mensajeDeError(err, 'Error al actualizar la consulta');
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
  }, [saving, consultaId, consultationData, dateTimeError, especialidades, notas, esUsuarioEnfermeria, estudiosSeleccionados, procedimientosSeleccionados, serviciosPaciente, toast, invalidar, router]);

  const handleCreate = modoEdicion ? guardarEdicion : crearConsulta;

  const faltante = !pacienteSeleccionado
    ? 'Debe seleccionar un paciente'
    : !consultationData.doctorId
      ? 'Debe seleccionar un doctor'
      : dateTimeError || null;

  if (modoEdicion && (cargandoEdicion || errorEdicion)) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6">
        <PageHeader
          title="Editar consulta"
          subtitle="Cargando los datos de la consulta…"
          backLink={{ href: salida, label: volver.label }}
        />
        {errorEdicion ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{errorEdicion}</div>
        ) : (
          <div className="space-y-4 animate-pulse"><div className="h-24 bg-surface-2 rounded-xl" /><div className="h-64 bg-surface-2 rounded-xl" /></div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title={modoEdicion ? 'Editar consulta' : 'Nueva consulta'}
        subtitle={modoEdicion ? 'Modifique la información de la consulta; los datos ya están cargados.' : 'Complete la información de la consulta oftalmológica.'}
        backLink={{
          href: salida,
          label: volver.label,
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
              {modoEdicion && (
                <p className="mb-3 text-xs text-muted">El paciente no se puede cambiar al editar una consulta.</p>
              )}
              {!modoEdicion && (
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
              )}
              {pacienteSeleccionado && !showDropdown && (
                <DatosPacienteFicha key={pacienteSeleccionado.id} paciente={pacienteSeleccionado} />
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
                  options={['', ...(consultationData.tiposAgenda.includes('ESTUDIOS') ? personalEstudios : medicos).map((d) => d.id)]}
                  displayOptions={['Seleccionar doctor…', ...(consultationData.tiposAgenda.includes('ESTUDIOS') ? personalEstudios : medicos).map((d) => `${d.nombre}${d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}`)]}
                />
                <FormInput label="Fecha de Consulta" value={consultationData.fecha} onChange={(v) => updateConsultation('fecha', v)} type="date" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SelectorHoraSlot
                  label="Hora Inicio"
                  required
                  medicoId={consultationData.doctorId}
                  excluirId={consultaId}
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
                label={modoEdicion ? 'Origen (no editable)' : 'Origen'}
                disabled={modoEdicion}
                value={consultationData.origenId}
                onChange={(v) => updateConsultation('origenId', v)}
                options={['', ...insuranceOptions]}
                displayOptions={['Seleccionar origen...', ...insuranceDisplayOptions]}
              />
              {/* Tipo de consulta (multi-selección), primero. «Consulta» aparece con Primera o Subsecuente. */}
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Tipo de consulta <span className="text-red-500">*</span></span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de consulta">
                  {TIPOS_CONSULTA_AGENDA.map((t) => {
                    const activo = consultationData.tiposAgenda.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => toggleTipoAgenda(t.value)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-bold transition-colors',
                          activo
                            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-muted dark:hover:bg-surface-2'
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {tieneConsultaTipo && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-fg-2">
                    {consultationData.tiposAgenda.includes('PRIMERA') ? 'Consulta' : 'Consulta (opcional)'}
                  </label>
                  <BuscadorServicio
                    items={catalogoConsultas}
                    genericosIds={genericosIds}
                    origenNombre={selectedInsurance?.nombre}
                    seleccionadoId={consultationData.consultaServicioId}
                    onElegir={(v) => updateConsultation('consultaServicioId', v)}
                    placeholder="Sin consulta específica · buscar consulta..."
                    opcionVacia="Sin consulta específica"
                    disabled={modoEdicion || catalogoConsultas.length === 0}
                    textoDeshabilitado={consultationData.origenId ? 'El origen no tiene consultas' : 'Selecciona primero el origen'}
                  />
                </div>
              )}
              <div>
                <label htmlFor="consulta-diagnostico" className="mb-1.5 block text-[13px] font-medium text-fg-2">Diagnóstico</label>
                <BuscadorDiagnosticoCIE10
                  id="consulta-diagnostico"
                  value={consultationData.diagnostico}
                  onChange={(v) => updateConsultation('diagnostico', v)}
                />
              </div>
              {(
                <div>
                  <label htmlFor="consulta-notas" className="mb-1.5 block text-[13px] font-medium text-fg-2">Notas</label>
                  <textarea
                    id="consulta-notas"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    className="input-field w-full"
                    placeholder="Notas de la consulta…"
                  />
                </div>
              )}
              {tieneEstudiosTipo && (
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
                    <BuscadorServicio
                      items={filteredEstudios.filter((e) => !estudiosSeleccionados.find((x) => x.id === e.id))}
                      genericosIds={genericosIds}
                      origenNombre={selectedInsurance?.nombre}
                      onElegir={addEstudio}
                      placeholder="Buscar estudio..."
                    />
                  )}

                  {estudiosSeleccionados.length >= 3 && (
                    <p className="text-xs text-muted">Máximo 3 estudios alcanzado</p>
                  )}
                </div>
              </div>
              )}
              {tieneProcedimientosTipo && (
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
                    <BuscadorServicio
                      items={filteredProcedimientos}
                      genericosIds={genericosIds}
                      origenNombre={selectedInsurance?.nombre}
                      onElegir={(id) => addProcedimiento(id)}
                      placeholder="Buscar procedimiento..."
                    />
                  )}

                  {procedimientosSeleccionados.length >= 1 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agregarOtroProcedimiento}
                        onChange={(e) => { setAgregarOtroProcedimiento(e.target.checked); if (!e.target.checked) { setProcedimientoMotivo(''); } }}
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
                        <BuscadorServicio
                          items={filteredProcedimientos.filter((x) => !procedimientosSeleccionados.find((sel) => sel.id === x.id))}
                          genericosIds={genericosIds}
                          origenNombre={selectedInsurance?.nombre}
                          onElegir={(id) => addProcedimiento(id, procedimientoMotivo.trim())}
                          placeholder="Buscar otro procedimiento..."
                          inputClassName="border-primary-300 dark:border-primary-700"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
              )}
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

          {/* Actions: barra flotante que sigue al scroll */}
          <div ref={barraHuecoRef} aria-hidden="true" className="h-[132px] sm:h-[72px]" />
          <div
            style={barraRect ? { left: barraRect.left, width: barraRect.width } : undefined}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center lg:bottom-4"
          >
            <p
              className={`min-w-0 flex-1 text-xs ${faltante ? 'text-amber-700 dark:text-amber-300' : 'font-bold text-emerald-700 dark:text-emerald-300'}`}
              aria-live="polite"
            >
              {faltante ? `Falta: ${faltante}` : modoEdicion ? '✓ Todo listo para guardar los cambios' : '✓ Todo listo para finalizar la consulta'}
            </p>
            <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
              <button type="button" onClick={() => requestExit(salida)} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors sm:flex-none">CANCELAR</button>
              <button
                onClick={handleCreate}
                disabled={saving || cargandoEdicion || !pacienteSeleccionado || !consultationData.doctorId || Boolean(dateTimeError)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><CheckCircle2 className="h-4 w-4" /> {modoEdicion ? 'GUARDAR CAMBIOS' : 'FINALIZAR CONSULTA'}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: expediente del paciente (se despliega con «Ver expediente») */}
        <div className="w-full lg:w-[300px] lg:shrink-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <PanelExpediente pacienteId={pacienteSeleccionado?.id ?? null} />
        </div>
      </div>

    </div>
  );
}

export default function FormularioConsulta({ consultaId }: { consultaId?: string }) {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-12 bg-surface-2 rounded-lg" /><div className="h-32 bg-surface-2 rounded-lg" /></div>}>
      <FormularioConsultaContent consultaId={consultaId} />
    </Suspense>
  );
}
