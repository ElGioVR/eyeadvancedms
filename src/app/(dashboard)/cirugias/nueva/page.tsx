'use client';

import { Suspense } from 'react';
import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useInvalidar } from '@/hooks/useFetch';
import { Search, Plus, X, Trash2, FileText, User, Stethoscope, ClipboardList, Users, Eye, Package, Upload, Calendar, Clock, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import {
  ETIQUETAS_ROL,
  ROLES_APOYO,
  esRolApoyo,
  equipoPorDefecto,
  sincronizarHorario,
  validarEquipo,
  type MiembroEquipo,
} from '@/lib/catalogos/equipo-quirurgico';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { URL_ESCRS_IOL, URL_IOLCON, coincideConModelo, etiquetaModeloLio, filtrarModelosPorTipo, type ModeloLio } from '@/lib/catalogos/modelos-lio';
import {
  ANESTESIAS,
  OJOS_CIRUGIA,
  TIPOS_LIO,
  esProcedimientoConLio,
  TIPOS_DOCUMENTO_APOYO,
  TIPO_DOCUMENTO_OTRO,
  TIPO_MEDICINA_INTERNA,
} from '@/lib/catalogos/cirugia';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { URL_LIOS_DISPONIBLES, obtenerLIOs, type LIODisponible } from '@/components/cirugia/LIOSelector';
import { useToast } from '@/components/ui/Toast';

// Custom Skeleton for Cirugía Form - matches actual form layout
function CirugiaFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* PageHeader skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 bg-surface-2 rounded" />
        <div className="h-4 w-32 bg-surface-2 rounded" />
      </div>
      
      {/* Section 1: Paciente */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="h-8 w-full bg-surface-2 rounded mb-3" />
        <div className="h-8 w-full bg-surface-2 rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 2: Expediente */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-40 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 3: Datos de cirugía */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-36 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 4: Equipo */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-3 h-10 bg-surface-2 rounded px-3" />
          <div className="flex items-center gap-3 h-10 bg-surface-2 rounded px-3" />
        </div>
      </div>
      
      {/* Section 5: Recursos / Inventario */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 6: Archivos / Notas */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-24 bg-surface-2 rounded mb-4" />
        <div className="h-32 bg-surface-2 rounded" />
        <div className="mt-3 h-8 bg-surface-2 rounded" />
      </div>
      
      {/* Actions skeleton */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <div className="h-10 w-24 bg-surface-2 rounded" />
        <div className="h-10 w-24 bg-surface-2 rounded" />
      </div>
    </div>
  );
}

interface Paciente {
  id: string;
  nombre_completo: string;
  telefono?: string | null;
  email?: string | null;
  aseguranza_id?: string | null;
  ojo_operado?: OjoOperado;
  cirugias_previas?: number;
}

type OjoOperado = 'sin_cirugias' | 'OD' | 'OI' | 'ambos' | 'desconocido';

type FiltroOjo = 'todos' | 'primer' | 'segundo';

interface HistorialOjo {
  total: number;
  od: boolean;
  oi: boolean;
  desconocido: boolean;
}

const ETIQUETA_OJO: Record<OjoOperado, { texto: string; clase: string }> = {
  sin_cirugias: { texto: 'Sin cirugías previas', clase: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-fg-2' },
  OD: { texto: 'OD ya operado', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  OI: { texto: 'OI ya operado', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  ambos: { texto: 'Ambos ojos operados', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  desconocido: { texto: 'Ojo sin especificar', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};

const FILTROS_OJO: Array<{ id: FiltroOjo; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'primer', label: 'Primer ojo' },
  { id: 'segundo', label: 'Segundo ojo' },
];

function etiquetaOjo(p: Paciente): { texto: string; clase: string } | null {
  if (!p.ojo_operado) return null;
  if (p.ojo_operado === 'sin_cirugias') {
    return { texto: 'Primer ojo', clase: ETIQUETA_OJO.sin_cirugias.clase };
  }
  if (p.ojo_operado === 'ambos') {
    return { texto: '⚠ Ambos ojos', clase: ETIQUETA_OJO.ambos.clase };
  }
  return { texto: ETIQUETA_OJO[p.ojo_operado].texto, clase: ETIQUETA_OJO[p.ojo_operado].clase };
}

interface Aseguranza {
  id: string;
  nombre: string;
}

interface Servicio {
  id: string;
  nombre: string;
  tipo: string;
  costo: number;
}

interface Doctor {
  id: string;
  nombre: string;
  especialidad?: string | null;
  /** Personal unificado (mig. 390): MEDICO | ENFERMERO */
  tipo_personal?: string | null;
}

interface Rol {
  id: string;
  clave: string;
  nombre: string;
}

interface Recurso {
  id: string;
  nombre: string;
  ubicacion?: string | null;
}

interface PacienteResumen {
  paciente: Paciente & {
    sexo?: string | null;
    fecha_nacimiento?: string | null;
    edad?: number | null;
    numero_poliza?: string | null;
    numero_afiliacion?: string | null;
  };
  aseguranza: Aseguranza | null;
  ultima_consulta: { fecha: string; diagnostico: string | null } | null;
  consultas_previas: number;
  cirugias_previas: number;
  expediente_id: string;
}

/** Payload de un médico del equipo hacia POST /api/cirugias. */
interface Participante {
  medico_id: string;
  rol_id: string;
  hora_inicio: string;
  hora_fin: string;
}


interface ArchivoLocal {
  id: string;
  file: File;
  tipo_documento: string;
  /** true si eligió «Otro» y captura el tipo a mano. */
  otro?: boolean;
}

// OD / OS / OU (el valor 'OI' se conserva en BD; ver lib/catalogos/cirugia).
const OJOS = OJOS_CIRUGIA;

const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

/** Catálogos: casi estáticos → sin revalidar en cada foco de ventana. */
const OPCIONES_CATALOGO = { revalidateOnFocus: false, dedupingInterval: 60_000 } as const;

function comoLista<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function NuevaCirugiaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const consultaPrecargaId = searchParams.get('consulta_id');
  const fechaPrecarga = searchParams.get('fecha');
  const horaPrecarga = searchParams.get('hora');
  const pacientePrecargaId = searchParams.get('paciente_id');
  const pacienteNombrePrecarga = searchParams.get('paciente_nombre');
  const procedimientoPrecarga = searchParams.get('procedimiento');
  const cirujanoIdPrecarga = searchParams.get('cirujano_id');
  const cirujanoNombrePrecarga = searchParams.get('cirujano_nombre');

  // Carga de catálogos vía SWR: caché compartida con otras pantallas (configuración,
  // consultas, productividad) y con la precarga de /bienvenida. Al volver a esta
  // pantalla se muestran al instante y se revalidan en segundo plano.
  const aseguranzasSWR = useSWR<Aseguranza[]>('/api/configuracion/aseguranzas', OPCIONES_CATALOGO);
  const doctoresSWR = useSWR<Array<Doctor & { alias?: string | null }>>('/api/configuracion/doctores', OPCIONES_CATALOGO);
  const rolesSWR = useSWR<Rol[]>('/api/cirugias/roles', OPCIONES_CATALOGO);
  const recursosSWR = useSWR<Recurso[]>('/api/cirugias/recursos', OPCIONES_CATALOGO);
  const aseguranzas = useMemo(() => comoLista(aseguranzasSWR.data), [aseguranzasSWR.data]);
  // El API devuelve `alias` (nombre de presentación) y `nombre` (nombre real, puede ser null).
  const doctores = useMemo<Doctor[]>(
    () => comoLista(doctoresSWR.data).map((x) => ({ ...x, nombre: x.alias || x.nombre || x.id })),
    [doctoresSWR.data],
  );
  const roles = useMemo(() => comoLista(rolesSWR.data), [rolesSWR.data]);
  const recursos = useMemo(() => comoLista(recursosSWR.data), [recursosSWR.data]);
  const catalogos = [
    { nombre: 'aseguranzas', swr: aseguranzasSWR },
    { nombre: 'doctores', swr: doctoresSWR },
    { nombre: 'roles', swr: rolesSWR },
    { nombre: 'recursos', swr: recursosSWR },
  ];
  const catalogosListos = catalogos.every((c) => c.swr.data !== undefined || c.swr.error !== undefined);
  const catalogosConError = catalogos.filter((c) => c.swr.error !== undefined && c.swr.data === undefined).map((c) => c.nombre).join(', ');

  // Paciente
  const [queryPaciente, setQueryPaciente] = useState('');
  const [pacientesResult, setPacientesResult] = useState<Paciente[]>([]);
  const [buscandoPacientes, setBuscandoPacientes] = useState(false);
  const [mostrarPacientes, setMostrarPacientes] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [resumenPaciente, setResumenPaciente] = useState<PacienteResumen | null>(null);
  const [filtroOjo, setFiltroOjo] = useState<FiltroOjo>('todos');
  const [historialOjo, setHistorialOjo] = useState<HistorialOjo | null>(null);
  const [avisoOjo, setAvisoOjo] = useState<string | null>(null);

  // Servicios (dependen del paciente = origen)
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);

  // Formulario
  const [origenId, setOrigenId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [ojo, setOjo] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [duracionMin, setDuracionMin] = useState<number | ''>('');
  const [recursoId, setRecursoId] = useState('');
  // Equipo quirúrgico homologado: Rol · Persona · Horario. Roles por defecto
  // precargados (ids deterministas para no romper la hidratación); solo el
  // cirujano es obligatorio y se pueden agregar más filas.
  const [participantes, setParticipantes] = useState<MiembroEquipo[]>(() => {
    let n = 0;
    return equipoPorDefecto('', '', () => `def-${n++}`);
  });
  const [altaPersonal, setAltaPersonal] = useState<{ filaId: string; nombre: string; guardando: boolean } | null>(null);
  const [inventarioItemId, setInventarioItemId] = useState<string | null>(null);
  const [lioManual, setLioManual] = useState(false);
  const [lioManualMarca, setLioManualMarca] = useState('');
  const [lioManualModelo, setLioManualModelo] = useState('');
  const [lioManualPotencia, setLioManualPotencia] = useState('');
  const [lioManualLote, setLioManualLote] = useState('');
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [notas, setNotas] = useState('');
  // Punto I: diagnóstico propio (antes se copiaba a Notas) y anestesia obligatoria.
  const [diagnostico, setDiagnostico] = useState('');
  const [diagnosticoEditado, setDiagnosticoEditado] = useState(false);
  const [anestesia, setAnestesia] = useState('');
  // Punto I.1: datos generales de la cirugía
  const [procedencia, setProcedencia] = useState('');
  const [motivoConsulta, setMotivoConsulta] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [especialidadEditada, setEspecialidadEditada] = useState(false);
  const { especialidades } = useEspecialidades();
  // Punto I.2: procedimientos adicionales, tipo de LIO y personal de apoyo no médico
  const [procedimientosAdicionales, setProcedimientosAdicionales] = useState<string[]>([]);
  const [tipoLio, setTipoLio] = useState('');
  const [modeloLioId, setModeloLioId] = useState('');
  const modelosLioSWR = useSWR<ModeloLio[]>('/api/catalogos/modelos-lio', OPCIONES_CATALOGO);
  const tipoLioSel = TIPOS_LIO.find((t) => t.value === tipoLio);
  // Flujo del LIO: 1) tipo → 2) modelo → 3) pieza del inventario de ese modelo (o manual).
  const [verTodoInventario, setVerTodoInventario] = useState(false);
  const liosSWR = useSWR<LIODisponible[]>(URL_LIOS_DISPONIBLES, obtenerLIOs, { revalidateOnFocus: false });
  const modelosCompatibles = useMemo(
    () => (tipoLioSel ? filtrarModelosPorTipo(Array.isArray(modelosLioSWR.data) ? modelosLioSWR.data : [], tipoLioSel.diseno, tipoLioSel.torico) : []),
    [modelosLioSWR.data, tipoLioSel],
  );
  const modeloLioSel = modelosCompatibles.find((m) => m.id === modeloLioId) || null;
  const piezasDelModelo = useMemo(
    () => (modeloLioSel && Array.isArray(liosSWR.data) ? liosSWR.data.filter((i) => coincideConModelo(i, modeloLioSel)) : []),
    [liosSWR.data, modeloLioSel],
  );
  /** Cambia tipo o modelo: la pieza elegida ya no aplica. */
  const reiniciarPieza = () => {
    setInventarioItemId(null);
    setVerTodoInventario(false);
  };
  /** Captura manual con marca/modelo del catálogo precargados. */
  const abrirLioManual = () => {
    setInventarioItemId(null);
    if (modeloLioSel) {
      setLioManualMarca((v) => v || modeloLioSel.fabricante);
      setLioManualModelo((v) => v || modeloLioSel.modelo);
    }
    setLioManual(true);
  };
  // Sin consulta de origen: precarga el diagnóstico de la última consulta del paciente
  // (solo si el usuario no lo ha escrito/cambiado).
  useEffect(() => {
    const dx = resumenPaciente?.ultima_consulta?.diagnostico;
    if (!diagnosticoEditado) setDiagnostico(dx || '');
  }, [resumenPaciente, diagnosticoEditado]);

  const [guardando, setGuardando] = useState(false);
  const [pasoGuardado, setPasoGuardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidar = useInvalidar();

  // Para auto-fill de procedimiento desde consulta
  const [procedimientoPendiente, setProcedimientoPendiente] = useState<string | null>(null);
  const [cirujanoPendiente, setCirujanoPendiente] = useState<{ id: string; nombre: string } | null>(null);

// Fast loading: only catalogs block the form; consulta/patient loads in background
  const [loadingInitial, setLoadingInitial] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const initialLoadDone = useRef(false);

  // HARD SAFETY: Force form to render after 10s max, no matter what
  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoadingInitial(false), 10000);
    return () => clearTimeout(safetyTimeout);
  }, []);

  // Catálogos listos (o con error) → el formulario se muestra; errores en un toast.
  useEffect(() => {
    if (!catalogosListos) return;
    setLoadingInitial(false);
    if (catalogosConError) toast(`Error al cargar catálogos: ${catalogosConError}`, 'error');
  }, [catalogosListos, catalogosConError, toast]);

  // 2. BACKGROUND: precarga desde consulta/params (una sola vez, tras los catálogos)
  useEffect(() => {
    if (loadingInitial || initialLoadDone.current) return;
    initialLoadDone.current = true;

    const abort = new AbortController();
    abortRef.current = abort;
    const signal = abort.signal;
    let cancelled = false;
    let terminado = false;

    const fetchWithTimeout = (url: string, signal: AbortSignal, timeoutMs = 8000) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      });
      return Promise.race([fetch(url, { signal }), timeout]).finally(() => clearTimeout(timer));
    };

    // Background loading - completely non-blocking
    const loadConsultaData = async (signal: AbortSignal) => {
      const hasDirectParams = pacientePrecargaId || procedimientoPrecarga || cirujanoIdPrecarga;
      if (!consultaPrecargaId && !hasDirectParams) return;

      try {
        let consultaData = null;

        if (consultaPrecargaId) {
          const res = await fetchWithTimeout(`/api/consultas/${consultaPrecargaId}`, signal);
          if (!res.ok || signal.aborted) return;
          consultaData = await res.json();
        }
        if (cancelled) return;

        // Paciente - priority: direct param > consulta data
        const pacienteIdDirecto = pacientePrecargaId || consultaData?.consulta?.paciente_id;
        if (pacienteIdDirecto) {
          await seleccionarPacienteRef.current?.({
            id: pacienteIdDirecto,
            nombre_completo: pacienteNombrePrecarga || consultaData?.consulta?.paciente || 'Paciente',
          } as Paciente);
        }

        // Origen
        if (consultaData?.consulta?.aseguranza_id && !signal.aborted) {
          setOrigenId(consultaData.consulta.aseguranza_id);
        }

        // Diagnóstico de la consulta de origen → campo Diagnóstico
        if (consultaData?.consulta?.diagnostico && !signal.aborted) {
          setDiagnostico(consultaData.consulta.diagnostico);
          setDiagnosticoEditado(true);
        }

        // Procedimiento - priority: direct param > consulta data
        const proc = procedimientoPrecarga || consultaData?.consulta?.procedimiento;
        if (proc && !signal.aborted) setProcedimientoPendiente(proc);

        // Cirujano - priority: direct param > consulta doctor
        const cirujanoId = cirujanoIdPrecarga || consultaData?.consulta?.doctor_id;
        const cirujanoNombre = cirujanoNombrePrecarga || consultaData?.consulta?.doctor;

        if (cirujanoId && !signal.aborted) {
          const rolCirujano = rolesRef.current.find((r) => r.clave === 'cirujano');
          if (rolCirujano) {
            setParticipantes((prev) => prev.map((m) => (m.rol === 'cirujano' && !m.personaId ? { ...m, personaId: cirujanoId } : m)));
            setCirujanoPendiente({ id: cirujanoId, nombre: cirujanoNombre || '' });
          } else {
            setCirujanoPendiente({ id: cirujanoId, nombre: cirujanoNombre || '' });
          }
        }

      } catch (err) {
        if (signal.aborted || err instanceof DOMException && err.name === 'AbortError') return;
        // Silently fail background load - form still works
      }
    };

    void loadConsultaData(signal).finally(() => { terminado = true; });

    // Cleanup
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      // Si se interrumpió (p. ej. doble montaje en desarrollo) se permite reintentar.
      if (!terminado) initialLoadDone.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInitial]);

  // Selected function ref - set via layoutEffect to avoid initialization order issues
  const seleccionarPacienteRef = useRef<((paciente: Paciente) => Promise<unknown>) | null>(null);
  const rolesRef = useRef<Rol[]>([]);
  useLayoutEffect(() => {
    rolesRef.current = roles;
  }, [roles]);

  const seleccionarPaciente = useCallback(async (paciente: Paciente) => {
    setPacienteSeleccionado(paciente);
    setQueryPaciente(paciente.nombre_completo);
    setMostrarPacientes(false);
    if (paciente.aseguranza_id) setOrigenId(paciente.aseguranza_id);
    setHistorialOjo(null);
    setAvisoOjo(null);
    
    // Return promises so caller can await them
    const [historialPromise, resumenPromise] = await Promise.all([
      // Historial de ojos ya operados (primer / segundo ojo)
      fetch(`/api/cirugias?paciente_id=${encodeURIComponent(paciente.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const previas: Array<{ ojo?: string | null; estado?: string | null }> = Array.isArray(data?.data)
            ? data.data.filter((c: { estado?: string | null }) => c.estado !== 'cancelada')
            : [];
          const h: HistorialOjo = { total: previas.length, od: false, oi: false, desconocido: false };
          for (const c of previas) {
            if (c.ojo === 'OD') h.od = true;
            else if (c.ojo === 'OI') h.oi = true;
            else if (c.ojo === 'OU') {
              h.od = true;
              h.oi = true;
            } else h.desconocido = true;
          }
          setHistorialOjo(h);
        })
        .catch(() => setHistorialOjo(null)),
      
      // Cargar resumen del paciente (expediente, última consulta, previas)
      fetch(`/api/pacientes/${paciente.id}/resumen`)
        .then((r) => (r.ok ? r.json() : null))
        .then((resumen) => {
          setResumenPaciente(resumen);
          const aseguranzaId = resumen?.paciente?.aseguranza_id || resumen?.aseguranza?.id || paciente.aseguranza_id;
          if (aseguranzaId) setOrigenId(aseguranzaId);
        })
        .catch(() => {})
    ]);

return [historialPromise, resumenPromise];
  }, []);

  // Set ref before first paint (before useEffect runs)
  useLayoutEffect(() => {
    seleccionarPacienteRef.current = seleccionarPaciente;
  }, [seleccionarPaciente]);

  // Precarga fecha/hora desde Agenda (B11)
useEffect(() => {
  if (fechaPrecarga && !fecha) setFecha(fechaPrecarga);
  if (horaPrecarga && !hora) setHora(horaPrecarga);
}, [fechaPrecarga, horaPrecarga, fecha, hora]);

  // Búsqueda de paciente
  useEffect(() => {
    if (queryPaciente.trim().length < 2) {
      setPacientesResult([]);
      setMostrarPacientes(false);
      setBuscandoPacientes(false);
      return;
    }
    // Si el query corresponde al paciente ya seleccionado (precarga), no buscar ni mostrar dropdown
    if (pacienteSeleccionado && queryPaciente === pacienteSeleccionado.nombre_completo) {
      setPacientesResult([]);
      setMostrarPacientes(false);
      setBuscandoPacientes(false);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      setBuscandoPacientes(true);
      fetch(`/api/search?q=${encodeURIComponent(queryPaciente)}&cirugia=${filtroOjo}`)
        .then((r) => r.json())
        .then((data) => {
          if (!vigente) return; // respuesta de una búsqueda anterior
          const pacientes = (data?.results || [])
            .filter((item: any) => item.tipo === 'paciente')
            .filter((item: any) => item.id !== pacienteSeleccionado?.id)
            .map((item: any) => ({
              id: item.id,
              nombre_completo: item.titulo,
              telefono: item.subtitulo?.split(' · ')[0] || null,
              email: item.subtitulo?.split(' · ')[1] || null,
              ojo_operado: item.ojo_operado,
              cirugias_previas: item.cirugias_previas,
            }));
          setPacientesResult(pacientes);
          setMostrarPacientes(true);
        })
        .catch(() => {})
        .finally(() => { if (vigente) setBuscandoPacientes(false); });
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [queryPaciente, filtroOjo, pacienteSeleccionado]);

  // Ojo: primer / segundo ojo según el historial del paciente seleccionado
  useEffect(() => {
    if (!pacienteSeleccionado || !historialOjo) return;
    const { total, od, oi, desconocido } = historialOjo;
    if (total === 0) {
      setAvisoOjo(
        filtroOjo === 'segundo'
          ? 'Este paciente no tiene cirugías previas: no aplica "segundo ojo".'
          : null
      );
      return;
    }
    const ojoYaOperado = desconocido || (od && oi) ? null : od ? 'OD' : oi ? 'OI' : null;
    if (!ojoYaOperado) {
      setAvisoOjo('Ambos ojos operados (o sin especificar): elige el ojo manualmente.');
      return;
    }
    const contrario = ojoYaOperado === 'OD' ? 'OI' : 'OD';
    if (filtroOjo === 'segundo') {
      setOjo((prev) => (prev ? prev : contrario));
      setAvisoOjo(`Segundo ojo: se marcó ${contrario} (ya operó ${ojoYaOperado}).`);
    } else if (filtroOjo === 'primer') {
      setAvisoOjo(`Este paciente ya tiene una cirugía en ${ojoYaOperado}.`);
    } else {
      setAvisoOjo(`${ojoYaOperado} ya operado · ${total} cirugía(s) previa(s).`);
    }
  }, [pacienteSeleccionado, historialOjo, filtroOjo]);

  // Cargar servicios cuando cambia el paciente/origen
  useEffect(() => {
    if (!pacienteSeleccionado) {
      setServicios([]);
      setServicioId('');
      return;
    }
    const origenConfigurado = origenId || pacienteSeleccionado.aseguranza_id || '';
    setLoadingServicios(true);
    const params = origenConfigurado
      ? `aseguranza_id=${encodeURIComponent(origenConfigurado)}&tipo=PROCEDIMIENTO`
      : `paciente_id=${encodeURIComponent(pacienteSeleccionado.id)}&tipo=PROCEDIMIENTO`;
    setServicioId('');
    setProcedimientosAdicionales([]);
    // Ignora respuestas de un paciente/origen anterior (fuera de orden)
    let vigente = true;
    fetch(`/api/catalogo-servicios?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (vigente) setServicios(Array.isArray(data?.servicios) ? data.servicios : []);
      })
      .catch(() => { if (vigente) setServicios([]); })
      .finally(() => { if (vigente) setLoadingServicios(false); });
    return () => { vigente = false; };
  }, [pacienteSeleccionado, origenId]);

  // Auto-fill procedimiento desde consulta cuando los servicios están disponibles
  useEffect(() => {
    if (!procedimientoPendiente || servicios.length === 0) return;
    const match = servicios.find((s) =>
      s.nombre.toLowerCase().includes(procedimientoPendiente.toLowerCase()) ||
      procedimientoPendiente.toLowerCase().includes(s.nombre.toLowerCase())
    );
    if (match) {
      setServicioId(match.id);
      setProcedimientoPendiente(null);
    }
  }, [servicios, procedimientoPendiente]);

  // ¿Algún procedimiento implica LIO (Faco + LIO)? → se ofrece el tipo de LIO.
  const esCirugiaConLio = useMemo(
    () => [servicioId, ...procedimientosAdicionales].some((id) => esProcedimientoConLio(servicios.find((s) => s.id === id)?.nombre)),
    [servicioId, procedimientosAdicionales, servicios],
  );

  // Especialidad sugerida: la del cirujano principal (editable).
  useEffect(() => {
    if (especialidadEditada) return;
    const cirujano = participantes.find((m) => m.rol === 'cirujano' && m.personaId);
    const esp = buscarEspecialidad(especialidades, doctores.find((d) => d.id === cirujano?.personaId)?.especialidad);
    if (esp) setEspecialidad(esp.clave);
  }, [participantes, doctores, especialidades, especialidadEditada]);

  // El horario de cada miembro sigue al de la cirugía hasta que se edita a mano.
  useEffect(() => {
    setParticipantes((prev) => sincronizarHorario(prev, hora, duracionMin));
  }, [hora, duracionMin]);

  // Roles del catálogo (médicos y de apoyo: instrumentista, enfermero, circulante).
  const opcionesRol = useMemo(() => {
    const delCatalogo = roles.map((r) => ({ clave: r.clave, nombre: r.nombre }));
    // Si la mig. 390 aún no sembró 'enfermero', se muestra igual (la validación avisa).
    const faltantes = ROLES_APOYO.filter((c) => !delCatalogo.some((r) => r.clave === c)).map((c) => ({ clave: c, nombre: ETIQUETAS_ROL[c] }));
    return [...delCatalogo, ...faltantes];
  }, [roles]);
  // Personal unificado: enfermería primero para roles de apoyo; médicos para el resto.
  const enfermeria = useMemo(() => doctores.filter((d) => d.tipo_personal === 'ENFERMERO'), [doctores]);
  const medicosLista = useMemo(() => doctores.filter((d) => d.tipo_personal !== 'ENFERMERO'), [doctores]);

  const agregarParticipante = () => {
    const ref = participantes.find((m) => m.rol === 'cirujano');
    setParticipantes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), rol: '', personaId: '', horaInicio: ref?.horaInicio || '', horaFin: ref?.horaFin || '', horarioEditado: false },
    ]);
  };

  const actualizarParticipante = (id: string, cambios: Partial<MiembroEquipo>) => {
    setParticipantes((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...cambios };
        // Cambiar de rol médico a apoyo (o al revés) cambia la lista de personas.
        if (cambios.rol !== undefined && esRolApoyo(cambios.rol) !== esRolApoyo(m.rol)) next.personaId = '';
        if (cambios.horaInicio !== undefined || cambios.horaFin !== undefined) next.horarioEditado = true;
        return next;
      })
    );
  };

  const eliminarParticipante = (id: string) => {
    setParticipantes((prev) => prev.filter((m) => m.id !== id));
  };

  /** Alta rápida de enfermería (Personal médico unificado), sin honorarios por defecto. */
  const registrarPersonal = async () => {
    if (!altaPersonal || altaPersonal.guardando || !altaPersonal.nombre.trim()) return;
    setAltaPersonal({ ...altaPersonal, guardando: true });
    try {
      const nombre = altaPersonal.nombre.trim();
      const res = await fetch('/api/configuracion/doctores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: nombre, nombre, especialidad: 'Enfermería', tipo_personal: 'ENFERMERO', cobra_honorarios: false }),
      });
      const creado = await res.json();
      if (!res.ok) throw new Error(creado.error || 'No se pudo registrar');
      await doctoresSWR.mutate();
      actualizarParticipante(altaPersonal.filaId, { personaId: creado.id });
      setAltaPersonal(null);
      toast('Enfermero(a) registrado en Personal médico', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo registrar', 'error');
      setAltaPersonal((a) => (a ? { ...a, guardando: false } : a));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const nuevos: ArchivoLocal[] = [];
    Array.from(files).forEach((file) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!EXTENSIONES_PERMITIDAS.includes(ext)) return;
      nuevos.push({ id: crypto.randomUUID(), file, tipo_documento: '' });
    });
    if (nuevos.length > 0) setArchivos((prev) => [...prev, ...nuevos]);
  };

  const actualizarTipoDocumento = (id: string, valor: string) => {
    setArchivos((prev) => prev.map((a) => (a.id === id ? { ...a, tipo_documento: valor } : a)));
  };

  const seleccionarTipoDocumento = (id: string, valor: string) => {
    const otro = valor === TIPO_DOCUMENTO_OTRO;
    setArchivos((prev) => prev.map((a) => (a.id === id ? { ...a, otro, tipo_documento: otro ? '' : valor } : a)));
  };

  const eliminarArchivo = (id: string) => {
    setArchivos((prev) => prev.filter((a) => a.id !== id));
  };

  const validarFormulario = (): string | null => {
    if (!pacienteSeleccionado) return 'Debe seleccionar un paciente';
    if (!servicioId) return 'Debe seleccionar un procedimiento';
    if (!ojo) return 'Debe seleccionar el ojo';
    if (!fecha) return 'Debe indicar la fecha';
    if (!hora) return 'Debe indicar la hora';
    if (!duracionMin || Number(duracionMin) <= 0) return 'La duración estimada debe ser mayor a 0';
    if (!anestesia) return 'Selecciona el tipo de anestesia';
    if (!participantes.some((m) => m.personaId)) return 'Debe asignar al menos un participante';
    if (participantes.some((m) => m.personaId && !m.rol)) return 'Elige el rol de cada participante';
    if (!participantes.some((m) => m.rol === 'cirujano' && m.personaId)) return 'Debe asignar al menos un cirujano';
    const errorEquipo = validarEquipo(participantes);
    if (errorEquipo) return errorEquipo;
    const sinCatalogo = participantes.find((m) => m.personaId && !roles.find((r) => r.clave === m.rol));
    if (sinCatalogo) {
      return `El rol «${ETIQUETAS_ROL[sinCatalogo.rol] || sinCatalogo.rol}» no existe en el catálogo de roles (aplica la migración 390)`;
    }
    for (const a of archivos) {
      if (!a.tipo_documento.trim()) return `Indica el tipo de documento para "${a.file.name}"`;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (guardando) return; // evita doble envío
    const validationError = validarFormulario();
    if (validationError) {
      setError(validationError);
      toast(validationError, 'warning'); // el aviso superior puede quedar fuera de vista
      return;
    }
    setGuardando(true);
    setError(null);

    try {
      const origenFinal = origenId
        || pacienteSeleccionado!.aseguranza_id
        || resumenPaciente?.paciente?.aseguranza_id
        || resumenPaciente?.aseguranza?.id
        || null;
      if (!origenFinal) {
        setError('Debe seleccionar un origen / aseguradora');
        setGuardando(false);
        return;
      }
      const lioManualTexto = [
        lioManualModelo.trim() || null,
        lioManualPotencia ? `${lioManualPotencia}D` : null,
        lioManualLote.trim() ? `Lote ${lioManualLote.trim()}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || null;

      const body = {
        paciente_id: pacienteSeleccionado!.id,
        origen_id: origenFinal,
        servicio_id: servicioId,
        fecha,
        hora,
        duracion_min: Number(duracionMin),
        recurso_id: recursoId || null,
        ojo,
        inventario_item_id: lioManual ? null : inventarioItemId,
        lio: lioManual ? lioManualTexto : null,
        marca_lio: lioManual ? lioManualMarca.trim() || null : null,
        consulta_id: consultaPrecargaId,
        // Todo el equipo (médicos y enfermería) va como participantes: mismo motor de
        // agenda, conflictos y honorarios.
        participantes: participantes
          .filter((m) => m.personaId)
          .map((m): Participante => ({
            medico_id: m.personaId,
            rol_id: roles.find((r) => r.clave === m.rol)!.id,
            hora_inicio: m.horaInicio,
            hora_fin: m.horaFin,
          })),
        notas: notas || null,
        diagnostico: diagnostico.trim() || null,
        anestesia,
        procedencia: procedencia.trim() || null,
        motivo_consulta: motivoConsulta.trim() || null,
        especialidad_id: especialidades.find((e) => e.clave === especialidad)?.id || null,
        tipo_lio: tipoLio || null,
        modelo_lio_id: modeloLioId || null,
        procedimientos_adicionales: procedimientosAdicionales.filter((id) => id !== servicioId),
      };

      const res = await fetch('/api/cirugias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la cirugía');
      }

      const cirugiaId = data?.cirugia_id;
      if (data?.advertencia) toast(data.advertencia, 'warning');
      if (cirugiaId) {
        let fallidos = 0;
        for (const [i, archivo] of archivos.entries()) {
          setPasoGuardado(`Subiendo archivos (${i + 1}/${archivos.length})…`);
          const fd = new FormData();
          fd.append('archivo', archivo.file);
          fd.append('tipo_documento', archivo.tipo_documento.trim());
          try {
            const r = await fetch(`/api/cirugias/${cirugiaId}/archivos`, { method: 'POST', body: fd });
            if (!r.ok) fallidos++;
          } catch {
            fallidos++;
          }
        }
        if (fallidos > 0) toast(`${fallidos} archivo(s) no se pudieron subir; puedes agregarlos desde el detalle.`, 'warning');
      }

      // La agenda, listas de cirugías y el dashboard se revalidan en segundo plano.
      void invalidar('/api/agenda', '/api/cirugias', '/api/dashboard', '/api/inventario');
      toast('Cirugía creada', 'success');
      router.push(`/cirugias/${cirugiaId}`);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      setError(mensaje);
      toast(mensaje, 'error');
    } finally {
      setGuardando(false);
      setPasoGuardado(null);
    }
  };

  const labelCls = 'block text-xs font-bold text-muted mb-1';
  const inputCls =
    'w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  const origenNombre = useMemo(() => {
    return aseguranzas.find((a) => a.id === origenId)?.nombre || resumenPaciente?.aseguranza?.nombre || '—';
  }, [aseguranzas, origenId, resumenPaciente]);

  return (
    <div className="w-full bg-transparent pb-20">
      <PageHeader title="Nueva cirugía" subtitle="Cree una cirugía homologada en 6 pasos" />

      <div className="mx-auto w-full max-w-6xl px-0 py-6 space-y-6">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 animate-fadeIn dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">{error}</div>
        )}

        {loadingInitial ? (
          <CirugiaFormSkeleton />
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Paciente */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-primary-500" /> 1. Paciente
              </h2>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Filtro de ojo
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro de ojo">
                  {FILTROS_OJO.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroOjo(f.id)}
                      aria-pressed={filtroOjo === f.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        filtroOjo === f.id
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-line text-gray-600 dark:text-fg-2 hover:bg-surface-2'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <SearchInput
                  value={queryPaciente}
                  onChange={setQueryPaciente}
                  placeholder="Buscar paciente por nombre..."
                  aria-label="Buscar paciente"
                />
                {buscandoPacientes && (
                  <Loader2 className="w-4 h-4 animate-spin text-primary-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
                {mostrarPacientes && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-white dark:bg-surface-2 shadow-lg max-h-60 overflow-auto">
                    {pacientesResult.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted">
                        {filtroOjo === 'primer'
                          ? 'Sin pacientes sin cirugías previas para esta búsqueda.'
                          : filtroOjo === 'segundo'
                            ? 'Sin pacientes con cirugía previa (segundo ojo) para esta búsqueda.'
                            : 'Sin coincidencias para esta búsqueda.'}
                      </p>
                    ) : (
                      pacientesResult.map((p) => {
                        const etiqueta = etiquetaOjo(p);
                        return (
                          <button
                            key={p.id}
                            onClick={() => seleccionarPaciente(p)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 border-b border-line/70 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-fg">
                                {p.nombre_completo}
                              </span>
                              {etiqueta && (
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${etiqueta.clase}`}
                                >
                                  {etiqueta.texto}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted">
                              {[p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {pacienteSeleccionado && resumenPaciente && (
                <div className="mt-4 rounded-lg border border-primary-100 dark:border-primary-900/30 bg-primary-50/50 dark:bg-primary-900/10 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-fg">
                        {resumenPaciente.paciente.nombre_completo}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-muted mt-1">
                        Expediente: {resumenPaciente.expediente_id} · {resumenPaciente.paciente.edad || '—'} años ·{' '}
                        {resumenPaciente.paciente.sexo === 'MASCULINO' ? 'H' : 'M'}
                      </div>
                    </div>
                    <a
                      href={`/pacientes/${pacienteSeleccionado.id}/historial`}
                      className="text-xs font-bold text-primary-600 hover:text-primary-700"
                    >
                      Ver expediente
                    </a>
                  </div>
                </div>
              )}
            </section>

            {/* 2. Expediente */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4 text-primary-500" /> 2. Expediente
              </h2>
              {resumenPaciente ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-line/70 bg-surface-2 p-3">
                    <div className="text-xs text-muted">Última consulta</div>
                    <div className="font-medium text-fg">
                      {resumenPaciente.ultima_consulta?.fecha
                         ? resumenPaciente.ultima_consulta.fecha
                        : 'Sin consultas previas'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-muted mt-1 line-clamp-2">
                      {resumenPaciente.ultima_consulta?.diagnostico || '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-line/70 bg-surface-2 p-3">
                    <div className="text-xs text-muted">Antecedentes / historial</div>
                    <div className="font-medium text-fg">
                      {resumenPaciente.consultas_previas} consulta(s) previa(s)
                    </div>
                    <div className="text-xs text-gray-600 dark:text-muted mt-1">
                      {resumenPaciente.cirugias_previas} cirugía(s) previa(s)
                    </div>
                    <a
                      href={`/pacientes/${pacienteSeleccionado!.id}/historial`}
                      className="inline-block mt-2 text-xs font-bold text-primary-600 hover:text-primary-700"
                    >
                      Consultar historial
                    </a>
                  </div>
                </div>
              ) : pacienteSeleccionado ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  Cargando expediente...
                </div>
              ) : (
                <div className="text-sm text-muted">
                  Seleccione un paciente para ver su expediente.
                </div>
              )}
              {pacienteSeleccionado && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Procedencia</label>
                    <input
                      type="text"
                      value={procedencia}
                      onChange={(e) => setProcedencia(e.target.value)}
                      maxLength={255}
                      placeholder="Ej. Ensenada"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Especialidad</label>
                    <select
                      value={especialidad}
                      onChange={(e) => { setEspecialidad(e.target.value); setEspecialidadEditada(true); }}
                      className={cn(inputCls, 'appearance-none')}
                    >
                      <option value="">Seleccionar</option>
                      {especialidades.map((e) => (
                        <option key={e.clave} value={e.clave}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Motivo de consulta</label>
                    <input
                      type="text"
                      value={motivoConsulta}
                      onChange={(e) => setMotivoConsulta(e.target.value)}
                      maxLength={500}
                      placeholder="Ej. Disminución de agudeza visual en OD"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* 3. Datos de cirugía */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <Stethoscope className="w-4 h-4 text-primary-500" /> 3. Datos de la cirugía
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Origen / Aseguradora</label>
                  <div className={cn(inputCls, 'flex items-center justify-between')}>
                    <span>{origenNombre}</span>
                    <select
                      value={origenId}
                      onChange={(e) => {
                        setOrigenId(e.target.value);
                        setServicioId('');
                      }}
                      className="bg-transparent text-sm focus:outline-none"
                    >
                      <option value="">Cambiar origen</option>
                      {aseguranzas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Procedimiento</label>
                  <div className="relative">
                    <select
                      value={servicioId}
                      onChange={(e) => setServicioId(e.target.value)}
                      disabled={!pacienteSeleccionado || loadingServicios}
                      className={cn(inputCls, 'appearance-none disabled:opacity-60 pr-10')}
                    >
                      <option value="">{loadingServicios ? 'Cargando...' : 'Seleccionar procedimiento'}</option>
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                    {loadingServicios && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                  {servicios.length === 0 && pacienteSeleccionado && !loadingServicios && (
                    <div className="text-xs text-amber-600 mt-1">No hay procedimientos para el origen del paciente.</div>
                  )}
                  {servicioId && (
                    <div className="mt-2 space-y-1.5">
                      {procedimientosAdicionales.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {procedimientosAdicionales.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                              + {servicios.find((s) => s.id === id)?.nombre || 'Procedimiento'}
                              <button
                                type="button"
                                onClick={() => setProcedimientosAdicionales((prev) => prev.filter((x) => x !== id))}
                                aria-label="Quitar procedimiento"
                                className="hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {servicios.some((s) => s.id !== servicioId && !procedimientosAdicionales.includes(s.id)) && (
                        <select
                          value=""
                          onChange={(e) => { const v = e.target.value; if (v) setProcedimientosAdicionales((prev) => [...prev, v]); }}
                          className={cn(inputCls, 'appearance-none text-xs')}
                          aria-label="Agregar procedimiento adicional"
                        >
                          <option value="">+ Agregar otro procedimiento…</option>
                          {servicios
                            .filter((s) => s.id !== servicioId && !procedimientosAdicionales.includes(s.id))
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Ojo</label>
                  <select value={ojo} onChange={(e) => setOjo(e.target.value)} className={cn(inputCls, 'appearance-none')}>
                    <option value="">Seleccionar</option>
                    {OJOS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {avisoOjo && (
                    <p
                      className={`mt-1 text-xs ${
                        avisoOjo.startsWith('Segundo ojo:')
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-amber-600 dark:text-amber-300'
                      }`}
                    >
                      {avisoOjo}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Anestesia *</label>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Anestesia">
                    {ANESTESIAS.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        role="radio"
                        aria-checked={anestesia === a.value}
                        onClick={() => setAnestesia(a.value)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                          anestesia === a.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                            : 'border-line text-fg-2 hover:bg-surface-2'
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Diagnóstico</label>
                  <textarea
                    value={diagnostico}
                    onChange={(e) => { setDiagnostico(e.target.value); setDiagnosticoEditado(true); }}
                    rows={2}
                    maxLength={500}
                    placeholder="Diagnóstico que motiva la cirugía"
                    className={cn(inputCls, 'resize-none')}
                  />
                  {resumenPaciente?.ultima_consulta?.diagnostico && !diagnostico && (
                    <button
                      type="button"
                      onClick={() => { setDiagnostico(resumenPaciente.ultima_consulta!.diagnostico || ''); setDiagnosticoEditado(true); }}
                      className="mt-1 text-xs font-bold text-primary-600 hover:underline"
                    >
                      Usar diagnóstico de la última consulta
                    </button>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Hora inicio</label>
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Duración estimada (min)</label>
                  <input
                    type="number"
                    min={1}
                    value={duracionMin}
                    onChange={(e) => setDuracionMin(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 60"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Quirofano / Recurso</label>
                  <select value={recursoId} onChange={(e) => setRecursoId(e.target.value)} className={cn(inputCls, 'appearance-none')}>
                    <option value="">Sin asignar</option>
                    {recursos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre} {r.ubicacion ? `(${r.ubicacion})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 4. Asignación médica y participantes quirúrgico (homologado) */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-primary-500" /> 4. Asignación médica y participantes quirúrgico
              </h2>
              <p className="mb-4 text-xs text-muted">
                Solo el cirujano es obligatorio. El horario sigue al de la cirugía hasta que lo cambies; se valida que nadie quede en dos cirugías a la vez.
              </p>
              {!loadingInitial && roles.length === 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>No hay roles de participante disponibles. Aplica la migración <code className="font-mono text-xs">1800000000170-CreateCirugiaHomologadaTables.ts</code> en tu BD local para poblar <code className="font-mono text-xs">cat_roles_participante</code>.</span>
                </div>
              )}
              <div className="hidden sm:grid grid-cols-12 gap-3 mb-1">
                <span className={cn(labelCls, 'col-span-3')}>Rol</span>
                <span className={cn(labelCls, 'col-span-4')}>Persona</span>
                <span className={cn(labelCls, 'col-span-2')}>Entrada</span>
                <span className={cn(labelCls, 'col-span-2')}>Salida</span>
              </div>
              <div className="space-y-3">
                {participantes.map((m) => {
                  const apoyo = esRolApoyo(m.rol);
                  const lista = apoyo ? [...enfermeria, ...medicosLista] : medicosLista;
                  return (
                    <div key={m.id} className="grid grid-cols-12 gap-3 items-start rounded-lg sm:rounded-none border border-line/70 sm:border-0 p-3 sm:p-0">
                      <div className="col-span-12 sm:col-span-3">
                        <select
                          value={m.rol}
                          onChange={(e) => actualizarParticipante(m.id, { rol: e.target.value })}
                          className={cn(inputCls, 'appearance-none')}
                          aria-label="Rol"
                        >
                          <option value="">Seleccionar rol</option>
                          {opcionesRol.map((r) => (
                            <option key={r.clave} value={r.clave}>
                              {r.nombre}{r.clave === 'cirujano' ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-4">
                        {altaPersonal?.filaId === m.id ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={altaPersonal.nombre}
                              onChange={(e) => setAltaPersonal({ ...altaPersonal, nombre: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') void registrarPersonal(); if (e.key === 'Escape') setAltaPersonal(null); }}
                              maxLength={120}
                              placeholder="Nombre completo"
                              className={inputCls}
                            />
                            <button type="button" onClick={() => void registrarPersonal()} disabled={altaPersonal.guardando} className="rounded-lg bg-primary-600 px-3 text-xs font-bold text-white disabled:opacity-50">
                              {altaPersonal.guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                            </button>
                            <button type="button" onClick={() => setAltaPersonal(null)} className="rounded-lg border border-line px-2 text-xs text-muted" aria-label="Cancelar alta">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <select
                            value={m.personaId}
                            onChange={(e) => {
                              if (e.target.value === '__nuevo__') setAltaPersonal({ filaId: m.id, nombre: '', guardando: false });
                              else actualizarParticipante(m.id, { personaId: e.target.value });
                            }}
                            disabled={!m.rol}
                            className={cn(inputCls, 'appearance-none disabled:opacity-60')}
                            aria-label="Persona"
                          >
                            <option value="">{!m.rol ? 'Elige primero el rol' : apoyo ? 'Seleccionar persona' : 'Seleccionar médico'}</option>
                            {lista.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.nombre}{apoyo && d.tipo_personal !== 'ENFERMERO' ? ' · médico' : ''}
                              </option>
                            ))}
                            {apoyo && <option value="__nuevo__">+ Registrar persona nueva…</option>}
                          </select>
                        )}
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <input
                          type="time"
                          step={900}
                          value={m.horaInicio}
                          onChange={(e) => actualizarParticipante(m.id, { horaInicio: e.target.value })}
                          className={inputCls}
                          aria-label="Hora de entrada"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <input
                          type="time"
                          step={900}
                          value={m.horaFin}
                          onChange={(e) => actualizarParticipante(m.id, { horaFin: e.target.value })}
                          className={inputCls}
                          aria-label="Hora de salida"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => eliminarParticipante(m.id)}
                          disabled={m.rol === 'cirujano' && participantes.filter((x) => x.rol === 'cirujano').length === 1}
                          className="w-full rounded-lg border border-red-200 dark:border-red-900/40 px-3 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={m.rol === 'cirujano' ? 'El cirujano es obligatorio' : 'Quitar fila'}
                        >
                          <X className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={agregarParticipante}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2"
                >
                  <Plus className="w-4 h-4" /> Agregar participante
                </button>
              </div>
            </section>

            {/* 5. LIO / Inventario — orden: tipo → modelo → pieza del inventario (o manual) */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-primary-500" /> 5. Lente intraocular (LIO)
              </h2>
              {esCirugiaConLio && !tipoLio && (
                <p className="mb-3 rounded-lg bg-primary-50/70 px-3 py-2 text-xs text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                  Facoemulsificación + LIO: elige el tipo de lente, luego el modelo y después la pieza del inventario.
                </p>
              )}

              {/* Paso 1: tipo */}
              <div>
                <p className={labelCls}><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">1</span>Tipo de LIO</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de LIO">
                  {TIPOS_LIO.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={tipoLio === t.value}
                      onClick={() => { setTipoLio(tipoLio === t.value ? '' : t.value); setModeloLioId(''); reiniciarPieza(); }}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                        tipoLio === t.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                          : 'border-line text-fg-2 hover:bg-surface-2'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paso 2: modelo */}
              {tipoLioSel && (
                <div className="mt-4">
                  <p className={labelCls}><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">2</span>Modelo</p>
                  <select
                    value={modeloLioId}
                    onChange={(e) => { setModeloLioId(e.target.value); reiniciarPieza(); }}
                    className={cn(inputCls, 'mt-1 appearance-none')}
                    aria-label="Modelo de LIO"
                  >
                    <option value="">{modelosCompatibles.length ? 'Seleccionar modelo' : 'Sin modelos de este tipo en el catálogo'}</option>
                    {modelosCompatibles.map((m) => (
                      <option key={m.id} value={m.id}>
                        {etiquetaModeloLio(m)}{m.verificado ? '' : ' · por verificar'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                    <span>Catálogo en Configuración → Modelos de LIO.</span>
                    <a href={URL_ESCRS_IOL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                      Buscar en ESCRS ↗
                    </a>
                    <a href={URL_IOLCON} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                      Ficha técnica en IOLCon ↗
                    </a>
                  </p>
                </div>
              )}

              {/* Paso 3: pieza física */}
              <div className="mt-4">
                <p className={labelCls}><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">3</span>Lente (pieza física)</p>
                {!lioManual ? (
                  !tipoLioSel ? (
                    <div className="mt-1 space-y-2">
                      <p className="text-xs text-muted">Elige el tipo y el modelo para ver las piezas disponibles de ese lente.</p>
                      {!verTodoInventario ? (
                        <button type="button" onClick={() => setVerTodoInventario(true)} className="text-xs font-bold text-primary-600 hover:underline">
                          Elegir del inventario sin tipo ni modelo
                        </button>
                      ) : (
                        <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} />
                      )}
                    </div>
                  ) : !modeloLioSel ? (
                    <div className="mt-1 space-y-2">
                      <p className="text-xs text-muted">
                        {modelosCompatibles.length
                          ? 'Elige el modelo para ver sus piezas en inventario.'
                          : 'No hay modelos de este tipo en el catálogo: puedes elegir la pieza directo del inventario o capturarla a mano.'}
                      </p>
                      {modelosCompatibles.length === 0 && <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} />}
                    </div>
                  ) : piezasDelModelo.length > 0 && !verTodoInventario ? (
                    <div className="mt-1 space-y-2">
                      <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} modeloPreferido={modeloLioSel} soloModelo />
                      <p className="text-xs text-muted">
                        {piezasDelModelo.length} pieza(s) disponible(s) de este modelo, no caducadas.{' '}
                        <button type="button" onClick={() => setVerTodoInventario(true)} className="font-bold text-primary-600 hover:underline">
                          Ver todo el inventario
                        </button>
                      </p>
                    </div>
                  ) : piezasDelModelo.length > 0 ? (
                    <div className="mt-1 space-y-2">
                      <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} modeloPreferido={modeloLioSel} />
                      <button type="button" onClick={() => setVerTodoInventario(false)} className="text-xs font-bold text-primary-600 hover:underline">
                        Mostrar solo este modelo
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      {liosSWR.isLoading ? 'Buscando piezas en inventario…' : 'No hay piezas disponibles de este modelo en inventario.'}
                      {!liosSWR.isLoading && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={abrirLioManual}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar LIO manual con este modelo
                          </button>
                          <button type="button" onClick={() => setVerTodoInventario(true)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold dark:border-amber-500/40">
                            Elegir otra pieza del inventario
                          </button>
                        </div>
                      )}
                      {verTodoInventario && (
                        <div className="mt-2">
                          <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} modeloPreferido={modeloLioSel} />
                        </div>
                      )}
                    </div>
                  )
                ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Marca</label>
                      <input
                        type="text"
                        value={lioManualMarca}
                        onChange={(e) => setLioManualMarca(e.target.value)}
                        placeholder="Ej. Alcon"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Modelo / Descripción</label>
                      <input
                        type="text"
                        value={lioManualModelo}
                        onChange={(e) => setLioManualModelo(e.target.value)}
                        placeholder="Ej. Clareon PanOptix Toric"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Potencia (dioptrías)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={-40}
                        max={60}
                        value={lioManualPotencia}
                        onChange={(e) => setLioManualPotencia(e.target.value)}
                        placeholder="Ej. 22.5"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Lote / Serie</label>
                      <input
                        type="text"
                        value={lioManualLote}
                        onChange={(e) => setLioManualLote(e.target.value)}
                        placeholder="Ej. L-2024-001"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    LIO fuera de inventario: se registra en la cirugía sin descontar stock.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLioManual(false);
                      setLioManualMarca('');
                      setLioManualModelo('');
                      setLioManualPotencia('');
                      setLioManualLote('');
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2"
                  >
                    ← Volver a seleccionar desde inventario
                  </button>
                </>
                )}
                {!lioManual && (
                  <button
                    type="button"
                    onClick={abrirLioManual}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-line px-4 py-2 text-sm font-bold text-gray-600 dark:text-fg-2 hover:bg-surface-2"
                  >
                    <Plus className="w-4 h-4" /> Agregar LIO manual (no está en inventario)
                  </button>
                )}
              </div>
            </section>

            {/* 6. Archivos de apoyo */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary-500" /> 6. Archivos de apoyo
              </h2>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="rounded-lg border-2 border-dashed border-gray-300 dark:border-line bg-surface-2 p-6 text-center"
              >
                <Upload className="w-6 h-6 mx-auto text-muted" />
                <p className="mt-2 text-sm text-gray-600 dark:text-muted">
                  Arrastra archivos aquí o{' '}
                  <label className="text-primary-600 font-bold cursor-pointer">
                    selecciona
                    <input
                      type="file"
                      multiple
                      accept={EXTENSIONES_PERMITIDAS.join(',')}
                      onChange={(e) => handleFiles(e.target.files)}
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-xs text-muted mt-1">
                  PDF, JPG, JPEG, PNG, WEBP (máx. 10 MB por archivo)
                </p>
              </div>

              {!archivos.some((a) => a.tipo_documento === TIPO_MEDICINA_INTERNA) && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">
                  Recomendado: adjunta la consulta de medicina interna y los exámenes complementarios.
                </p>
              )}
              {archivos.length > 0 && (
                <div className="mt-4 space-y-2">
                  {archivos.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-line/70 bg-surface-2 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fg truncate">{a.file.name}</div>
                        <div className="text-xs text-muted">{formatBytes(a.file.size)}</div>
                      </div>
                      <div className="flex w-48 flex-col gap-1.5">
                        <select
                          value={a.otro ? TIPO_DOCUMENTO_OTRO : a.tipo_documento}
                          onChange={(e) => seleccionarTipoDocumento(a.id, e.target.value)}
                          className={cn(inputCls, 'appearance-none')}
                          aria-label={`Tipo de documento de ${a.file.name}`}
                        >
                          <option value="">Tipo de documento</option>
                          {TIPOS_DOCUMENTO_APOYO.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                          <option value={TIPO_DOCUMENTO_OTRO}>{TIPO_DOCUMENTO_OTRO}…</option>
                        </select>
                        {a.otro && (
                          <input
                            type="text"
                            value={a.tipo_documento}
                            onChange={(e) => actualizarTipoDocumento(a.id, e.target.value)}
                            placeholder="Especifica el tipo"
                            className={inputCls}
                          />
                        )}
                      </div>
                      <button
                        onClick={() => eliminarArchivo(a.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Notas y acciones */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <label className={labelCls}>Notas adicionales</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="Notas, diagnóstico, indicaciones..."
                className={cn(inputCls, 'resize-none')}
              />
            </section>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => router.back()}
                className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={guardando}
                aria-busy={guardando}
                className="flex-[2] rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {guardando ? (pasoGuardado ?? 'Guardando…') : 'Validar y crear cirugía'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NuevaCirugiaPage() {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-12 bg-surface-2 rounded-lg" /><div className="h-32 bg-surface-2 rounded-lg" /></div>}>
      <NuevaCirugiaContent />
    </Suspense>
  );
}
