'use client';

import { Suspense } from 'react';
import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, X, Trash2, FileText, User, Stethoscope, ClipboardList, Users, Eye, Package, Upload, Calendar, Clock, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { useToast } from '@/components/ui/Toast';

// Custom Skeleton for Cirugía Form - matches actual form layout
function CirugiaFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* PageHeader skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 bg-gray-100 dark:bg-[#202327] rounded" />
        <div className="h-4 w-32 bg-gray-100 dark:bg-[#202327] rounded" />
      </div>
      
      {/* Section 1: Paciente */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-32 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="h-8 w-full bg-gray-100 dark:bg-[#202327] rounded mb-3" />
        <div className="h-8 w-full bg-gray-100 dark:bg-[#202327] rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
        </div>
      </div>
      
      {/* Section 2: Expediente */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-40 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
        </div>
      </div>
      
      {/* Section 3: Datos de cirugía */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-36 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
        </div>
      </div>
      
      {/* Section 4: Equipo */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-32 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-3 h-10 bg-gray-100 dark:bg-[#202327] rounded px-3" />
          <div className="flex items-center gap-3 h-10 bg-gray-100 dark:bg-[#202327] rounded px-3" />
        </div>
      </div>
      
      {/* Section 5: Recursos / Inventario */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-32 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
          <div className="h-8 bg-gray-100 dark:bg-[#202327] rounded" />
        </div>
      </div>
      
      {/* Section 6: Archivos / Notas */}
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
        <div className="h-5 w-24 bg-gray-100 dark:bg-[#202327] rounded mb-4" />
        <div className="h-32 bg-gray-100 dark:bg-[#202327] rounded" />
        <div className="mt-3 h-8 bg-gray-100 dark:bg-[#202327] rounded" />
      </div>
      
      {/* Actions skeleton */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <div className="h-10 w-24 bg-gray-100 dark:bg-[#202327] rounded" />
        <div className="h-10 w-24 bg-gray-100 dark:bg-[#202327] rounded" />
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
  sin_cirugias: { texto: 'Sin cirugías previas', clase: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-[#9BA1A6]' },
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

interface Participante {
  id: string;
  medico_id: string;
  rol_id: string;
}

interface ArchivoLocal {
  id: string;
  file: File;
  tipo_documento: string;
}

const OJOS = [
  { value: 'OD', label: 'OD - Ojo derecho' },
  { value: 'OI', label: 'OI - Ojo izquierdo' },
  { value: 'OU', label: 'OU - Ambos ojos' },
];

const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

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

  // Carga de catálogos
  const [aseguranzas, setAseguranzas] = useState<Aseguranza[]>([]);
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  // const [loadingCatalogos, setLoadingCatalogos] = useState(true);

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
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [inventarioItemId, setInventarioItemId] = useState<string | null>(null);
  const [lioManual, setLioManual] = useState(false);
  const [lioManualMarca, setLioManualMarca] = useState('');
  const [lioManualModelo, setLioManualModelo] = useState('');
  const [lioManualPotencia, setLioManualPotencia] = useState('');
  const [lioManualLote, setLioManualLote] = useState('');
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [notas, setNotas] = useState('');

  const [guardando, setGuardando] = useState(false);
const [error, setError] = useState<string | null>(null);

  // Para auto-fill de procedimiento desde consulta
  const [procedimientoPendiente, setProcedimientoPendiente] = useState<string | null>(null);
  const [cirujanoPendiente, setCirujanoPendiente] = useState<{ id: string; nombre: string } | null>(null);

// Fast loading: only catalogs block the form; consulta/patient loads in background
  const [loadingInitial, setLoadingInitial] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    const signal = abort.signal;

    let cancelled = false;

    // HARD SAFETY: Force form to render after 10s max, no matter what
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        setLoadingInitial(false);
      }
    }, 10000);

    const loadInitialData = async () => {
      try {
        // 1. FAST: Load catalogs only (4 parallel) - this is quick
        const fetchWithTimeout = (url: string, signal: AbortSignal, timeoutMs = 8000) => {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          );
          return Promise.race([fetch(url, { signal }), timeout]);
        };

        const responses = await Promise.all([
          fetchWithTimeout('/api/configuracion/aseguranzas', signal),
          fetchWithTimeout('/api/configuracion/doctores', signal),
          fetchWithTimeout('/api/cirugias/roles', signal),
          fetchWithTimeout('/api/cirugias/recursos', signal),
        ]);

        if (signal.aborted) return;

        const errors: string[] = [];
        const jsons = await Promise.all(
          responses.map((r, i) => {
            const names = ['aseguranzas', 'doctores', 'roles', 'recursos'];
            if (!r.ok) {
              errors.push(names[i]);
              return Promise.resolve([]);
            }
            return r.json();
          }),
        );
        const [a, d, ro, re] = jsons;

        if (signal.aborted) return;

        if (errors.length > 0) {
          toast(`Error al cargar catálogos: ${errors.join(', ')}`, 'error');
        }
        setAseguranzas(Array.isArray(a) ? a : []);
        // El API devuelve `alias` (nombre de presentación) y `nombre` (nombre real, puede ser null).
        setDoctores(
          Array.isArray(d)
            ? d.map((x: Doctor & { alias?: string | null }) => ({ ...x, nombre: x.alias || x.nombre || x.id }))
            : [],
        );
        setRoles(Array.isArray(ro) ? ro : []);
        setRecursos(Array.isArray(re) ? re : []);

        // CATALOGS LOADED - Form can now render
        if (!cancelled) setLoadingInitial(false);

        // 2. BACKGROUND: Load consulta preload data (non-blocking)
        if (!signal.aborted) {
          loadConsultaData(signal);
        }

      } catch (err) {
        if (signal.aborted || err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) {
          toast(err instanceof Error ? err.message : 'Error al cargar catálogos', 'error');
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
      }
    };

    // Background loading - completely non-blocking
    const loadConsultaData = async (signal: AbortSignal) => {
      const hasDirectParams = pacientePrecargaId || procedimientoPrecarga || cirujanoIdPrecarga;
      if (!consultaPrecargaId && !hasDirectParams) return;

      try {
        let consultaData = null;

        if (consultaPrecargaId) {
          const res = await fetch(`/api/consultas/${consultaPrecargaId}`, { signal });
          if (!res.ok || signal.aborted) return;
          consultaData = await res.json();
        }

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

        // Diagnóstico → notas
        if (consultaData?.consulta?.diagnostico && !signal.aborted) {
          setNotas(`Diagnóstico de consulta: ${consultaData.consulta.diagnostico}`);
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
            setParticipantes([{ id: crypto.randomUUID(), medico_id: cirujanoId, rol_id: rolCirujano.id }]);
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

    // Start fast path: catalogs only - store promise to track completion
    const promise = loadInitialData();

    // Cleanup
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, consultaPrecargaId, pacientePrecargaId, pacienteNombrePrecarga, procedimientoPrecarga, cirujanoIdPrecarga, cirujanoNombrePrecarga]);

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
      return;
    }
    // Si el query corresponde al paciente ya seleccionado (precarga), no buscar ni mostrar dropdown
    if (pacienteSeleccionado && queryPaciente === pacienteSeleccionado.nombre_completo) {
      setPacientesResult([]);
      setMostrarPacientes(false);
      return;
    }
    const t = setTimeout(() => {
      setBuscandoPacientes(true);
      fetch(`/api/search?q=${encodeURIComponent(queryPaciente)}&cirugia=${filtroOjo}`)
        .then((r) => r.json())
        .then((data) => {
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
        .finally(() => setBuscandoPacientes(false));
    }, 300);
    return () => clearTimeout(t);
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
    fetch(`/api/catalogo-servicios?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setServicios(Array.isArray(data?.servicios) ? data.servicios : []);
      })
      .catch(() => setServicios([]))
      .finally(() => setLoadingServicios(false));
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

  const agregarParticipante = () => {
    setParticipantes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), medico_id: '', rol_id: '' },
    ]);
  };

  const actualizarParticipante = (id: string, campo: keyof Participante, valor: string) => {
    setParticipantes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p))
    );
  };

  const eliminarParticipante = (id: string) => {
    setParticipantes((prev) => prev.filter((p) => p.id !== id));
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
    if (participantes.length === 0) return 'Debe asignar al menos un participante';
    const tieneCirujano = participantes.some((p) => {
      const rol = roles.find((r) => r.id === p.rol_id);
      return rol?.clave === 'cirujano' && !!p.medico_id;
    });
    if (!tieneCirujano) return 'Debe asignar al menos un cirujano';
    for (const a of archivos) {
      if (!a.tipo_documento.trim()) return `Indica el tipo de documento para "${a.file.name}"`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validarFormulario();
    if (validationError) {
      setError(validationError);
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
        participantes: participantes.map((p) => ({
          medico_id: p.medico_id,
          rol_id: p.rol_id,
        })),
        notas: notas || null,
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
      if (cirugiaId) {
        for (const archivo of archivos) {
          const fd = new FormData();
          fd.append('archivo', archivo.file);
          fd.append('tipo_documento', archivo.tipo_documento.trim());
          await fetch(`/api/cirugias/${cirugiaId}/archivos`, { method: 'POST', body: fd });
        }
      }

      router.push(`/cirugias/${cirugiaId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  };

  const labelCls = 'block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1';
  const inputCls =
    'w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  const origenNombre = useMemo(() => {
    return aseguranzas.find((a) => a.id === origenId)?.nombre || resumenPaciente?.aseguranza?.nombre || '—';
  }, [aseguranzas, origenId, resumenPaciente]);

  return (
    <div className="w-full bg-transparent pb-20">
      <PageHeader title="Nueva cirugía" subtitle="Cree una cirugía homologada en 6 pasos" />

      <div className="mx-auto w-full max-w-6xl px-0 py-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {loadingInitial ? (
          <CirugiaFormSkeleton />
        ) : (
          <>
            {/* 1. Paciente */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
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
                          : 'border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#9BA1A6] hover:bg-gray-50 dark:hover:bg-[#1D1F23]'
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
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] shadow-lg max-h-60 overflow-auto">
                    {pacientesResult.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-500 dark:text-[#71767B]">
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
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#1D1F23] border-b border-gray-100 dark:border-[#2F3336] last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900 dark:text-[#E7E9EA]">
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
                            <div className="text-xs text-gray-500 dark:text-[#71767B]">
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
                      <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
                        {resumenPaciente.paciente.nombre_completo}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-[#71767B] mt-1">
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
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4 text-primary-500" /> 2. Expediente
              </h2>
              {resumenPaciente ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-3">
                    <div className="text-xs text-gray-500 dark:text-[#71767B]">Última consulta</div>
                    <div className="font-medium text-gray-900 dark:text-[#E7E9EA]">
                      {resumenPaciente.ultima_consulta?.fecha
                         ? resumenPaciente.ultima_consulta.fecha
                        : 'Sin consultas previas'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-[#71767B] mt-1 line-clamp-2">
                      {resumenPaciente.ultima_consulta?.diagnostico || '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-3">
                    <div className="text-xs text-gray-500 dark:text-[#71767B]">Antecedentes / historial</div>
                    <div className="font-medium text-gray-900 dark:text-[#E7E9EA]">
                      {resumenPaciente.consultas_previas} consulta(s) previa(s)
                    </div>
                    <div className="text-xs text-gray-600 dark:text-[#71767B] mt-1">
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
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#71767B]">
                  <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  Cargando expediente...
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-[#71767B]">
                  Seleccione un paciente para ver su expediente.
                </div>
              )}
            </section>

            {/* 3. Datos de cirugía */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
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

            {/* 4. Asignación médica */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-primary-500" /> 4. Asignación médica
              </h2>
              {!loadingInitial && roles.length === 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>No hay roles de participante disponibles. Aplica la migración <code className="font-mono text-xs">1800000000170-CreateCirugiaHomologadaTables.ts</code> en tu BD local para poblar <code className="font-mono text-xs">cat_roles_participante</code>.</span>
                </div>
              )}
              <div className="space-y-3">
                {participantes.map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <label className={labelCls}>Médico</label>}
                      <select
                        value={p.medico_id}
                        onChange={(e) => actualizarParticipante(p.id, 'medico_id', e.target.value)}
                        className={cn(inputCls, 'appearance-none')}
                      >
                        <option value="">Seleccionar médico</option>
                        {doctores.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-5">
                      {idx === 0 && <label className={labelCls}>Rol</label>}
                      <select
                        value={p.rol_id}
                        onChange={(e) => actualizarParticipante(p.id, 'rol_id', e.target.value)}
                        className={cn(inputCls, 'appearance-none')}
                      >
                        <option value="">Seleccionar rol</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <button
                        onClick={() => eliminarParticipante(p.id)}
                        className="w-full rounded-lg border border-red-200 dark:border-red-900/40 px-3 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Eliminar participante"
                      >
                        <X className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={agregarParticipante}
                  disabled={roles.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" /> Agregar participante
                </button>
              </div>
            </section>

            {/* 5. LIO / Inventario */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-primary-500" /> 5. Lente intraocular (LIO)
              </h2>
              {!lioManual ? (
                <>
                  <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} />
                  <p className="text-xs text-gray-500 dark:text-[#71767B] mt-2">
                    Opcional. Solo se muestran LIOs disponibles y no caducados.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInventarioItemId(null);
                      setLioManual(true);
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#9BA1A6] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
                  >
                    <Plus className="w-4 h-4" /> Agregar LIO manual (no está en inventario)
                  </button>
                </>
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
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
                  >
                    ← Volver a seleccionar desde inventario
                  </button>
                </>
              )}
            </section>

            {/* 6. Archivos de apoyo */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary-500" /> 6. Archivos de apoyo
              </h2>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="rounded-lg border-2 border-dashed border-gray-300 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-6 text-center"
              >
                <Upload className="w-6 h-6 mx-auto text-gray-400 dark:text-[#71767B]" />
                <p className="mt-2 text-sm text-gray-600 dark:text-[#71767B]">
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
                <p className="text-xs text-gray-400 dark:text-[#71767B] mt-1">
                  PDF, JPG, JPEG, PNG, WEBP (máx. 10 MB por archivo)
                </p>
              </div>

              {archivos.length > 0 && (
                <div className="mt-4 space-y-2">
                  {archivos.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA] truncate">{a.file.name}</div>
                        <div className="text-xs text-gray-500 dark:text-[#71767B]">{formatBytes(a.file.size)}</div>
                      </div>
                      <input
                        type="text"
                        value={a.tipo_documento}
                        onChange={(e) => actualizarTipoDocumento(a.id, e.target.value)}
                        placeholder="Tipo de documento"
                        className={cn(inputCls, 'w-40')}
                      />
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
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
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
                className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={guardando}
                className="flex-[2] rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Validar y crear cirugía'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function NuevaCirugiaPage() {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-12 bg-gray-100 dark:bg-[#202327] rounded-lg" /><div className="h-32 bg-gray-100 dark:bg-[#202327] rounded-lg" /></div>}>
      <NuevaCirugiaContent />
    </Suspense>
  );
}
