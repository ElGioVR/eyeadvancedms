'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import useSWR from 'swr';
import { Aseguranza, OPCIONES_CATALOGO, Doctor, Rol, Recurso, comoLista, Paciente, PacienteResumen, FiltroOjo, HistorialOjo, Servicio, ArchivoLocal, EXTENSIONES_PERMITIDAS, Participante, BorradorCirugia, CLAVE_BORRADOR_CIRUGIA, CirugiaFormSkeleton, FILTROS_OJO, etiquetaOjo, OJOS, formatBytes } from '@/components/cirugia/nueva-cirugia-comun';
import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback, Suspense } from 'react';
import { type TelefonoPaciente, normalizarTelefonos, telefonoPrincipal } from '@/lib/telefonos-paciente';
import { type MiembroEquipo, equipoPorDefecto, sincronizarHorario, ROLES_APOYO, ETIQUETAS_ROL, esRolApoyo, validarEquipo } from '@/lib/catalogos/equipo-quirurgico';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { type ModeloLio, coincideConModelo, URL_ESCRS_IOL, URL_IOLCON } from '@/lib/catalogos/modelos-lio';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { type LIODisponible, URL_LIOS_DISPONIBLES, obtenerLIOs } from '@/components/cirugia/LIOSelector';
import { useInvalidar } from '@/hooks/useFetch';
import { esProcedimientoConLio, TIPO_DOCUMENTO_OTRO, tipoLioDe, ANESTESIAS, TIPO_MEDICINA_INTERNA, TIPOS_DOCUMENTO_APOYO } from '@/lib/catalogos/cirugia';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { esEnfermeria, esMedicoTratante, esAnestesiologo, ROL_ANESTESIOLOGO, puedeOcuparRol } from '@/lib/catalogos/personal';
import { ApiError, enviarJSON, mensajeDeError, nuevaClaveIdempotencia } from '@/lib/fetcher';
import { useBorrador } from '@/hooks/useBorrador';
import PageHeader from '@/components/ui/PageHeader';
import AvisoBorrador from '@/components/ui/AvisoBorrador';
import { User, Loader2, Plus, ClipboardList, Stethoscope, X, Eye, Users, AlertTriangle, FileText, Upload, Trash2 } from 'lucide-react';
import SearchInput from '@/components/ui/SearchInput';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import { cn } from '@/lib/utils';
import CampoTextoDiferido from '@/components/ui/CampoTextoDiferido';
import SelectorModeloLio from '@/components/cirugia/SelectorModeloLio';
import BuscadorDiagnosticoCIE10 from '@/components/diagnosticos/BuscadorDiagnosticoCIE10';

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
  // Alta rápida de paciente desde la cirugía (con número de expediente).
  const [altaPaciente, setAltaPaciente] = useState<null | {
    numero_expediente: string; nombre_completo: string; sexo: 'H' | 'M'; fecha_nacimiento: string; telefono: string;
    telefonos: TelefonoPaciente[];
    guardando: boolean; error: string | null;
  }>(null);
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
  const [altaPersonal, setAltaPersonal] = useState<{ filaId: string; nombre: string; guardando: boolean; tipo?: 'MEDICO' | 'ENFERMERO' | 'ANESTESIOLOGO' } | null>(null);
  const [inventarioItemId, setInventarioItemId] = useState<string | null>(null);
  const [lioManual, setLioManual] = useState(false);
  const [lioManualMarca, setLioManualMarca] = useState('');
  const [lioManualModelo, setLioManualModelo] = useState('');
  const [lioManualPotencia, setLioManualPotencia] = useState('');
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [notas, setNotas] = useState('');
  // Punto I: diagnóstico propio (antes se copiaba a Notas) y anestesia obligatoria.
  const [diagnostico, setDiagnostico] = useState('');
  const [diagnosticoEditado, setDiagnosticoEditado] = useState(false);
  const [anestesia, setAnestesia] = useState('');
  // Punto I.1: datos generales de la cirugía
  const [procedencia, setProcedencia] = useState('');
  const [tiempoCx, setTiempoCx] = useState('');
  const [tiempoEstancia, setTiempoEstancia] = useState('');
  const [motivoConsulta, setMotivoConsulta] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [especialidadEditada, setEspecialidadEditada] = useState(false);
  const { especialidades } = useEspecialidades();
  // Punto I.2: procedimientos adicionales, tipo de LIO y personal de apoyo no médico
  const [procedimientosAdicionales, setProcedimientosAdicionales] = useState<string[]>([]);
  // C13: ojo de cada procedimiento adicional (por defecto, el ojo de la cirugía).
  const [ojosAdicionales, setOjosAdicionales] = useState<Record<string, 'OD' | 'OI' | 'OU'>>({});
  // Comentarios clínica (oct 2026): lentes adicionales (segundo y respaldo) de la cirugía.
  const [lentesExtra, setLentesExtra] = useState<Array<{ orden: 'SEGUNDO' | 'RESPALDO'; origen: 'INVENTARIO' | 'HOSPITAL'; itemId: string; fabricante: string; poder: string }>>([]);
  // LIO (solo Faco + LIO): bandera tórico → fabricante → modelo → pieza del inventario (o manual).
  const [lioTorico, setLioTorico] = useState(false);
  const [fabricanteLio, setFabricanteLio] = useState('');
  const [modeloLioId, setModeloLioId] = useState('');
  const modelosLioSWR = useSWR<ModeloLio[]>('/api/catalogos/modelos-lio', OPCIONES_CATALOGO);
  const [verTodoInventario, setVerTodoInventario] = useState(false);
  const liosSWR = useSWR<LIODisponible[]>(URL_LIOS_DISPONIBLES, obtenerLIOs, { revalidateOnFocus: false });
  const modelosLio = useMemo(() => (Array.isArray(modelosLioSWR.data) ? modelosLioSWR.data : []), [modelosLioSWR.data]);
  const modeloLioSel = modelosLio.find((m) => m.id === modeloLioId) || null;
  const procedenciasSWR = useSWR<string[]>('/api/catalogos/procedencias', OPCIONES_CATALOGO);
  const procedenciasSugeridas = useMemo(() => (Array.isArray(procedenciasSWR.data) ? procedenciasSWR.data : []), [procedenciasSWR.data]);
  const marcasLioSugeridas = useMemo(
    () => [...new Set(modelosLio.map((m) => m.fabricante.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [modelosLio]
  );
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
  // Comentarios clínica (oct 2026): misma persona, fecha y ojo → reagenda o reintervención.
  const decisionDuplicadoRef = useRef<{ tipo_caso?: 'REAGENDA' | 'REINTERVENCION'; reagenda_de_id?: string } | null>(null);
  const [duplicadoPendiente, setDuplicadoPendiente] = useState<{
    candidatas: Array<{ id: string; fecha: string; hora: string | null; ojo: string; estado: string }>;
  } | null>(null);
  /** Misma clave en reintentos del mismo envío → el servidor no duplica la cirugía. */
  const claveEnvioRef = useRef<string | null>(null);
  /** Tras crear la cirugía se deja de autoguardar (no revivir un borrador ya guardado). */
  const [cirugiaCreada, setCirugiaCreada] = useState(false);
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
    () => [servicioId, ...procedimientosAdicionales].some((id) => {
      const s = servicios.find((x) => x.id === id);
      return !!s && (s.requiere_lio === true || esProcedimientoConLio(s.nombre));
    }),
    [servicioId, procedimientosAdicionales, servicios],
  );

  // El LIO solo aplica a Faco + LIO: si se quita ese procedimiento, se limpia la selección.
  useEffect(() => {
    if (esCirugiaConLio) return;
    setModeloLioId('');
    setFabricanteLio('');
    setInventarioItemId(null);
    setVerTodoInventario(false);
    setLioManual(false);
  }, [esCirugiaConLio]);

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
        inventario_item_id: esCirugiaConLio && !lioManual ? inventarioItemId : null,
        lio: esCirugiaConLio && lioManual ? lioManualTexto : null,
        marca_lio: esCirugiaConLio && lioManual ? lioManualMarca.trim() || null : null,
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
        tiempo_estimado: tiempoCx.trim() || null,
        tiempo_estancia: tiempoEstancia.trim() || null,
        motivo_consulta: motivoConsulta.trim() || null,
        especialidad_id: especialidades.find((e) => e.clave === especialidad)?.id || null,
        // Tipo de LIO derivado del modelo (diseño × tórico); sin modelo, solo la bandera tórico.
        tipo_lio: esCirugiaConLio && modeloLioSel ? tipoLioDe(modeloLioSel.diseno, modeloLioSel.torico)?.value ?? null : null,
        lio_torico: esCirugiaConLio ? lioTorico : null,
        modelo_lio_id: esCirugiaConLio ? modeloLioId || null : null,
        procedimientos_adicionales: procedimientosAdicionales.filter((id) => id !== servicioId),
        ojos_procedimientos: Object.fromEntries(
          procedimientosAdicionales.filter((id) => id !== servicioId).map((id) => [id, ojosAdicionales[id] ?? ((ojo as 'OD' | 'OI' | 'OU') || 'OD')]),
        ),
        lentes_extra: esCirugiaConLio
          ? lentesExtra.map((l) => ({
              orden: l.orden,
              origen: l.origen,
              inventario_item_id: l.origen === 'INVENTARIO' ? l.itemId || null : null,
              fabricante: l.origen === 'HOSPITAL' ? l.fabricante.trim() || null : null,
              poder_d: l.poder.trim() ? Number(l.poder.replace(',', '.')) : null,
            }))
          : [],
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
      setCirugiaCreada(true);
      borrador.limpiar();
      toast('Cirugía creada', 'success');
      router.push(`/cirugias/${cirugiaId}`);
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
      const mensaje = mensajeDeError(err, 'No se pudo crear la cirugía. Intenta de nuevo.');
      setError(mensaje);
      toast(mensaje, 'error');
    } finally {
      setGuardando(false);
      setPasoGuardado(null);
    }
  };

  // ── Borrador autoguardado (no se pierde la captura por error, recarga o sesión vencida) ──
  const conPrecarga = !!(consultaPrecargaId || pacientePrecargaId || procedimientoPrecarga || cirujanoIdPrecarga || fechaPrecarga);
  const datosBorrador = useMemo<BorradorCirugia | null>(
    () =>
      pacienteSeleccionado || servicioId || notas.trim() || diagnosticoEditado
        ? {
            paciente: pacienteSeleccionado, origenId, servicioId, ojo, fecha, hora, duracionMin, recursoId,
            participantes, notas, diagnostico, diagnosticoEditado, anestesia, procedencia, especialidad,
            especialidadEditada, procedimientosAdicionales, lioTorico, fabricanteLio, modeloLioId, lioManual,
            lioManualMarca, lioManualModelo, lioManualPotencia,
          }
        : null,
    [pacienteSeleccionado, origenId, servicioId, ojo, fecha, hora, duracionMin, recursoId, participantes, notas,
      diagnostico, diagnosticoEditado, anestesia, procedencia, especialidad, especialidadEditada,
      procedimientosAdicionales, lioTorico, fabricanteLio, modeloLioId, lioManual, lioManualMarca, lioManualModelo,
      lioManualPotencia],
  );
  const borrador = useBorrador<BorradorCirugia>(CLAVE_BORRADOR_CIRUGIA, datosBorrador, {
    activo: !loadingInitial && !conPrecarga && !guardando && !cirugiaCreada,
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
    setDuracionMin(d.duracionMin);
    setRecursoId(d.recursoId);
    if (Array.isArray(d.participantes) && d.participantes.length) setParticipantes(d.participantes);
    setNotas(d.notas);
    setDiagnostico(d.diagnostico);
    setDiagnosticoEditado(d.diagnosticoEditado);
    setAnestesia(d.anestesia);
    setProcedencia(d.procedencia);
    setEspecialidad(d.especialidad);
    setEspecialidadEditada(d.especialidadEditada);
    setProcedimientosAdicionales(d.procedimientosAdicionales || []);
    setLioTorico(d.lioTorico);
    setFabricanteLio(d.fabricanteLio);
    setModeloLioId(d.modeloLioId);
    setLioManual(d.lioManual);
    setLioManualMarca(d.lioManualMarca);
    setLioManualModelo(d.lioManualModelo);
    setLioManualPotencia(d.lioManualPotencia);
    toast('Borrador recuperado. Revisa los datos y vuelve a adjuntar archivos si había.', 'success');
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
        title="Nueva cirugía"
        subtitle="Cree una cirugía homologada en 5 pasos"
        backLink={{
          // Si viene de una consulta regresa a ella; si no, a la Agenda (igual que Nueva consulta).
          href: consultaPrecargaId ? `/consultas/${consultaPrecargaId}` : '/agenda',
          label: consultaPrecargaId ? 'Consulta' : 'Agenda',
          onClick: (event) => {
            // Con historial, regresar a la pantalla exacta de origen (paciente, agenda, consulta…).
            if (window.history.length > 1) {
              event.preventDefault();
              router.back();
            }
          },
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-0 py-6 space-y-6">
        {borrador.pendiente && !conPrecarga && (
          <AvisoBorrador
            ts={borrador.pendiente.ts}
            que="una cirugía"
            onRecuperar={() => void recuperarBorrador()}
            onDescartar={borrador.descartar}
          />
        )}
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
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <div>
                    <label className={labelCls}>Tiempo de cirugía</label>
                    <input type="text" value={tiempoCx} onChange={(e) => setTiempoCx(e.target.value)} maxLength={50} placeholder="Ej. 30 min" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Tiempo de estancia</label>
                    <input type="text" value={tiempoEstancia} onChange={(e) => setTiempoEstancia(e.target.value)} maxLength={50} placeholder="Ej. 2 hrs" className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Motivo de consulta</label>
                    <input type="text" value={motivoConsulta} onChange={(e) => setMotivoConsulta(e.target.value)} maxLength={500} placeholder="Ej. Disminución de agudeza visual" className={inputCls} />
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
                </div>
              )}
            </section>

            {/* 3. Datos de cirugía */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <Stethoscope className="w-4 h-4 text-primary-500" /> 3. Datos de la cirugía
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="sm:col-span-2">
                  <label className={labelCls}>Procedimiento quirúrgico</label>
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
                              + {servicios.find((s) => s.id === id)?.nombre || 'Procedimiento quirúrgico'}
                              <select
                                value={ojosAdicionales[id] ?? (ojo as 'OD' | 'OI' | 'OU') ?? 'OD'}
                                onChange={(e) => setOjosAdicionales((prev) => ({ ...prev, [id]: e.target.value as 'OD' | 'OI' | 'OU' }))}
                                aria-label="Ojo del procedimiento adicional"
                                className="rounded bg-transparent text-xs font-bold text-primary-700 focus:outline-none dark:text-primary-300"
                              >
                                <option value="OD">OD</option>
                                <option value="OI">OI</option>
                                <option value="OU">OU</option>
                              </select>
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
                {/* LIO: solo cuando el procedimiento es Faco + LIO (estilo calculadora ESCRS) */}
                {esCirugiaConLio && (
                  <div className="sm:col-span-2 rounded-xl border border-primary-200/70 bg-primary-50/40 p-4 dark:border-primary-500/20 dark:bg-primary-500/5">
                    <p className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
                      <Eye className="h-4 w-4 text-primary-500" /> Lente intraocular (LIO)
                    </p>
                    <SelectorModeloLio
                      modelos={modelosLio}
                      cargando={modelosLioSWR.isLoading}
                      torico={lioTorico}
                      onTorico={(v) => { setLioTorico(v); reiniciarPieza(); }}
                      fabricante={fabricanteLio}
                      onFabricante={setFabricanteLio}
                      modeloId={modeloLioId}
                      onModelo={(id) => { setModeloLioId(id); reiniciarPieza(); }}
                    />
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      <span>Marcas y modelos en Configuración → Marcas.</span>
                      <a href={URL_ESCRS_IOL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                        Buscar en ESCRS ↗
                      </a>
                      <a href={URL_IOLCON} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                        Ficha técnica en IOLCon ↗
                      </a>
                    </p>
                  {/* Paso 3: pieza física */}
                  <div className="mt-4">
                    <p className={labelCls}>Lente (pieza física)</p>
                    {!lioManual ? (
                      !modeloLioSel ? (
                        <div className="mt-1 space-y-2">
                          <p className="text-xs text-muted">Elige el modelo para ver las piezas disponibles de ese lente.</p>
                          {!verTodoInventario ? (
                            <button type="button" onClick={() => setVerTodoInventario(true)} className="text-xs font-bold text-primary-600 hover:underline">
                              Elegir del inventario sin modelo
                            </button>
                          ) : (
                            <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} />
                          )}
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
                            list="marcas-lio-lista"
                          />
                          <datalist id="marcas-lio-lista">
                            {marcasLioSugeridas.map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
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
                  </div>
                )}
                {esCirugiaConLio && (
                  <div className="sm:col-span-2 space-y-3 rounded-xl border border-line p-4">
                    <p className="text-xs font-bold text-fg">Lentes adicionales (máximo 3 en total: primero, segundo y respaldo)</p>
                    {lentesExtra.map((l, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12 items-start">
                        <span className="sm:col-span-2 text-sm font-semibold text-fg-2 pt-2">{l.orden === 'SEGUNDO' ? 'Segundo' : 'Respaldo'}</span>
                        <select
                          value={l.origen}
                          onChange={(e) => setLentesExtra((prev) => prev.map((x, n) => (n === idx ? { ...x, origen: e.target.value as 'INVENTARIO' | 'HOSPITAL', itemId: '' } : x)))}
                          className={cn(inputCls, 'sm:col-span-3')}
                          aria-label="Origen del lente"
                        >
                          <option value="INVENTARIO">De inventario</option>
                          <option value="HOSPITAL">Lente del hospital</option>
                        </select>
                        {l.origen === 'INVENTARIO' ? (
                          <div className="sm:col-span-6">
                            <LIOSelector value={l.itemId || null} onChange={(v) => setLentesExtra((prev) => prev.map((x, n) => (n === idx ? { ...x, itemId: v ?? '' } : x)))} />
                          </div>
                        ) : (
                          <>
                            <input
                              value={l.fabricante}
                              onChange={(e) => setLentesExtra((prev) => prev.map((x, n) => (n === idx ? { ...x, fabricante: e.target.value } : x)))}
                              placeholder="Marca y modelo"
                              className={cn(inputCls, 'sm:col-span-4')}
                              aria-label="Marca y modelo del lente del hospital"
                            />
                            <input
                              value={l.poder}
                              onChange={(e) => setLentesExtra((prev) => prev.map((x, n) => (n === idx ? { ...x, poder: e.target.value } : x)))}
                              placeholder="Poder (D)"
                              inputMode="decimal"
                              className={cn(inputCls, 'sm:col-span-2')}
                              aria-label="Poder del lente en dioptrías"
                            />
                          </>
                        )}
                        <button type="button" onClick={() => setLentesExtra((prev) => prev.filter((_, n) => n !== idx))}
                          className="sm:col-span-1 text-xs font-bold text-red-600 hover:underline pt-2">Quitar</button>
                      </div>
                    ))}
                    {lentesExtra.length < 2 && (
                      <button type="button"
                        onClick={() => setLentesExtra((prev) => [...prev, { orden: prev.some((x) => x.orden === 'SEGUNDO') ? 'RESPALDO' : 'SEGUNDO', origen: 'INVENTARIO', itemId: '', fabricante: '', poder: '' }])}
                        className="text-xs font-bold text-primary-600 hover:underline">
                        + Agregar {lentesExtra.some((x) => x.orden === 'SEGUNDO') ? 'respaldo' : 'segundo lente'}
                      </button>
                    )}
                  </div>
                )}
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
                  const esRolAnestesia = m.rol === ROL_ANESTESIOLOGO;
                  const lista = esRolAnestesia ? anestesiologos : apoyo ? [...enfermeria, ...medicosLista] : medicosLista;
                  return (
                    <div key={m.id} className="grid grid-cols-12 gap-3 items-start rounded-lg sm:rounded-none border border-line/70 sm:border-0 p-3 sm:p-0">
                      <div className="col-span-12 sm:col-span-3">
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

            {/* 5. Archivos de apoyo */}
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary-500" /> 5. Archivos de apoyo
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
              <CampoTextoDiferido
                multilinea
                value={notas}
                onValueChange={setNotas}
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
