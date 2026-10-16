'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import useSWR from 'swr';
import { Aseguranza, OPCIONES_CATALOGO, Doctor, Rol, comoLista, Paciente, PacienteResumen, HistorialOjo, Servicio, ArchivoLocal, EXTENSIONES_PERMITIDAS, Participante, BorradorCirugia, CLAVE_BORRADOR_CIRUGIA, CirugiaFormSkeleton, OJOS, formatBytes } from '@/components/cirugia/nueva-cirugia-comun';
import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback, Suspense } from 'react';
import { type TelefonoPaciente, normalizarTelefonos, telefonoPrincipal } from '@/lib/telefonos-paciente';
import { type MiembroEquipo, ROLES_POR_DEFECTO, equipoPorDefecto, sincronizarHorario, ROLES_APOYO, ETIQUETAS_ROL, esRolApoyo, validarEquipo } from '@/lib/catalogos/equipo-quirurgico';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { type ModeloLio, URL_IOLCON } from '@/lib/catalogos/modelos-lio';
import type { NuevoModeloLio } from '@/components/cirugia/SelectorModeloLio';
import { type LIODisponible, URL_LIOS_DISPONIBLES, obtenerLIOs } from '@/components/cirugia/LIOSelector';
import { useInvalidar } from '@/hooks/useFetch';
import { esProcedimientoConLio, TIPO_DOCUMENTO_OTRO, tipoLioDe, tipoLioDesdeProcedimiento, ANESTESIAS, TIPO_MEDICINA_INTERNA, DOCUMENTOS_REQUERIDOS } from '@/lib/catalogos/cirugia';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { esEnfermeria, esMedicoTratante, esAnestesiologo, ROL_ANESTESIOLOGO, puedeOcuparRol } from '@/lib/catalogos/personal';
import { ApiError, enviarJSON, mensajeDeError, nuevaClaveIdempotencia } from '@/lib/fetcher';
import { useBorrador } from '@/hooks/useBorrador';
import { useUser } from '@/hooks/useUser';
import { aMinutos, deMinutos } from '@/lib/agenda-slots';
import { puedeEditarCirugia } from '@/lib/permisos-edicion';
import PageHeader from '@/components/ui/PageHeader';
import { useVolver } from '@/components/layout/RutaNavegacion';
import AvisoBorrador from '@/components/ui/AvisoBorrador';
import { User, Loader2, Plus, ClipboardList, Stethoscope, X, Eye, Users, AlertTriangle, FileText, Upload, Trash2, CheckCircle2 } from 'lucide-react';
import SearchInput from '@/components/ui/SearchInput';
import { DatosPacienteFicha, PanelExpediente } from '@/components/pacientes/PanelExpediente';
import { PacienteDetalleAPI, normalizarPacienteDetalle } from '@/components/consultations/nueva-consulta-comun';
import { BuscadorServicio } from '@/components/consultations/BuscadorServicio';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import EditorDatosPaciente, { faltantesDatosGenerales, puedeEditarPaciente } from '@/components/pacientes/EditorDatosPaciente';
import { cn } from '@/lib/utils';
import CampoTextoDiferido from '@/components/ui/CampoTextoDiferido';
import LenteLogistica, { type LenteForm, type LenteComprometidoInfo, type OrdenLenteForm, lenteVacio, MODOS_LENTE, lenteCapturado, validarLente } from '@/components/cirugia/LenteLogistica';
import BuscadorDiagnosticoCIE10 from '@/components/diagnosticos/BuscadorDiagnosticoCIE10';

const SIN_GENERICOS = new Set<string>();
/** Bloque reservado en la agenda cuando aún no se conoce la hora de fin. */
const DURACION_ESTIMADA_MIN = 60;

/** Nombre normalizado para comparar: sin acentos, minúsculas y espacios simples. */
const normalizarNombre = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Datos que devuelve GET /api/cirugias/[id]/edicion para precargar el formulario. */
interface EdicionCirugiaData {
  cirugia: Record<string, any>;
  paciente: { id: string; nombre_completo: string; telefono: string | null; email: string | null; aseguranza_id?: string | null };
  participantes: Array<{ medico_id: string; rol_id: string; hora_inicio: string | null; hora_fin: string | null }>;
  personal: Array<{ rol: string; personal_id: string; hora_inicio: string | null; hora_fin: string | null }>;
  qx_ids: string[];
  lentes: Array<{
    orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO'; inventario_item_id: string | null; fabricante: string | null; modelo: string | null;
    poder_d: number | null; torico: boolean; estado: string; modo?: LenteForm['modo']; marca?: boolean; cilindro?: number | null;
  }>;
  archivos: Array<{ id: string; nombre_original: string; tipo_documento: string | null; size: number | null }>;
}
interface ArchivoExistente { id: string; nombre_original: string; tipo_documento: string | null; size: number | null }

function FormularioCirugiaContent({ cirugiaId: cirugiaEditId }: { cirugiaId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  // Mismo formulario para crear y editar: con cirugiaId se precarga y se guarda sobre esa cirugía.
  const modoEdicion = !!cirugiaEditId;
  const { user } = useUser();
  const esUsuarioEnfermeria = user?.rol === 'enfermero';
  const rolUsuarioRef = useRef<string | null>(null);
  rolUsuarioRef.current = user?.rol ?? null;
  const [edicion, setEdicion] = useState<EdicionCirugiaData | null>(null);
  // Corrección de una cirugía ya completada: se editan los datos; los lentes usados quedan fijos.
  const cirugiaCompletada = String(edicion?.cirugia?.estado ?? '').toLowerCase() === 'completada';
  const [cargandoEdicion, setCargandoEdicion] = useState(modoEdicion);
  const [archivosExistentes, setArchivosExistentes] = useState<ArchivoExistente[]>([]);
  const edicionCargadaRef = useRef(false);
  const saltarResetServiciosRef = useRef(modoEdicion);
  const param = (k: string) => (modoEdicion ? null : searchParams.get(k));
  const consultaPrecargaId = param('consulta_id');
  const volver = useVolver({
    href: modoEdicion ? `/cirugias/${cirugiaEditId}` : consultaPrecargaId ? `/consultas/${consultaPrecargaId}` : '/agenda',
    label: modoEdicion ? 'Cirugía' : consultaPrecargaId ? 'Consulta' : 'Agenda',
  });
  const fechaPrecarga = param('fecha');
  const horaPrecarga = param('hora');
  const pacientePrecargaId = param('paciente_id');
  const pacienteNombrePrecarga = param('paciente_nombre');
  const procedimientoPrecarga = param('procedimiento');
  const cirujanoIdPrecarga = param('cirujano_id');
  const cirujanoNombrePrecarga = param('cirujano_nombre');

  // Carga de catálogos vía SWR: caché compartida con otras pantallas (configuración,
  // consultas, productividad) y con la precarga de /bienvenida. Al volver a esta
  // pantalla se muestran al instante y se revalidan en segundo plano.
  const aseguranzasSWR = useSWR<Aseguranza[]>('/api/configuracion/aseguranzas', OPCIONES_CATALOGO);
  const doctoresSWR = useSWR<Array<Doctor & { alias?: string | null }>>('/api/configuracion/doctores', OPCIONES_CATALOGO);
  const rolesSWR = useSWR<Rol[]>('/api/cirugias/roles', OPCIONES_CATALOGO);
  const aseguranzas = useMemo(() => comoLista(aseguranzasSWR.data), [aseguranzasSWR.data]);
  // El API devuelve `alias` (nombre de presentación) y `nombre` (nombre real, puede ser null).
  const doctores = useMemo<Doctor[]>(
    () => comoLista(doctoresSWR.data).map((x) => ({ ...x, nombre: x.alias || x.nombre || x.id })),
    [doctoresSWR.data],
  );
  const roles = useMemo(() => comoLista(rolesSWR.data), [rolesSWR.data]);
  const catalogos = [
    { nombre: 'aseguranzas', swr: aseguranzasSWR },
    { nombre: 'doctores', swr: doctoresSWR },
    { nombre: 'roles', swr: rolesSWR },
  ];
  const catalogosListos = catalogos.every((c) => c.swr.data !== undefined || c.swr.error !== undefined);
  const catalogosConError = catalogos.filter((c) => c.swr.error !== undefined && c.swr.data === undefined).map((c) => c.nombre).join(', ');

  // Paciente
  const [queryPaciente, setQueryPaciente] = useState('');
  const [pacientesResult, setPacientesResult] = useState<Paciente[]>([]);
  const [buscandoPacientes, setBuscandoPacientes] = useState(false);
  const [mostrarPacientes, setMostrarPacientes] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  // Alta rápida de paciente desde la cirugía (con número de expediente).
  const [altaPaciente, setAltaPaciente] = useState<null | {
    numero_expediente: string; nombre_completo: string; sexo: 'H' | 'M'; fecha_nacimiento: string; telefono: string;
    telefonos: TelefonoPaciente[];
    guardando: boolean; error: string | null;
  }>(null);
  const [resumenPaciente, setResumenPaciente] = useState<PacienteResumen | null>(null);
  // Datos personales completos del paciente elegido (tarjeta de la sección 1 y expediente lateral).
  const [editandoPaciente, setEditandoPaciente] = useState(false);
  const { data: fichaPaciente, mutate: mutateFicha } = useSWR<PacienteDetalleAPI>(
    pacienteSeleccionado ? `/api/pacientes/${encodeURIComponent(pacienteSeleccionado.id)}` : null,
    { revalidateOnFocus: false },
  );
  const [historialOjo, setHistorialOjo] = useState<HistorialOjo | null>(null);
  const [avisoOjo, setAvisoOjo] = useState<string | null>(null);

  // Servicios (dependen del paciente = origen)
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);

  // Formulario
  const [origenId, setOrigenId] = useState('');
  const [servicioId, setServicioId] = useState('');
  // Procedimientos quirúrgicos de la cirugía (catálogo de Conceptos); el primero es el principal.
  const [qxIds, setQxIds] = useState<string[]>([]);
  const catalogoQxId = qxIds[0] ?? '';
  const [ojo, setOjo] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [quirofano, setQuirofano] = useState('');
  // Duración derivada del horario (fin − inicio); '' si el horario no es válido.
  const duracionMin = useMemo<number | ''>(() => {
    if (!hora || !horaFin) return '';
    const a = hora.split(':').map(Number);
    const b = horaFin.split(':').map(Number);
    const d = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
    return d > 0 ? d : '';
  }, [hora, horaFin]);
  const horaFinInvalida = Boolean(hora && horaFin) && duracionMin === '';
  // La hora de fin es opcional al agendar (se registra la real al completar): sin ella se
  // aparta un bloque estimado en la agenda para detectar empalmes.
  const duracionEfectiva = useMemo<number | ''>(
    () => (duracionMin !== '' ? duracionMin : hora && !horaFin ? DURACION_ESTIMADA_MIN : ''),
    [duracionMin, hora, horaFin],
  );
  // Equipo quirúrgico homologado: Rol · Persona · Horario. Roles por defecto
  // precargados (ids deterministas para no romper la hidratación); solo el
  // cirujano es obligatorio y se pueden agregar más filas.
  const [participantes, setParticipantes] = useState<MiembroEquipo[]>(() => {
    let n = 0;
    return equipoPorDefecto('', '', () => `def-${n++}`);
  });
  const [altaPersonal, setAltaPersonal] = useState<{ filaId: string; nombre: string; guardando: boolean; tipo?: 'MEDICO' | 'ENFERMERO' | 'ANESTESIOLOGO' } | null>(null);
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  // Motivo por el que cada documento requerido no se adjunta (clave = tipo de documento).
  const [motivosDoc, setMotivosDoc] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');
  // Punto I: diagnóstico propio (antes se copiaba a Notas) y anestesia obligatoria.
  const [diagnostico, setDiagnostico] = useState('');
  const [diagnosticoEditado, setDiagnosticoEditado] = useState(false);
  const [anestesia, setAnestesia] = useState('');
  // Punto I.1: datos generales de la cirugía
  const [procedencia, setProcedencia] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [especialidadEditada, setEspecialidadEditada] = useState(false);
  const { especialidades } = useEspecialidades();
  // Punto I.2: procedimientos adicionales, tipo de LIO y personal de apoyo no médico
  const [procedimientosAdicionales, setProcedimientosAdicionales] = useState<string[]>([]);
  // C13: ojo de cada procedimiento adicional (por defecto, el ojo de la cirugía).
  const [ojosAdicionales, setOjosAdicionales] = useState<Record<string, 'OD' | 'OI' | 'OU'>>({});
  // Lentes de la cirugía (primero, segundo y respaldo): cada uno se asigna, se solicita o es compra directa.
  const [lentes, setLentes] = useState<LenteForm[]>([lenteVacio('PRIMERO')]);
  const cambiarLente = (orden: OrdenLenteForm, patch: Partial<LenteForm>) =>
    setLentes((prev) => prev.map((l) => (l.orden === orden ? { ...l, ...patch } : l)));
  const primerLente = lentes.find((l) => l.orden === 'PRIMERO') ?? lenteVacio('PRIMERO');
  const modelosLioSWR = useSWR<ModeloLio[]>('/api/catalogos/modelos-lio', OPCIONES_CATALOGO);
  const liosSWR = useSWR<LIODisponible[]>(URL_LIOS_DISPONIBLES, obtenerLIOs, { revalidateOnFocus: false });
  const comprometidosSWR = useSWR<LenteComprometidoInfo[]>('/api/inventario/lentes-comprometidos', { revalidateOnFocus: false });
  const modelosLio = useMemo(() => (Array.isArray(modelosLioSWR.data) ? modelosLioSWR.data : []), [modelosLioSWR.data]);
  const modeloLioSel = modelosLio.find((m) => m.id === primerLente.modeloId) || null;
  const procedenciasSWR = useSWR<string[]>('/api/catalogos/procedencias', OPCIONES_CATALOGO);
  const catalogoQxSWR = useSWR<{ id: string; nombre: string; ojo: string | null; activo?: boolean }[]>('/api/configuracion/catalogo-quirurgico', OPCIONES_CATALOGO);
  // Cirugías elegibles: activas y una por nombre (el ojo se elige aparte, no forma parte del nombre).
  const cirugiasElegibles = useMemo(() => {
    const vistos = new Set<string>();
    return (catalogoQxSWR.data || []).filter((c) => {
      if (c.activo === false) return false;
      const k = normalizarNombre(c.nombre);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [catalogoQxSWR.data]);
  // Alta rápida de una cirugía que no está en el catálogo.
  const [altaCirugia, setAltaCirugia] = useState<null | { nombre: string; guardando: boolean; error: string | null }>(null);
  const procedenciasSugeridas = useMemo(() => (Array.isArray(procedenciasSWR.data) ? procedenciasSWR.data : []), [procedenciasSWR.data]);
  // Sin consulta de origen: precarga el diagnóstico de la última consulta del paciente
  // (solo si el usuario no lo ha escrito/cambiado).
  useEffect(() => {
    const dx = resumenPaciente?.ultima_consulta?.diagnostico;
    if (!diagnosticoEditado) setDiagnostico(dx || '');
  }, [resumenPaciente, diagnosticoEditado]);

  const [guardando, setGuardando] = useState(false);
  // Comentarios clínica (oct 2026): misma persona, fecha y ojo → reagenda o reintervención.
  const decisionDuplicadoRef = useRef<{ tipo_caso?: 'REAGENDA' | 'REINTERVENCION'; reagenda_de_id?: string } | null>(null);
  const [duplicadoPendiente, setDuplicadoPendiente] = useState<{
    candidatas: Array<{ id: string; fecha: string; hora: string | null; ojo: string; estado: string }>;
  } | null>(null);
  /** Misma clave en reintentos del mismo envío → el servidor no duplica la cirugía. */
  const claveEnvioRef = useRef<string | null>(null);
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
  /** Tras crear la cirugía se deja de autoguardar (no revivir un borrador ya guardado). */
  const [cirugiaCreada, setCirugiaCreada] = useState(false);
  const creadaRef = useRef(false);
  const [pasoGuardado, setPasoGuardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Errores por campo: tras un intento de guardar se recalculan en vivo; los del servidor
  // (p. ej. conflicto de horario) se quitan al cambiar el campo implicado.
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  // Al fallar la validación, lleva la vista al aviso (el formulario es largo).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);
  // Un error del servidor sobre el horario/equipo se retira en cuanto se cambian esos campos.
  useEffect(() => {
    setErroresServidor((prev) => (Object.keys(prev).length ? {} : prev));
  }, [fecha, hora, horaFin, participantes]);
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
      fetch(`/api/search?q=${encodeURIComponent(queryPaciente)}`)
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
  }, [queryPaciente, pacienteSeleccionado]);

  // Ojo: primer / segundo ojo según el historial del paciente seleccionado
  useEffect(() => {
    if (!pacienteSeleccionado || !historialOjo) return;
    const { total, od, oi, desconocido } = historialOjo;
    if (total === 0) {
      setAvisoOjo(null);
      return;
    }
    const ojoYaOperado = desconocido || (od && oi) ? null : od ? 'OD' : oi ? 'OI' : null;
    if (!ojoYaOperado) {
      setAvisoOjo('Ambos ojos operados (o sin especificar): elige el ojo manualmente.');
      return;
    }
    setAvisoOjo(`${ojoYaOperado} ya operado · ${total} cirugía(s) previa(s).`);
  }, [pacienteSeleccionado, historialOjo]);

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
    // En edición, la primera carga conserva los procedimientos de la cirugía.
    if (saltarResetServiciosRef.current) {
      saltarResetServiciosRef.current = false;
    } else {
      setServicioId('');
      setQxIds([]);
      setProcedimientosAdicionales([]);
    }
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
    const match = servicios.find((s) => normalizarNombre(s.nombre) === normalizarNombre(procedimientoPendiente));
    if (match) {
      setServicioId(match.id);
      setProcedimientoPendiente(null);
    }
  }, [servicios, procedimientoPendiente]);

  // ¿Algún procedimiento implica LIO (Faco + LIO)? → se ofrece el tipo de LIO.
  // Procedimiento del catálogo quirúrgico elegido (Faco, catarata…).
  const nombresQx = useMemo(
    () => qxIds.map((id) => (catalogoQxSWR.data || []).find((c) => c.id === id)?.nombre ?? '').filter(Boolean),
    [catalogoQxSWR.data, qxIds],
  );
  const agregarQx = (id: string, nombreConocido?: string) => {
    if (!id || qxIds.includes(id)) return;
    setQxIds((prev) => [...prev, id]);
    // El nombre de la cirugía ya dice si el LIO es tórico (y si es monofocal o trifocal):
    // se aplica al primer lente mientras no se haya capturado nada en él.
    const pista = tipoLioDesdeProcedimiento(nombreConocido ?? (catalogoQxSWR.data || []).find((c) => c.id === id)?.nombre);
    if (pista?.torico != null) {
      setLentes((prev) => prev.map((l) => (l.orden === 'PRIMERO' && !lenteCapturado(l) ? { ...l, torico: pista.torico as boolean } : l)));
    }
    // Si aún no hay facturación, se sugiere el servicio con el mismo nombre exacto.
    if (!servicioId) {
      const nombre = (catalogoQxSWR.data || []).find((c) => c.id === id)?.nombre;
      const coincide = nombre ? servicios.find((s) => normalizarNombre(s.nombre) === normalizarNombre(nombre)) : undefined;
      if (coincide) setServicioId(coincide.id);
    }
  };
  const quitarQx = (id: string) => setQxIds((prev) => prev.filter((x) => x !== id));
  // Diseño de LIO sugerido por la cirugía (ordena primero los modelos de ese tipo).
  const disenoLioSugerido = useMemo(
    () => nombresQx.map((n) => tipoLioDesdeProcedimiento(n)?.diseno ?? null).find(Boolean) ?? null,
    [nombresQx],
  );
  const puedeAgregarCatalogos = !!user && user.rol !== 'enfermero';
  const registrarCirugiaCatalogo = async () => {
    if (!altaCirugia || altaCirugia.guardando) return;
    const nombre = altaCirugia.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) { setAltaCirugia({ ...altaCirugia, error: 'Escribe el nombre de la cirugía' }); return; }
    const existente = cirugiasElegibles.find((c) => normalizarNombre(c.nombre) === normalizarNombre(nombre));
    if (existente) { agregarQx(existente.id); setAltaCirugia(null); return; }
    setAltaCirugia({ ...altaCirugia, guardando: true, error: null });
    try {
      const creada = await enviarJSON<{ id: string; nombre: string; ojo: string | null; activo?: boolean }>(
        '/api/configuracion/catalogo-quirurgico', 'POST', { nombre },
      );
      await catalogoQxSWR.mutate((prev) => [...(prev || []), { ...creada, activo: true }], { revalidate: false });
      agregarQx(creada.id, creada.nombre);
      setAltaCirugia(null);
      toast('Cirugía agregada al catálogo', 'success');
    } catch (err) {
      setAltaCirugia((a) => (a ? { ...a, guardando: false, error: mensajeDeError(err, 'No se pudo agregar la cirugía') } : a));
    }
  };
  /** Alta rápida de marca/modelo de LIO desde el bloque de lentes. */
  const agregarModeloLio = async (m: NuevoModeloLio): Promise<ModeloLio> => {
    try {
      const creado = await enviarJSON<ModeloLio>('/api/catalogos/modelos-lio', 'POST', m);
      await modelosLioSWR.mutate(
        (prev) => (Array.isArray(prev) && !prev.some((x) => x.id === creado.id) ? [...prev, { ...creado, activo: true }] : prev),
        { revalidate: false },
      );
      toast(`Modelo ${creado.modelo} agregado`, 'success');
      return creado;
    } catch (err) {
      throw new Error(mensajeDeError(err, 'No se pudo agregar el modelo'));
    }
  };
  // La facturación se toma del primer procedimiento quirúrgico con nombre igual a un servicio de la aseguradora.
  useEffect(() => {
    if (!qxIds.length) return;
    const match = nombresQx
      .map((n) => servicios.find((s) => normalizarNombre(s.nombre) === normalizarNombre(n)))
      .find(Boolean);
    // El precio vive en el catálogo quirúrgico: sin coincidencia con un servicio de la aseguradora
    // no se pide nada; el servidor resuelve la facturación (ver cirugia-servicio-facturacion).
    if (!match) {
      if (modoEdicion && servicios.length === 0) return;
      setServicioId('');
      return;
    }
    setServicioId(match.id);
  }, [nombresQx, servicios, qxIds.length, modoEdicion]);
  // Cualquier procedimiento de Faco (catálogo quirúrgico, facturación o adicional) muestra los lentes.
  const esCirugiaConLio = useMemo(
    () => nombresQx.some((n) => esProcedimientoConLio(n)) || [servicioId, ...procedimientosAdicionales].some((id) => {
      const s = servicios.find((x) => x.id === id);
      return !!s && (s.requiere_lio === true || esProcedimientoConLio(s.nombre));
    }),
    [nombresQx, servicioId, procedimientosAdicionales, servicios],
  );

  // El LIO solo aplica a Faco + LIO: si se quita ese procedimiento, se limpia la selección.
  useEffect(() => {
    if (esCirugiaConLio) return;
    // En edición no se vacían los lentes hasta tener cargados los catálogos que definen el Faco.
    if (modoEdicion && (cargandoEdicion || !catalogoQxSWR.data || servicios.length === 0)) return;
    setLentes([lenteVacio('PRIMERO')]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCirugiaConLio]);

  // Documentos requeridos: el cálculo de lente solo aplica si se agregó algún lente.
  const hayLente = esCirugiaConLio && lentes.some(lenteCapturado);
  // El cálculo de lente solo es obligatorio con lentes de Bausch, Johnson & Johnson o Alcon.
  const esMarcaCalculo = (m: string | null | undefined) =>
    /BAUSCH|JOHNSON|J\s*&\s*J|ALCON/.test((m ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
  const marcaDeItem = (id: string | null | undefined) => liosSWR.data?.find((i) => i.id === id)?.marca;
  const requiereCalculo = hayLente && lentes.some((l) => lenteCapturado(l) && [
    l.fabricante,
    modelosLio.find((m) => m.id === l.modeloId)?.fabricante,
    marcaDeItem(l.itemId),
  ].some(esMarcaCalculo));
  const documentosChecklist = DOCUMENTOS_REQUERIDOS
    .filter((d) => !d.soloConLente || requiereCalculo)
    .map((d) => ({
      ...d,
      adjunto: archivos.find((a) => a.tipo_documento === d.tipo)?.file.name
        ?? archivosExistentes.find((a) => a.tipo_documento === d.tipo)?.nombre_original
        ?? null,
    }));
  const docsSinMotivo = documentosChecklist.filter((d) => !d.adjunto && !(motivosDoc[d.tipo] ?? '').trim());
  const docsFaltantesPayload = documentosChecklist
    .filter((d) => !d.adjunto)
    .map((d) => ({ tipo_documento: d.tipo, motivo: (motivosDoc[d.tipo] ?? '').trim() }));

  // Especialidad sugerida: la del cirujano principal (editable).
  useEffect(() => {
    if (especialidadEditada) return;
    const cirujano = participantes.find((m) => m.rol === 'cirujano' && m.personaId);
    const esp = buscarEspecialidad(especialidades, doctores.find((d) => d.id === cirujano?.personaId)?.especialidad);
    if (esp) setEspecialidad(esp.clave);
  }, [participantes, doctores, especialidades, especialidadEditada]);

  // El horario de cada miembro sigue al de la cirugía hasta que se edita a mano.
  useEffect(() => {
    setParticipantes((prev) => sincronizarHorario(prev, hora, duracionEfectiva));
  }, [hora, duracionEfectiva]);

  // Roles del catálogo (médicos y de apoyo: instrumentista, enfermero, circulante).
  const opcionesRol = useMemo(() => {
    const delCatalogo = roles.map((r) => ({ clave: r.clave, nombre: r.nombre }));
    // Si la mig. 390 aún no sembró 'enfermero', se muestra igual (la validación avisa).
    const faltantes = ROLES_APOYO.filter((c) => !delCatalogo.some((r) => r.clave === c)).map((c) => ({ clave: c, nombre: ETIQUETAS_ROL[c] }));
    return [...delCatalogo, ...faltantes];
  }, [roles]);
  // Personal unificado: enfermería primero para roles de apoyo; médicos para el resto.
  // Anestesiólogos: solo en el rol «Anestesiólogo» (y ese rol solo los muestra a ellos).
  const enfermeria = useMemo(() => doctores.filter(esEnfermeria), [doctores]);
  const medicosLista = useMemo(() => doctores.filter(esMedicoTratante), [doctores]);
  const anestesiologos = useMemo(() => doctores.filter(esAnestesiologo), [doctores]);

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

  /** Alta rápida de paciente: lo crea y lo deja seleccionado. */
  const registrarPaciente = async () => {
    if (!altaPaciente || altaPaciente.guardando) return;
    const nombre = altaPaciente.nombre_completo.trim();
    const expediente = altaPaciente.numero_expediente.trim();
    const telefonosAlta = normalizarTelefonos(altaPaciente.telefonos);
    const telefono = telefonoPrincipal(telefonosAlta) ?? '';
    const error = !nombre
      ? 'El nombre es requerido'
      : altaPaciente.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(altaPaciente.fecha_nacimiento)
        ? 'La fecha de nacimiento no es válida'
        : expediente.length > 50
          ? 'El número de expediente admite máximo 50 caracteres'
          : telefono.length > 20
            ? 'El teléfono admite máximo 20 caracteres'
            : null;
    if (error) { setAltaPaciente({ ...altaPaciente, error }); return; }
    setAltaPaciente({ ...altaPaciente, guardando: true, error: null });
    try {
      // Fecha de nacimiento opcional: solo se envía si se capturó.
      const payload: Record<string, unknown> = { nombre_completo: nombre, sexo: altaPaciente.sexo };
      if (altaPaciente.fecha_nacimiento) payload.fecha_nacimiento = altaPaciente.fecha_nacimiento;
      if (expediente) payload.numero_expediente = expediente;
      if (telefono) {
        payload.telefono = telefono;
        payload.telefonos = telefonosAlta;
      }
      const creado = await enviarJSON<{
        id: string;
        nombre_completo?: string;
        telefono?: string | null;
        email?: string | null;
        aseguranza_id?: string | null;
      }>('/api/pacientes', 'POST', payload);
      setAltaPaciente(null);
      void invalidar('/api/pacientes', '/api/search');
      toast('Paciente creado', 'success');
      await seleccionarPaciente({
        id: creado.id,
        nombre_completo: creado.nombre_completo || nombre,
        telefono: creado.telefono ?? null,
        email: creado.email ?? null,
        aseguranza_id: creado.aseguranza_id ?? null,
      });
    } catch (err) {
      const msg = mensajeDeError(err, 'No se pudo crear el paciente');
      setAltaPaciente((a) => (a ? { ...a, guardando: false, error: msg } : a));
    }
  };

  /** Alta rápida de enfermería (Personal médico unificado), sin honorarios por defecto. */
  const registrarPersonal = async () => {
    if (!altaPersonal || altaPersonal.guardando || !altaPersonal.nombre.trim()) return;
    setAltaPersonal({ ...altaPersonal, guardando: true });
    try {
      const nombre = altaPersonal.nombre.trim();
      const tipo = altaPersonal.tipo ?? 'MEDICO';
      const creado = await enviarJSON<{ id: string }>('/api/configuracion/doctores', 'POST', {
        alias: nombre, nombre,
        ...(tipo === 'ENFERMERO' ? { especialidad: 'Enfermería' } : {}),
        tipo_personal: tipo,
        cobra_honorarios: tipo !== 'ENFERMERO',
      });
      await doctoresSWR.mutate();
      actualizarParticipante(altaPersonal.filaId, { personaId: creado.id });
      setAltaPersonal(null);
      toast('Enfermero(a) registrado en Personal médico', 'success');
    } catch (err) {
      toast(mensajeDeError(err, 'No se pudo registrar'), 'error');
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

  /** Todos los errores del formulario, cada uno asociado al campo que debe marcarse en rojo. */
  const validarCampos = (): { campo: string; mensaje: string }[] => {
    const e: { campo: string; mensaje: string }[] = [];
    const add = (campo: string, mensaje: string) => { if (!e.some((x) => x.campo === campo)) e.push({ campo, mensaje }); };
    if (!pacienteSeleccionado) add('paciente', 'Debe seleccionar un paciente');
    if (!qxIds.length && !servicioId) add('qx', 'Selecciona la cirugía');
    if (!ojo) add('ojo', 'Debe seleccionar el ojo');
    if (!fecha) add('fecha', 'Debe indicar la fecha');
    if (!hora) add('hora', 'Debe indicar la hora de inicio');
    if (horaFin && duracionMin === '') add('horaFin', 'La hora de fin debe ser posterior a la hora de inicio');
    if (!anestesia) add('anestesia', 'Selecciona el tipo de anestesia');
    if (!participantes.some((m) => m.personaId)) {
      add('participantes', 'Debe asignar al menos un participante');
      const vacio = participantes.find((m) => m.rol === 'cirujano') ?? participantes[0];
      if (vacio) add(`pp:${vacio.id}`, 'Elige a la persona');
    } else {
      // Cada falla se marca en la celda exacta (rol o persona) de la fila implicada.
      for (const m of participantes) if (m.personaId && !m.rol) add(`pr:${m.id}`, 'Elige el rol');
      const sinCirujano = !participantes.some((m) => m.rol === 'cirujano' && m.personaId);
      if (sinCirujano) {
        const fila = participantes.find((m) => m.rol === 'cirujano');
        if (fila) add(`pp:${fila.id}`, 'Asigna al cirujano');
        else add('participantes', 'Debe asignar al menos un cirujano');
      }
      const errorEquipo = validarEquipo(participantes);
      if (errorEquipo) add('participantes', errorEquipo);
      for (const m of participantes) {
        if (m.personaId && m.rol && !roles.find((r) => r.clave === m.rol)) {
          add(`pr:${m.id}`, `El rol «${ETIQUETAS_ROL[m.rol] || m.rol}» no existe en el catálogo (aplica la migración 390)`);
        }
      }
    }
    if (esCirugiaConLio && !cirugiaCompletada) {
      for (const l of lentes) {
        if (l.orden === 'PRIMERO' && !lenteCapturado(l)) continue;
        const el = validarLente(l, modelosLio);
        if (el) add('lentes', el);
      }
    }
    if (docsSinMotivo.length) add('documentos', `Adjunta o indica el motivo de: ${docsSinMotivo.map((d) => d.etiqueta).join(', ')}`);
    for (const a of archivos) {
      if (!a.tipo_documento.trim()) add('archivos', `Indica el tipo de documento para "${a.file.name}"`);
    }
    return e;
  };

  const validarFormulario = (): string | null => validarCampos()[0]?.mensaje ?? null;

  /** Plan de lentes (primero, segundo y respaldo) para crear o actualizar la cirugía. */
  const construirPlanLentes = () =>
    esCirugiaConLio
      ? lentes
          .filter((l) => l.orden !== 'PRIMERO' || lenteCapturado(l))
          .map((l) => {
            const m = modelosLio.find((x) => x.id === l.modeloId);
            const item = liosSWR.data?.find((i) => i.id === l.itemId);
            const potenciaTxt = l.potencia.trim().replace(',', '.');
            const cilTxt = l.cilindro.trim().replace(',', '.');
            return {
              orden: l.orden,
              modo: l.modo,
              torico: l.torico,
              marca: l.marca,
              fabricante: (m ? m.fabricante : item?.marca ?? l.fabricante) || null,
              modelo: (m ? m.modelo : item?.modelo) || null,
              poder_d: potenciaTxt ? Number(potenciaTxt) : item?.potencia_dioptrias ?? null,
              cilindro: l.torico && cilTxt ? Number(cilTxt) : null,
              inventario_item_id: l.modo === 'ASIGNAR' ? l.itemId : null,
            };
          })
      : [];

  /** Edición: mismos datos y lógica que la alta, aplicados sobre la cirugía existente. */
  const guardarEdicion = async (origenFinal: string) => {
    const id = cirugiaEditId!;
    setPasoGuardado('Guardando datos de la cirugía…');
    await enviarJSON(`/api/agenda/${id}`, 'PATCH', {
      fecha,
      hora,
      duracion_min: Number(duracionEfectiva) || DURACION_ESTIMADA_MIN,
      quirofano: quirofano.trim() || null,
      ojo,
      anestesia,
      procedencia: procedencia.trim() || null,
      diagnostico: diagnostico.trim() || null,
      notas: notas.trim() || null,
      origen_id: origenFinal,
      ...(servicioId ? { servicio_id: servicioId } : {}),
      procedimientos_qx_ids: qxIds,
      documentos_faltantes: docsFaltantesPayload,
      especialidad_id: especialidades.find((e) => e.clave === especialidad)?.id || null,
      ...(cirugiaCompletada ? {} : {
        modelo_lio_id: esCirugiaConLio ? primerLente.modeloId || null : null,
        lio_torico: esCirugiaConLio ? primerLente.torico : null,
      }),
    });

    // Enfermería edita los datos, pero el equipo y los lentes los gestiona el personal de agenda.
    if (!esUsuarioEnfermeria) {
      setPasoGuardado('Guardando equipo quirúrgico…');
      await enviarJSON(`/api/cirugias/${id}/equipo`, 'PUT', {
        participantes: participantes
          .filter((m) => m.personaId)
          .map((m) => ({
            medico_id: m.personaId,
            rol_id: roles.find((r) => r.clave === m.rol)!.id,
            hora_inicio: m.horaInicio,
            hora_fin: m.horaFin,
          })),
        // Personal de apoyo anterior (personal_clinico): se conserva tal cual.
        personal: (edicion?.personal ?? [])
          .filter((p) => p.hora_inicio && p.hora_fin)
          .map((p) => ({ rol: p.rol, personal_id: p.personal_id, hora_inicio: p.hora_inicio!.slice(0, 5), hora_fin: p.hora_fin!.slice(0, 5) })),
      });
      // Completada: los lentes ya se resolvieron al cerrar (usados / liberados) y no se tocan.
      if (esCirugiaConLio && !cirugiaCompletada) {
        setPasoGuardado('Guardando lentes…');
        await enviarJSON(`/api/cirugias/${id}/lentes-plan`, 'PUT', { plan: construirPlanLentes() });
      }
    }

    if (archivos.length) {
      let fallidos = 0;
      let terminados = 0;
      for (const archivo of archivos) {
        setPasoGuardado(`Subiendo archivos (${terminados}/${archivos.length})…`);
        const fd = new FormData();
        fd.append('archivo', archivo.file);
        fd.append('tipo_documento', archivo.tipo_documento.trim());
        try {
          await enviarJSON(`/api/cirugias/${id}/archivos`, 'POST', fd, { timeoutMs: 120_000 });
        } catch {
          fallidos++;
        }
        terminados++;
      }
      if (fallidos > 0) toast(`${fallidos} archivo(s) no se pudieron subir; puedes agregarlos desde el detalle.`, 'warning');
    }

    void invalidar('/api/agenda', '/api/cirugias', '/api/dashboard', '/api/inventario', '/api/pacientes', '/api/search');
    setCirugiaCreada(true);
    toast('Cirugía actualizada', 'success');
    router.push(`/cirugias/${id}`);
  };

  const quitarArchivoExistente = async (archivoId: string) => {
    if (!window.confirm('¿Quitar este archivo de la cirugía?')) return;
    try {
      await enviarJSON(`/api/cirugias/${cirugiaEditId}/archivos/${archivoId}`, 'DELETE');
      setArchivosExistentes((prev) => prev.filter((a) => a.id !== archivoId));
      toast('Archivo eliminado', 'success');
    } catch (e) {
      toast(mensajeDeError(e, 'No se pudo eliminar el archivo'), 'error');
    }
  };

  const handleSubmit = async () => {
    if (guardando) return; // evita doble envío
    const fallas = validarCampos();
    if (fallas.length) {
      setIntentoEnvio(true);
      setErroresServidor({});
      setError(null);
      toast(fallas.length === 1 ? fallas[0].mensaje : `Revisa ${fallas.length} campos marcados en rojo`, 'warning');
      // Tras pintar los errores, lleva a la vista el primero.
      window.setTimeout(() => {
        const primero = document.querySelector<HTMLElement>('[data-error="true"]');
        primero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      return;
    }
    setGuardando(true);
    setError(null);
    setErroresServidor({});

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
      if (modoEdicion) {
        await guardarEdicion(origenFinal);
        return;
      }

      const body = {
        paciente_id: pacienteSeleccionado!.id,
        origen_id: origenFinal,
        ...(servicioId ? { servicio_id: servicioId } : {}),
        catalogo_quirurgico_id: catalogoQxId || null,
        procedimientos_qx_ids: qxIds,
        fecha,
        hora,
        duracion_min: Number(duracionEfectiva) || DURACION_ESTIMADA_MIN,
        recurso_id: null,
        quirofano: quirofano.trim() || null,
        documentos_faltantes: docsFaltantesPayload,
        ojo,
        inventario_item_id: esCirugiaConLio && primerLente.modo === 'ASIGNAR' ? primerLente.itemId : null,
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
        especialidad_id: especialidades.find((e) => e.clave === especialidad)?.id || null,
        // Tipo de LIO derivado del modelo (diseño × tórico); sin modelo, solo la bandera tórico.
        tipo_lio: esCirugiaConLio && modeloLioSel ? tipoLioDe(modeloLioSel.diseno, modeloLioSel.torico)?.value ?? null : null,
        lio_torico: esCirugiaConLio ? primerLente.torico : null,
        modelo_lio_id: esCirugiaConLio ? primerLente.modeloId || null : null,
        procedimientos_adicionales: procedimientosAdicionales.filter((id) => id !== servicioId),
        ojos_procedimientos: Object.fromEntries(
          procedimientosAdicionales.filter((id) => id !== servicioId).map((id) => [id, ojosAdicionales[id] ?? ((ojo as 'OD' | 'OI' | 'OU') || 'OD')]),
        ),
        lentes_plan: construirPlanLentes(),
        ...(decisionDuplicadoRef.current ?? {}),
      };

      if (!claveEnvioRef.current) claveEnvioRef.current = nuevaClaveIdempotencia();
      const data = await enviarJSON<{ cirugia_id?: string; advertencia?: string }>('/api/cirugias', 'POST', body, {
        idempotencia: claveEnvioRef.current,
      });
      claveEnvioRef.current = null;

      const cirugiaId = data?.cirugia_id;
      if (data?.advertencia) toast(data.advertencia, 'warning');
      if (cirugiaId) {
        // Subida en paralelo (máx. 3 a la vez) en lugar de uno por uno.
        let fallidos = 0;
        let terminados = 0;
        const pendientes = [...archivos];
        if (pendientes.length) setPasoGuardado(`Subiendo archivos (0/${archivos.length})…`);
        const subir = async () => {
          for (let archivo = pendientes.shift(); archivo; archivo = pendientes.shift()) {
            const fd = new FormData();
            fd.append('archivo', archivo.file);
            fd.append('tipo_documento', archivo.tipo_documento.trim());
            try {
              await enviarJSON(`/api/cirugias/${cirugiaId}/archivos`, 'POST', fd, { timeoutMs: 120_000 });
            } catch {
              fallidos++;
            }
            terminados++;
            setPasoGuardado(`Subiendo archivos (${terminados}/${archivos.length})…`);
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, pendientes.length) }, subir));
        if (fallidos > 0) toast(`${fallidos} archivo(s) no se pudieron subir; puedes agregarlos desde el detalle.`, 'warning');
      }

      // La agenda, listas de cirugías y el dashboard se revalidan en segundo plano.
      void invalidar('/api/agenda', '/api/cirugias', '/api/dashboard', '/api/inventario', '/api/pacientes', '/api/search');
      // Todo listo (cirugía + archivos): el formulario queda bloqueado en «creada» mientras
      // se abre la agenda en el día de la cirugía, sin volver a mostrar «Validar y crear».
      creadaRef.current = true;
      setCirugiaCreada(true);
      setPasoGuardado('Cirugía creada · abriendo la agenda…');
      borrador.limpiar();
      toast('Cirugía creada', 'success');
      router.push(fecha ? `/agenda?fecha=${encodeURIComponent(fecha)}` : '/agenda');
    } catch (err: unknown) {
      const candidatas = err instanceof ApiError && err.status === 409
        ? (err.datos?.candidatas as Array<{ id: string; fecha: string; hora: string | null; ojo: string; estado: string }> | undefined)
        : undefined;
      if (candidatas && candidatas.length > 0) {
        // Nueva clave de idempotencia para reintentar con la decisión elegida.
        claveEnvioRef.current = null;
        setDuplicadoPendiente({ candidatas });
        return;
      }
      const mensaje = mensajeDeError(err, modoEdicion ? 'No se pudo guardar la cirugía. Intenta de nuevo.' : 'No se pudo crear la cirugía. Intenta de nuevo.');
      const conflictos = err instanceof ApiError && err.status === 409
        ? (err.datos?.conflictos as Array<{ tipo?: string }> | undefined)
        : undefined;
      if (conflictos && conflictos.length > 0) {
        // Choque de horario: se marcan solo los campos realmente implicados
        // (hora de la cirugía y la persona exacta que está ocupada), cada uno con su motivo.
        const nuevos: Record<string, string> = {};
        const lista = err instanceof ApiError ? ((err.datos?.conflictos as Array<{ tipo?: string; medico_id?: string; fecha?: string; hora_inicio?: string; hora_fin?: string }>) ?? []) : [];
        const tipoTxt = (t?: string) => { const v = (t || '').toLowerCase(); return v === 'estudio' ? 'un estudio' : v === 'consulta' ? 'una consulta' : v === 'cirugia' ? 'una cirugía' : v === 'procedimiento' ? 'un procedimiento' : 'otra actividad'; };
        for (const c of lista) {
          const rango = `${String(c.hora_inicio || '').slice(0, 5)}–${String(c.hora_fin || '').slice(0, 5)}`;
          const fila = c.medico_id ? participantes.find((m) => m.personaId === c.medico_id) : undefined;
          if (fila) nuevos[`pp:${fila.id}`] = nuevos[`pp:${fila.id}`] ?? `Ocupado: ya tiene ${tipoTxt(c.tipo)} de ${rango}`;
          nuevos.hora = nuevos.hora ?? `Se empalma con ${tipoTxt(c.tipo)} de ${rango}`;
          nuevos.horaFin = nuevos.horaFin ?? 'Termina dentro de un horario ocupado';
        }
        setErroresServidor(nuevos);
        setIntentoEnvio(true);
        window.setTimeout(() => document.querySelector<HTMLElement>('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      }
      setError(mensaje);
      toast(mensaje, 'error');
    } finally {
      if (!creadaRef.current) {
        setGuardando(false);
        setPasoGuardado(null);
      }
    }
  };

  // ── Edición: precarga de la cirugía en el mismo formulario ──
  useEffect(() => {
    if (!modoEdicion || loadingInitial || edicionCargadaRef.current) return;
    if (roles.length === 0 || modelosLioSWR.data === undefined || !user) return;
    edicionCargadaRef.current = true;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/cirugias/${cirugiaEditId}/edicion`);
        if (!res.ok) throw new Error(res.status === 404 ? 'La cirugía no existe' : 'No se pudo cargar la cirugía');
        const d = (await res.json()) as EdicionCirugiaData;
        if (cancelado) return;
        const c = d.cirugia;
        if (!puedeEditarCirugia(c.estado, rolUsuarioRef.current)) {
          toast(String(c.estado).toLowerCase().startsWith('cancel')
            ? 'Una cirugía cancelada no se puede editar: reagéndala o crea una nueva'
            : 'Enfermería no puede corregir una cirugía completada; pídelo a recepción', 'warning');
          router.replace(`/cirugias/${cirugiaEditId}`);
          return;
        }
        const horaIni = String(c.hora ?? '').slice(0, 5);
        const dur = Number(c.duracion_min) > 0 ? Number(c.duracion_min) : 60;
        const horaFinCalc = horaIni ? deMinutos(aMinutos(horaIni) + dur) : '';
        const compacto = (t: string | null | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const miembros: MiembroEquipo[] = d.participantes.map((p, i) => {
          const hi = p.hora_inicio?.slice(0, 5) || horaIni;
          const hf = p.hora_fin?.slice(0, 5) || horaFinCalc;
          return {
            id: `ed-${i}`,
            rol: roles.find((r) => r.id === p.rol_id)?.clave ?? '',
            personaId: p.medico_id,
            horaInicio: hi,
            horaFin: hf,
            horarioEditado: hi !== horaIni || hf !== horaFinCalc,
          };
        });
        // Roles por defecto sin persona, para poder completarlos como en la alta.
        let extra = 0;
        for (const rol of ROLES_POR_DEFECTO) {
          if (!miembros.some((m) => m.rol === rol)) {
            miembros.push({ id: `ed-extra-${extra++}`, rol, personaId: '', horaInicio: horaIni, horaFin: horaFinCalc, horarioEditado: false });
          }
        }

        const lentesForm: LenteForm[] = d.lentes
          .filter((l) => l.estado === 'RESERVADO')
          .map((l) => {
            const modo = l.modo ?? 'ASIGNAR';
            const modelo = modelosLio.find((m) => compacto(m.modelo) === compacto(l.modelo) && compacto(m.fabricante) === compacto(l.fabricante))
              ?? modelosLio.find((m) => compacto(m.modelo) === compacto(l.modelo));
            return {
              orden: l.orden,
              modo,
              torico: !!l.torico,
              marca: !!l.marca,
              fabricante: modelo?.fabricante ?? l.fabricante ?? '',
              modeloId: modelo?.id ?? '',
              potencia: l.poder_d != null ? String(l.poder_d) : '',
              cilindro: l.cilindro != null ? String(l.cilindro) : '',
              itemId: modo === 'ASIGNAR' ? l.inventario_item_id : null,
            };
          });
        if (lentesForm.length && !lentesForm.some((l) => l.orden === 'PRIMERO')) lentesForm.unshift(lenteVacio('PRIMERO'));

        // Todo en un mismo lote de estado: los efectos de catálogo no pisan lo cargado.
        setPacienteSeleccionado({
          id: d.paciente.id,
          nombre_completo: d.paciente.nombre_completo,
          telefono: d.paciente.telefono,
          email: d.paciente.email,
          aseguranza_id: d.paciente.aseguranza_id ?? undefined,
        } as Paciente);
        setQueryPaciente(d.paciente.nombre_completo);
        setOrigenId(c.origen_id ?? '');
        setQxIds(d.qx_ids);
        setServicioId(c.servicio_id ?? '');
        setOjo(c.ojo ?? '');
        setFecha(c.fecha ?? '');
        setHora(horaIni);
        setHoraFin(horaFinCalc);
        setQuirofano(c.quirofano ?? '');
        setAnestesia(c.anestesia ?? '');
        setProcedencia(c.procedencia ?? '');
        setDiagnostico(c.diagnostico ?? '');
        setDiagnosticoEditado(true);
        setNotas(c.notas ?? '');
        setMotivosDoc(Object.fromEntries(((c.documentos_faltantes ?? []) as Array<{ tipo_documento: string; motivo: string }>).map((x) => [x.tipo_documento, x.motivo])));
        setParticipantes(miembros);
        setLentes(lentesForm.length ? lentesForm : [lenteVacio('PRIMERO')]);
        setArchivosExistentes(d.archivos);
        setEdicion(d);
        setCargandoEdicion(false);

        // Resumen del paciente para el panel (sin tocar el origen de la cirugía).
        fetch(`/api/pacientes/${d.paciente.id}/resumen`)
          .then((r) => (r.ok ? r.json() : null))
          .then((resumen) => { if (!cancelado) setResumenPaciente(resumen); })
          .catch(() => {});
      } catch (e) {
        if (cancelado) return;
        edicionCargadaRef.current = false;
        setCargandoEdicion(false);
        const msg = mensajeDeError(e, 'No se pudo cargar la cirugía');
        setError(msg);
        toast(msg, 'error');
      }
    })();
    return () => { cancelado = true; edicionCargadaRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEdicion, loadingInitial, roles.length, modelosLioSWR.data, user?.rol]);

  // Edición: especialidad guardada (cuando ya cargó el catálogo).
  const especialidadEdicionAplicada = useRef(false);
  useEffect(() => {
    if (!modoEdicion || !edicion || especialidadEdicionAplicada.current || especialidades.length === 0) return;
    especialidadEdicionAplicada.current = true;
    const esp = especialidades.find((e) => e.id === edicion.cirugia.especialidad_id);
    if (esp) {
      setEspecialidad(esp.clave);
      setEspecialidadEditada(true);
    }
  }, [modoEdicion, edicion, especialidades]);

  // ── Borrador autoguardado (no se pierde la captura por error, recarga o sesión vencida) ──
  const conPrecarga = !!(consultaPrecargaId || pacientePrecargaId || procedimientoPrecarga || cirujanoIdPrecarga || fechaPrecarga);
  const datosBorrador = useMemo<BorradorCirugia | null>(
    () =>
      pacienteSeleccionado || servicioId || notas.trim() || diagnosticoEditado
        ? {
            paciente: pacienteSeleccionado, origenId, servicioId, ojo, fecha, hora, horaFin, quirofano, motivosDocumentos: motivosDoc,
            participantes, notas, diagnostico, diagnosticoEditado, anestesia, procedencia, especialidad,
            especialidadEditada, procedimientosAdicionales, lentes,
          }
        : null,
    [pacienteSeleccionado, origenId, servicioId, ojo, fecha, hora, horaFin, quirofano, motivosDoc, participantes, notas,
      diagnostico, diagnosticoEditado, anestesia, procedencia, especialidad, especialidadEditada,
      procedimientosAdicionales, lentes],
  );
  const borrador = useBorrador<BorradorCirugia>(CLAVE_BORRADOR_CIRUGIA, datosBorrador, {
    activo: !modoEdicion && !loadingInitial && !conPrecarga && !guardando && !cirugiaCreada,
  });
  const recuperarBorrador = async () => {
    const d = borrador.pendiente?.datos;
    borrador.aceptar();
    if (!d) return;
    // Primero el paciente (carga su resumen e historial de ojos), luego el resto.
    if (d.paciente) await seleccionarPaciente(d.paciente);
    setOrigenId(d.origenId);
    setServicioId(d.servicioId);
    setOjo(d.ojo);
    setFecha(d.fecha);
    setHora(d.hora);
    setHoraFin(d.horaFin ?? '');
    setQuirofano(d.quirofano ?? '');
    setMotivosDoc(d.motivosDocumentos ?? {});
    if (Array.isArray(d.participantes) && d.participantes.length) setParticipantes(d.participantes);
    setNotas(d.notas);
    setDiagnostico(d.diagnostico);
    setDiagnosticoEditado(d.diagnosticoEditado);
    setAnestesia(d.anestesia);
    setProcedencia(d.procedencia);
    setEspecialidad(d.especialidad);
    setEspecialidadEditada(d.especialidadEditada);
    setProcedimientosAdicionales(d.procedimientosAdicionales || []);
    if (Array.isArray(d.lentes) && d.lentes.length) {
      // Borradores anteriores a la logística de lentes no traen modo/marca/cilindro.
      setLentes((d.lentes as Partial<LenteForm>[]).map((l) => ({
        ...lenteVacio((l.orden as OrdenLenteForm) || 'PRIMERO'), ...l,
        modo: l.modo === 'SIN_TRAMITE' || MODOS_LENTE.some((m) => m.value === l.modo) ? (l.modo as LenteForm['modo']) : 'SIN_TRAMITE',
        cilindro: l.cilindro ?? '', marca: !!l.marca,
      })));
    }
    toast('Borrador recuperado. Revisa los datos y vuelve a adjuntar archivos si había.', 'success');
  };

  const listaErrores = [
    ...(intentoEnvio ? validarCampos() : []),
    ...Object.entries(erroresServidor).map(([campo, mensaje]) => ({ campo, mensaje })),
  ];
  const msgs: Record<string, string> = {};
  for (const x of listaErrores) if (!msgs[x.campo]) msgs[x.campo] = x.mensaje;
  const etiquetaCampo = (campo: string) => {
    if (campo.startsWith('pp:') || campo.startsWith('pr:')) {
      const fila = participantes.find((m) => m.id === campo.slice(3));
      const rolNombre = fila ? (ETIQUETAS_ROL[fila.rol] || roles.find((r) => r.clave === fila.rol)?.nombre || 'Participante') : 'Participante';
      const persona = fila ? doctores.find((d) => d.id === fila.personaId)?.nombre : '';
      return campo.startsWith('pp:') ? `${rolNombre}${persona ? ` (${persona})` : ''}` : `${rolNombre} · rol`;
    }
    return ETIQUETA_CAMPO[campo] ?? campo;
  };
  /** Atributos del contenedor de un campo: lo marcan en rojo cuando tiene error. */
  const ec = (campo: string) => ({ 'data-campo': campo, 'data-error': msgs[campo] ? ('true' as const) : undefined });
  const irACampo = (campo: string) => {
    const el = document.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('input, select, button, textarea')?.focus({ preventScroll: true });
  };
  const ETIQUETA_CAMPO: Record<string, string> = {
    paciente: 'Paciente', qx: 'Cirugía', ojo: 'Ojo', fecha: 'Fecha', hora: 'Hora de inicio', horaFin: 'Hora de fin',
    anestesia: 'Anestesia', participantes: 'Participantes', lentes: 'Lente intraocular', documentos: 'Documentos requeridos', archivos: 'Archivos',
  };
  const labelCls = 'block text-xs font-bold text-muted mb-1';
  const inputCls =
    'w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';


  return (
    <div className="w-full bg-transparent pb-20">
      {duplicadoPendiente && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="duplicado-titulo">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 id="duplicado-titulo" className="text-base font-bold text-fg">Ya hay una cirugía de este ojo en esa fecha</h3>
            <p className="mt-1 text-sm text-fg-2">¿Qué es esta cirugía?</p>
            <div className="mt-4 space-y-2">
              {duplicadoPendiente.candidatas.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => { decisionDuplicadoRef.current = { tipo_caso: 'REAGENDA', reagenda_de_id: c.id }; setDuplicadoPendiente(null); void handleSubmit(); }}
                  className="w-full rounded-lg border border-line p-3 text-left text-sm hover:bg-surface-2">
                  <span className="block font-semibold text-fg">Reagenda de la cirugía del {c.fecha}{c.hora ? ` ${c.hora.slice(0, 5)}` : ''}</span>
                  <span className="block text-fg-2">Reemplaza la anterior: sus lentes se liberan.</span>
                </button>
              ))}
              <button type="button"
                onClick={() => { decisionDuplicadoRef.current = { tipo_caso: 'REINTERVENCION' }; setDuplicadoPendiente(null); void handleSubmit(); }}
                className="w-full rounded-lg border border-line p-3 text-left text-sm hover:bg-surface-2">
                <span className="block font-semibold text-fg">Reintervención</span>
                <span className="block text-fg-2">Cirugía adicional del mismo ojo; ambas quedan activas.</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => { decisionDuplicadoRef.current = null; setDuplicadoPendiente(null); }}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg-2 hover:bg-surface-2">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <PageHeader
        title={modoEdicion ? 'Editar cirugía' : 'Nueva cirugía'}
        subtitle={modoEdicion ? 'Modifica los datos de la cirugía; se guarda con la misma lógica que la alta' : 'Cree una cirugía homologada en 4 pasos'}
        backLink={{
          // Ruta recorrida: regresa a la pantalla de origen (Pacientes, Agenda, Consulta…).
          href: volver.href,
          label: volver.label,
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-0 py-6 space-y-6">
        {!modoEdicion && borrador.pendiente && !conPrecarga && (
          <AvisoBorrador
            ts={borrador.pendiente.ts}
            que="una cirugía"
            onRecuperar={() => void recuperarBorrador()}
            onDescartar={borrador.descartar}
          />
        )}
        {modoEdicion && cirugiaCompletada && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Esta cirugía ya está <strong>completada</strong>. Puedes corregir sus datos, el equipo y los archivos; el cambio queda en el historial. Los lentes usados no se modifican.
          </div>
        )}
        {modoEdicion && esUsuarioEnfermeria && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            Como enfermería puedes editar los datos de la cirugía; los cambios al equipo y a los lentes los registra el personal de agenda.
          </div>
        )}
        {error && (
          <div ref={errorRef} role="alert" className="scroll-mt-24 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 animate-fadeIn dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">{error}</div>
        )}
        {listaErrores.length > 0 && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 animate-fadeIn dark:border-red-500/30 dark:bg-red-500/10">
            <p className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" /> Revisa {Object.keys(msgs).length} campo{Object.keys(msgs).length === 1 ? '' : 's'} marcado{Object.keys(msgs).length === 1 ? '' : 's'} en rojo
            </p>
            <ul className="mt-2 space-y-1">
              {Object.entries(msgs).map(([campo, m]) => (
                <li key={campo}>
                  <button type="button" onClick={() => irACampo(campo)} className="text-left text-xs text-red-700 hover:underline dark:text-red-300">
                    <span className="font-bold">{etiquetaCampo(campo)}:</span> {m}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loadingInitial || cargandoEdicion ? (
          <CirugiaFormSkeleton />
        ) : (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="flex-1 min-w-0 space-y-6">
            {/* 1. Paciente */}
            <section {...ec('paciente')} className="rounded-2xl border border-line bg-surface p-5">
              <EncabezadoSeccion n="1" titulo="Paciente" Icon={User} completo={!!pacienteSeleccionado} />
              <MsgCampo m={msgs.paciente} />
              {modoEdicion && (
                <p className="text-xs text-muted">El paciente no se puede cambiar al editar (si es otro paciente, crea una nueva cirugía); sus datos generales sí se pueden corregir aquí.</p>
              )}
              {!modoEdicion && (<>
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
                        Sin coincidencias para esta búsqueda.
                      </p>
                    ) : (
                      pacientesResult.map((p) => {
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

              {!altaPaciente && (
                <button
                  type="button"
                  onClick={() => {
                    setMostrarPacientes(false);
                    setAltaPaciente({
                      numero_expediente: '',
                      nombre_completo: pacienteSeleccionado ? '' : queryPaciente.trim(),
                      sexo: 'H',
                      fecha_nacimiento: '',
                      telefono: '',
                      telefonos: [],
                      guardando: false,
                      error: null,
                    });
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Nuevo paciente
                </button>
              )}

              {altaPaciente && (
                <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
                  <div className="mb-3 text-sm font-bold text-fg">Nuevo paciente</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="alta-expediente" className={labelCls}>Número de expediente</label>
                      <input
                        id="alta-expediente"
                        value={altaPaciente.numero_expediente}
                        onChange={(e) => setAltaPaciente({ ...altaPaciente, numero_expediente: e.target.value })}
                        maxLength={50}
                        placeholder="Ej. 12345"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="alta-nombre" className={labelCls}>Nombre completo *</label>
                      <input
                        id="alta-nombre"
                        value={altaPaciente.nombre_completo}
                        onChange={(e) => setAltaPaciente({ ...altaPaciente, nombre_completo: e.target.value })}
                        maxLength={255}
                        placeholder="Nombre del paciente"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="alta-sexo" className={labelCls}>Sexo *</label>
                      <select
                        id="alta-sexo"
                        value={altaPaciente.sexo}
                        onChange={(e) => setAltaPaciente({ ...altaPaciente, sexo: e.target.value === 'M' ? 'M' : 'H' })}
                        className={inputCls}
                      >
                        <option value="H">Hombre</option>
                        <option value="M">Mujer</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="alta-nacimiento" className={labelCls}>Fecha de nacimiento (opcional)</label>
                      <input
                        id="alta-nacimiento"
                        type="date"
                        value={altaPaciente.fecha_nacimiento}
                        onChange={(e) => setAltaPaciente({ ...altaPaciente, fecha_nacimiento: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <span className={labelCls}>Teléfonos (hasta 3)</span>
                      <EditorTelefonos
                        value={altaPaciente.telefonos}
                        onChange={(lista) => setAltaPaciente({ ...altaPaciente, telefonos: lista })}
                        inputClassName={inputCls}
                      />
                    </div>
                  </div>
                  {altaPaciente.error && (
                    <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{altaPaciente.error}</p>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAltaPaciente(null)}
                      className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={registrarPaciente}
                      disabled={altaPaciente.guardando || !altaPaciente.nombre_completo.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {altaPaciente.guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Guardar y seleccionar
                    </button>
                  </div>
                </div>
              )}

              </>)}

              {pacienteSeleccionado && (
                fichaPaciente && fichaPaciente.id === pacienteSeleccionado.id ? (() => {
                  const ficha = normalizarPacienteDetalle(fichaPaciente);
                  const faltan = faltantesDatosGenerales(ficha);
                  const puedeEditar = puedeEditarPaciente(user?.rol);
                  if (editandoPaciente) {
                    return (
                      <EditorDatosPaciente
                        key={ficha.id}
                        paciente={ficha}
                        inputCls={inputCls}
                        labelCls={labelCls}
                        onCancelar={() => setEditandoPaciente(false)}
                        onGuardado={(c) => {
                          setEditandoPaciente(false);
                          void mutateFicha();
                          setPacienteSeleccionado((p) => (p ? { ...p, nombre_completo: c.nombre_completo } : p));
                          setQueryPaciente(c.nombre_completo);
                          void invalidar('/api/pacientes', '/api/search', '/api/agenda', '/api/cirugias');
                          toast('Datos del paciente actualizados', 'success');
                        }}
                      />
                    );
                  }
                  return (
                    <>
                      {/* Datos generales completos (antes solo se veía nombre y expediente). */}
                      <DatosPacienteFicha key={pacienteSeleccionado.id} paciente={ficha} />
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {faltan.length > 0 && (
                          <span className="text-xs text-amber-700 dark:text-amber-300">Faltan datos generales: {faltan.join(', ')}.</span>
                        )}
                        {puedeEditar && (
                          <button type="button" onClick={() => setEditandoPaciente(true)} className="text-xs font-bold text-primary-600 hover:underline">
                            {faltan.length > 0 ? 'Completar datos del paciente' : 'Editar datos generales'}
                          </button>
                        )}
                      </div>
                    </>
                  );
                })() : (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                    Cargando datos del paciente…
                  </div>
                )
              )}
            </section>

            {/* 2. Expediente */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <EncabezadoSeccion n="2" titulo="Expediente" Icon={ClipboardList} completo={!!(origenId || pacienteSeleccionado?.aseguranza_id || resumenPaciente?.paciente?.aseguranza_id || resumenPaciente?.aseguranza?.id)} />
              {pacienteSeleccionado ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Origen / Aseguradora</label>
                    <select
                      value={origenId}
                      onChange={(e) => { setOrigenId(e.target.value); setServicioId(''); }}
                      className={cn(inputCls, 'appearance-none')}
                      aria-label="Origen / Aseguradora"
                    >
                      <option value="">{resumenPaciente?.aseguranza?.nombre ? `Del paciente: ${resumenPaciente.aseguranza.nombre}` : 'Del paciente'}</option>
                      {aseguranzas.map((a) => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Procedencia</label>
                    <CampoTextoDiferido
                      type="text"
                      value={procedencia}
                      onValueChange={setProcedencia}
                      maxLength={255}
                      placeholder="Ej. Ensenada"
                      className={inputCls}
                      list="procedencias-lista"
                    />
                    <datalist id="procedencias-lista">
                      {procedenciasSugeridas.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">Seleccione un paciente para ver su expediente.</div>
              )}
            </section>

            {/* 3. Datos de cirugía */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <EncabezadoSeccion n="3" titulo="Datos de la cirugía" Icon={Stethoscope} completo={!!((qxIds.length > 0 || servicioId) && ojo && fecha && hora && !horaFinInvalida && anestesia && participantes.some((m) => m.rol === 'cirujano' && m.personaId))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label htmlFor="cirugia-diagnostico" className={labelCls}>Diagnóstico</label>
                  <BuscadorDiagnosticoCIE10
                    id="cirugia-diagnostico"
                    value={diagnostico}
                    onChange={(v) => { setDiagnostico(v); setDiagnosticoEditado(true); }}
                    placeholder="Diagnóstico que motiva la cirugía: código (H25.1) o término (catarata)…"
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
                <div className="sm:col-span-2" {...ec('qx')}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className={labelCls}>Cirugía *</label>
                    {qxIds.length > 0 && (
                      <span className="text-[11px] font-bold text-muted">{qxIds.length} agregado{qxIds.length === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <MsgCampo m={msgs.qx} />
                  <div className={cn(inputCls, 'h-auto p-2 space-y-2')}>
                    {qxIds.length > 0 && (
                      <ul className="space-y-1.5">
                        {qxIds.map((id) => {
                          const c = (catalogoQxSWR.data || []).find((x) => x.id === id);
                          // El ojo no se muestra aquí: se elige en «Ojo».
                          return (
                            <li key={id} className="flex items-center justify-between gap-2 rounded-md bg-primary-50 px-3 py-2 text-sm dark:bg-primary-500/15">
                              <span className="min-w-0 truncate font-semibold text-primary-700 dark:text-primary-300">
                                {c ? c.nombre : 'Cirugía'}
                              </span>
                              <button
                                type="button"
                                onClick={() => quitarQx(id)}
                                aria-label={`Quitar ${c?.nombre ?? 'cirugía'}`}
                                className="shrink-0 rounded-md p-1 text-primary-700 hover:bg-red-50 hover:text-red-600 dark:text-primary-300 dark:hover:bg-red-900/20"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <BuscadorServicio
                      items={cirugiasElegibles
                        .filter((c) => !qxIds.includes(c.id))
                        .map((c) => ({ id: c.id, nombre: c.nombre }))}
                      genericosIds={SIN_GENERICOS}
                      onElegir={(id) => agregarQx(id)}
                      placeholder={qxIds.length ? '+ Agregar otra cirugía (combinada)…' : 'Buscar cirugía: facoemulsificación, pterigión…'}
                      inputClassName="border-transparent bg-transparent px-2 py-1.5 shadow-none focus:ring-0 focus:border-transparent dark:bg-transparent"
                    />
                  </div>
                  <div className="text-xs text-muted mt-1">Puedes agregar varias (cirugía combinada). El ojo se elige abajo; el precio viene del catálogo quirúrgico.</div>
                  {puedeAgregarCatalogos && !altaCirugia && (
                    <button type="button" onClick={() => setAltaCirugia({ nombre: '', guardando: false, error: null })} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
                      <Plus className="h-3.5 w-3.5" /> ¿No está en la lista? Agregar cirugía
                    </button>
                  )}
                  {altaCirugia && (
                    <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
                      <label htmlFor="alta-cirugia-nombre" className={labelCls}>Nombre de la cirugía (sin el ojo)</label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          id="alta-cirugia-nombre"
                          value={altaCirugia.nombre}
                          onChange={(e) => setAltaCirugia({ ...altaCirugia, nombre: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void registrarCirugiaCatalogo(); } }}
                          maxLength={255}
                          placeholder="Ej. Vitrectomía posterior + endoláser"
                          className={inputCls}
                          autoFocus
                        />
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => setAltaCirugia(null)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface">Cancelar</button>
                          <button type="button" onClick={() => void registrarCirugiaCatalogo()} disabled={altaCirugia.guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                            {altaCirugia.guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Agregar
                          </button>
                        </div>
                      </div>
                      {altaCirugia.error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{altaCirugia.error}</p>}
                      <p className="mt-1 text-[11px] text-muted">Queda en Configuración → Conceptos → Quirúrgico; ahí se le pone precio.</p>
                    </div>
                  )}
                </div>
                {/* Lentes: solo cuando algún procedimiento es Faco / LIO */}
                {esCirugiaConLio && (
                  <div {...ec('lentes')} className="sm:col-span-2 rounded-xl border border-primary-200/70 bg-primary-50/40 p-4 space-y-4 dark:border-primary-500/20 dark:bg-primary-500/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-bold text-fg">
                        <Eye className="h-4 w-4 text-primary-500" /> Lente intraocular (LIO)
                      </p>
                      <a href={URL_IOLCON} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-primary-600 hover:underline">
                        Ficha técnica en IOLCon ↗
                      </a>
                    </div>
                    <MsgCampo m={msgs.lentes} />
                    {cirugiaCompletada ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted">La cirugía ya está completada: los lentes se resolvieron al cerrarla y no se modifican aquí.</p>
                        {(edicion?.lentes ?? []).filter((l) => l.estado === 'USADO').length === 0 ? (
                          <p className="text-sm text-fg-2">Sin lente usado registrado.</p>
                        ) : (
                          (edicion?.lentes ?? []).filter((l) => l.estado === 'USADO').map((l) => (
                            <p key={l.orden} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
                              <span className="font-bold">Lente usado:</span>{' '}
                              {[l.fabricante, l.modelo, l.poder_d != null ? `${l.poder_d} D` : null, l.torico ? `tórico${l.cilindro != null ? ` cil. ${l.cilindro}` : ''}` : null].filter(Boolean).join(' · ') || 'sin datos'}
                            </p>
                          ))
                        )}
                      </div>
                    ) : lentes.map((l) => (
                      <LenteLogistica
                        key={l.orden}
                        lente={l}
                        onChange={(patch) => cambiarLente(l.orden, patch)}
                        modelos={modelosLio}
                        cargandoModelos={modelosLioSWR.isLoading}
                        lios={Array.isArray(liosSWR.data) ? liosSWR.data : []}
                        comprometidos={Array.isArray(comprometidosSWR.data) ? comprometidosSWR.data : []}
                        cirugiaIdActual={cirugiaEditId ?? null}
                        itemsEnOtrosLentes={lentes.filter((x) => x.orden !== l.orden && x.itemId).map((x) => x.itemId as string)}
                        onQuitar={l.orden === 'PRIMERO' ? undefined : () => setLentes((prev) => prev.filter((x) => x.orden !== l.orden))}
                        inputCls={inputCls}
                        labelCls={labelCls}
                        onAgregarModelo={puedeAgregarCatalogos ? agregarModeloLio : undefined}
                        disenoSugerido={disenoLioSugerido}
                      />
                    ))}
                    {!cirugiaCompletada && <div className="flex flex-wrap gap-4">
                      {(['SEGUNDO', 'RESPALDO'] as const)
                        .filter((o) => !lentes.some((l) => l.orden === o))
                        .map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => setLentes((prev) => [...prev, lenteVacio(o)].sort((a, b) => ['PRIMERO', 'SEGUNDO', 'RESPALDO'].indexOf(a.orden) - ['PRIMERO', 'SEGUNDO', 'RESPALDO'].indexOf(b.orden)))}
                            className="text-xs font-bold text-primary-600 hover:underline"
                          >
                            + Agregar {o === 'SEGUNDO' ? 'segundo lente' : 'lente de respaldo'}
                          </button>
                        ))}
                    </div>}
                  </div>
                )}
                <div {...ec('ojo')}>
                  <label className={labelCls}>Ojo</label>
                  <select value={ojo} onChange={(e) => setOjo(e.target.value)} className={cn(inputCls, 'appearance-none')}>
                    <option value="">Seleccionar</option>
                    {OJOS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <MsgCampo m={msgs.ojo} />
                  {avisoOjo && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                      {avisoOjo}
                    </p>
                  )}
                </div>
                <div {...ec('anestesia')}>
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
                  <MsgCampo m={msgs.anestesia} />
                </div>

    <div className="sm:col-span-2 rounded-xl border border-line/70 bg-surface-2/40 p-4" {...ec('participantes')}>
                  <h3 className="text-sm font-bold text-fg flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-primary-500" /> Asignación médica y participantes quirúrgico
                  </h3>
                  <p className="mb-4 text-xs text-muted">
                    Solo el cirujano es obligatorio. El horario es el de la cirugía; se valida que nadie quede en dos cirugías a la vez.
                  </p>
                  <MsgCampo m={msgs.participantes} />
                  {!loadingInitial && roles.length === 0 && (
                    <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>No hay roles de participante disponibles. Aplica la migración <code className="font-mono text-xs">1800000000170-CreateCirugiaHomologadaTables.ts</code> en tu BD local para poblar <code className="font-mono text-xs">cat_roles_participante</code>.</span>
                    </div>
                  )}
                  <div className="hidden sm:grid grid-cols-12 gap-3 mb-1">
                    <span className={cn(labelCls, 'col-span-4')}>Rol</span>
                    <span className={cn(labelCls, 'col-span-7')}>Persona</span>
                  </div>
                  <div className="space-y-3">
                    {participantes.map((m) => {
                      const apoyo = esRolApoyo(m.rol);
                      const esRolAnestesia = m.rol === ROL_ANESTESIOLOGO;
                      const lista = esRolAnestesia ? anestesiologos : apoyo ? [...enfermeria, ...medicosLista] : medicosLista;
                      return (
                        <div key={m.id} className="grid grid-cols-12 gap-3 items-start rounded-lg sm:rounded-none border border-line/70 sm:border-0 p-3 sm:p-0">
                          <div className="col-span-12 sm:col-span-4" {...ec(`pr:${m.id}`)}>
                            <select
                              value={m.rol}
                              onChange={(e) => {
                                const rol = e.target.value;
                                const persona = doctores.find((d) => d.id === m.personaId);
                                // Si la persona elegida no puede ocupar el nuevo rol, se libera el campo.
                                actualizarParticipante(m.id, persona && !puedeOcuparRol(persona, rol, ROLES_APOYO) ? { rol, personaId: '' } : { rol });
                              }}
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
                            <MsgCampo m={msgs[`pr:${m.id}`]} />
                          </div>
                          <div className="col-span-12 sm:col-span-7" {...ec(`pp:${m.id}`)}>
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
                                  if (e.target.value === '__nuevo__') setAltaPersonal({ filaId: m.id, nombre: '', guardando: false, tipo: esRolAnestesia ? 'ANESTESIOLOGO' : apoyo ? 'ENFERMERO' : 'MEDICO' });
                                  else actualizarParticipante(m.id, { personaId: e.target.value });
                                }}
                                disabled={!m.rol}
                                className={cn(inputCls, 'appearance-none disabled:opacity-60')}
                                aria-label="Persona"
                              >
                                <option value="">
                                  {!m.rol
                                    ? 'Elige primero el rol'
                                    : esRolAnestesia
                                      ? anestesiologos.length ? 'Seleccionar anestesiólogo' : 'No hay anestesiólogos registrados'
                                      : apoyo ? 'Seleccionar persona' : 'Seleccionar médico'}
                                </option>
                                {lista.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.nombre}{apoyo && d.tipo_personal !== 'ENFERMERO' ? ' · médico' : ''}
                                  </option>
                                ))}
                                <option value="__nuevo__">+ Registrar persona nueva…</option>
                              </select>
                            )}
                            <MsgCampo m={msgs[`pp:${m.id}`]} />
                          </div>
                          <div className="col-span-12 sm:col-span-1">
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
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div {...ec('fecha')}>
                    <label className={labelCls}>Fecha</label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
                    <MsgCampo m={msgs.fecha} />
                  </div>
                  <div {...ec('hora')}>
                    <label className={labelCls}>Hora inicio</label>
                    <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
                    <MsgCampo m={msgs.hora} />
                  </div>
                  <div {...ec('horaFin')}>
                    <label className={labelCls}>Hora fin <span className="font-normal">(opcional)</span></label>
                    <input
                      type="time"
                      value={horaFin}
                      min={hora || undefined}
                      onChange={(e) => setHoraFin(e.target.value)}
                      aria-invalid={horaFinInvalida}
                      className={cn(inputCls, horaFinInvalida && 'border-red-400 focus:ring-red-500/20 focus:border-red-500')}
                    />
                    {horaFinInvalida && (
                      <p className="mt-1 text-xs text-red-600">Debe ser posterior a la hora de inicio</p>
                    )}
                    {!horaFinInvalida && <MsgCampo m={msgs.horaFin} />}
                    {!horaFin && !horaFinInvalida && !msgs.horaFin && (
                      <p className="mt-1 text-[11px] text-muted">Si aún no se sabe, déjala vacía: se aparta 1 h en la agenda y la hora real se registra al completar la cirugía.</p>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Quirófano</label>
                  <input type="text" value={quirofano} onChange={(e) => setQuirofano(e.target.value)} maxLength={100} placeholder="Ej. Quirófano 2" className={inputCls} />
                </div>
              </div>
            </section>

            {/* 5. Archivos de apoyo */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <EncabezadoSeccion n="5" titulo="Archivos de apoyo" Icon={FileText} completo={docsSinMotivo.length === 0} />
              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              <div className="rounded-lg border border-line/70 bg-surface-2/40 p-4" {...ec('documentos')}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Documentos requeridos</p>
                <MsgCampo m={msgs.documentos} />
                <ul className="space-y-3">
                  {documentosChecklist.map((d) => (
                    <li key={d.tipo} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 sm:w-56 shrink-0">
                        {d.adjunto
                          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                        <span className="text-sm font-medium text-fg">{d.etiqueta}</span>
                      </div>
                      {d.adjunto ? (
                        <span className="min-w-0 truncate text-xs text-muted">Adjuntado: {d.adjunto}</span>
                      ) : (
                        <input
                          type="text"
                          value={motivosDoc[d.tipo] ?? ''}
                          onChange={(e) => setMotivosDoc((prev) => ({ ...prev, [d.tipo]: e.target.value }))}
                          maxLength={300}
                          placeholder="Motivo por el que no se adjunta…"
                          aria-label={`Motivo por el que falta ${d.etiqueta}`}
                          className={cn(inputCls, 'flex-1')}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Adjunta cada documento abajo o indica el motivo por el que no se adjunta.</p>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-line bg-surface-2 p-6 text-center transition-colors hover:border-primary-300"
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
              </div>

              {archivosExistentes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Ya cargados</p>
                  {archivosExistentes.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-line/70 bg-surface-2 p-3">
                      <FileText className="h-4 w-4 shrink-0 text-primary-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fg">{a.nombre_original}</div>
                        <div className="text-xs text-muted">{a.tipo_documento || 'Sin tipo'}{a.size ? ` · ${formatBytes(a.size)}` : ''}</div>
                      </div>
                      <button type="button" onClick={() => void quitarArchivoExistente(a.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`Quitar ${a.nombre_original}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {archivos.length > 0 && (
                <div className="mt-4 space-y-2" {...ec('archivos')}>
                  <MsgCampo m={msgs.archivos} />
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
                          {documentosChecklist.map((d) => (
                            <option key={d.tipo} value={d.tipo}>{d.tipo}</option>
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
              <CampoTextoDiferido
                multilinea
                value={notas}
                onValueChange={setNotas}
                rows={3}
                placeholder="Notas, diagnóstico, indicaciones..."
                className={cn(inputCls, 'resize-none')}
              />
            </section>

            {/* Reserva el espacio de la barra (la barra real es fixed y copia el ancho de este hueco) */}
            <div ref={barraHuecoRef} aria-hidden="true" className="h-[120px] sm:h-[64px]" />
            <div
              style={barraRect ? { left: barraRect.left, width: barraRect.width } : undefined}
              className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center lg:bottom-4"
            >
              <p
                className={cn(
                  'min-w-0 flex-1 text-xs',
                  validarFormulario() ? 'text-amber-700 dark:text-amber-300' : 'font-bold text-emerald-700 dark:text-emerald-300',
                )}
                aria-live="polite"
              >
                {cirugiaCreada ? '✓ Cirugía creada. Abriendo la agenda…' : validarFormulario() ? `Falta: ${validarFormulario()}` : modoEdicion ? '✓ Todo listo para guardar los cambios' : '✓ Todo listo para crear la cirugía'}
              </p>
              <div className="flex gap-3 sm:shrink-0">
                <button
                  onClick={() => router.push(volver.href)}
                  disabled={guardando || cirugiaCreada}
                  className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 sm:flex-none"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={guardando || cirugiaCreada}
                  aria-busy={guardando}
                  className="flex-[2] rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50 sm:flex-none"
                >
                  {guardando || cirugiaCreada ? (pasoGuardado ?? 'Guardando…') : modoEdicion ? 'Validar y guardar cambios' : 'Validar y crear cirugía'}
                </button>
              </div>
            </div>
              </div>
              <aside className="w-full lg:w-[300px] lg:shrink-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
                <PanelExpediente pacienteId={pacienteSeleccionado?.id ?? null} />
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Motivo del error de un campo (rojo, con ícono) bajo el campo marcado. */
function MsgCampo({ m }: { m?: string }) {
  if (!m) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> <span>{m}</span>
    </p>
  );
}

/** Encabezado de sección: número, título y marca de "completa" para ver el avance de un vistazo. */
function EncabezadoSeccion({ n, titulo, Icon, completo }: { n: string; titulo: string; Icon: React.ComponentType<{ className?: string }>; completo: boolean }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold text-fg">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold transition-colors',
          completo ? 'bg-emerald-500 text-white' : 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
        )}
        aria-hidden="true"
      >
        {completo ? '✓' : n}
      </span>
      <Icon className="h-4 w-4 text-primary-500" aria-hidden="true" />
      <span>{titulo}</span>
      <span className="sr-only">{completo ? '(completa)' : '(pendiente)'}</span>
    </h2>
  );
}

export default function FormularioCirugia({ cirugiaId }: { cirugiaId?: string }) {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-12 bg-surface-2 rounded-lg" /><div className="h-32 bg-surface-2 rounded-lg" /></div>}>
      <FormularioCirugiaContent cirugiaId={cirugiaId} />
    </Suspense>
  );
}
