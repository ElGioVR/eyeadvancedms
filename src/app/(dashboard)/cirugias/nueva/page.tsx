'use client';

import { Suspense } from 'react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, X, Trash2, FileText, User, Stethoscope, ClipboardList, Users, Eye, Package, Upload, Calendar, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { useToast } from '@/components/ui/Toast';

interface Paciente {
  id: string;
  nombre_completo: string;
  telefono?: string | null;
  email?: string | null;
  aseguranza_id?: string | null;
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

  // Carga de catálogos
  const [aseguranzas, setAseguranzas] = useState<Aseguranza[]>([]);
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  // Paciente
  const [queryPaciente, setQueryPaciente] = useState('');
  const [pacientesResult, setPacientesResult] = useState<Paciente[]>([]);
  const [mostrarPacientes, setMostrarPacientes] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [resumenPaciente, setResumenPaciente] = useState<PacienteResumen | null>(null);

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
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [notas, setNotas] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Para auto-fill de procedimiento desde consulta
  const [procedimientoPendiente, setProcedimientoPendiente] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/configuracion/aseguranzas'),
      fetch('/api/configuracion/doctores'),
      fetch('/api/cirugias/roles'),
      fetch('/api/cirugias/recursos'),
    ])
      .then(async ([ra, rd, rro, rre]) => {
        const errors: string[] = [];
        const a = ra.ok ? await ra.json() : (errors.push('aseguranzas'), []);
        const d = rd.ok ? await rd.json() : (errors.push('doctores'), []);
        const ro = rro.ok ? await rro.json() : (errors.push('roles'), []);
        const re = rre.ok ? await rre.json() : (errors.push('recursos'), []);
        if (errors.length > 0) {
          toast(`Error al cargar catálogos: ${errors.join(', ')}`, 'error');
        }
        setAseguranzas(Array.isArray(a) ? a : []);
        setDoctores(Array.isArray(d) ? d : []);
        setRoles(Array.isArray(ro) ? ro : []);
        setRecursos(Array.isArray(re) ? re : []);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Error al cargar catálogos', 'error');
      })
      .finally(() => setLoadingCatalogos(false));
  }, [toast]);

  const seleccionarPaciente = useCallback((paciente: Paciente) => {
    setPacienteSeleccionado(paciente);
    setQueryPaciente(paciente.nombre_completo);
    setMostrarPacientes(false);
    if (paciente.aseguranza_id) setOrigenId(paciente.aseguranza_id);
    // Cargar resumen del paciente (expediente, última consulta, previas)
    fetch(`/api/pacientes/${paciente.id}/resumen`)
      .then((r) => (r.ok ? r.json() : null))
      .then((resumen) => {
        setResumenPaciente(resumen);
        const aseguranzaId = resumen?.paciente?.aseguranza_id || resumen?.aseguranza?.id || paciente.aseguranza_id;
        if (aseguranzaId) setOrigenId(aseguranzaId);
      })
      .catch(() => {});
  }, []);

  // Precarga desde consulta (B10)
  useEffect(() => {
    if (!consultaPrecargaId) return;
    fetch(`/api/consultas/${consultaPrecargaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((consulta) => {
        if (!consulta) return;
        if (consulta.paciente_id) {
          seleccionarPaciente({
            id: consulta.paciente_id,
            nombre_completo: consulta.paciente?.nombre_completo || 'Paciente',
          } as Paciente);
        }
        if (consulta.consulta?.aseguranza_id) {
          setOrigenId(consulta.consulta.aseguranza_id);
        }
        if (consulta.consulta?.diagnostico) setNotas(`Diagnóstico de consulta: ${consulta.consulta.diagnostico}`);
        // Pre-cargar procedimiento para match con catálogo
        if (consulta.consulta?.procedimiento) {
          setProcedimientoPendiente(consulta.consulta.procedimiento);
        }
        // Pre-cargar doctor como cirujano
        if (consulta.doctor_id && roles.length > 0) {
          const rolCirujano = roles.find((r) => r.clave === 'cirujano');
          if (rolCirujano) {
            setParticipantes([{ id: crypto.randomUUID(), medico_id: consulta.doctor_id, rol_id: rolCirujano.id }]);
          }
        }
      })
      .catch(() => {});
  }, [consultaPrecargaId, seleccionarPaciente, roles]);

  // Precarga fecha/hora desde Agenda (B11)
  useEffect(() => {
    if (fechaPrecarga && !fecha) setFecha(fechaPrecarga);
    if (horaPrecarga && !hora) setHora(horaPrecarga);
  }, [fechaPrecarga, horaPrecarga, fecha, hora]);

  // Precarga desde listado de pacientes (?paciente_id=)
  useEffect(() => {
    if (!pacientePrecargaId) return;
    fetch(`/api/pacientes/${pacientePrecargaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p?.id) return;
        seleccionarPaciente({
          id: p.id,
          nombre_completo: p.nombre_completo,
          telefono: p.telefono,
          email: p.email,
          aseguranza_id: p.aseguranza_id,
        });
      })
      .catch(() => {});
  }, [pacientePrecargaId, seleccionarPaciente]);

  // Búsqueda de paciente
  useEffect(() => {
    if (queryPaciente.trim().length < 2) {
      setPacientesResult([]);
      setMostrarPacientes(false);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(queryPaciente)}`)
        .then((r) => r.json())
        .then((data) => {
          const pacientes = (data?.results || [])
            .filter((item: any) => item.tipo === 'paciente')
            .map((item: any) => ({
              id: item.id,
              nombre_completo: item.titulo,
              telefono: item.subtitulo?.split(' · ')[0] || null,
              email: item.subtitulo?.split(' · ')[1] || null,
            }));
          setPacientesResult(pacientes);
          setMostrarPacientes(true);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [queryPaciente]);

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
      const body = {
        paciente_id: pacienteSeleccionado!.id,
        origen_id: origenFinal,
        servicio_id: servicioId,
        fecha,
        hora,
        duracion_min: Number(duracionMin),
        recurso_id: recursoId || null,
        ojo,
        inventario_item_id: inventarioItemId,
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

        {loadingCatalogos ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-32 bg-gray-100 dark:bg-[#202327] rounded-lg" />
            <div className="h-48 bg-gray-100 dark:bg-[#202327] rounded-lg" />
          </div>
        ) : (
          <>
            {/* 1. Paciente */}
            <section className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-primary-500" /> 1. Paciente
              </h2>
              <div className="relative">
                <SearchInput
                  value={queryPaciente}
                  onChange={setQueryPaciente}
                  placeholder="Buscar paciente por nombre..."
                  aria-label="Buscar paciente"
                />
                {mostrarPacientes && pacientesResult.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] shadow-lg max-h-60 overflow-auto">
                    {pacientesResult.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => seleccionarPaciente(p)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#1D1F23] border-b border-gray-100 dark:border-[#2F3336] last:border-0"
                      >
                        <div className="font-medium text-gray-900 dark:text-[#E7E9EA]">{p.nombre_completo}</div>
                        <div className="text-xs text-gray-500 dark:text-[#71767B]">
                          {[p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                        </div>
                      </button>
                    ))}
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
                  <select
                    value={servicioId}
                    onChange={(e) => setServicioId(e.target.value)}
                    disabled={!pacienteSeleccionado || loadingServicios}
                    className={cn(inputCls, 'appearance-none disabled:opacity-60')}
                  >
                    <option value="">{loadingServicios ? 'Cargando...' : 'Seleccionar procedimiento'}</option>
                    {servicios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
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
              {!loadingCatalogos && roles.length === 0 && (
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
              <LIOSelector value={inventarioItemId} onChange={setInventarioItemId} />
              <p className="text-xs text-gray-500 dark:text-[#71767B] mt-2">
                Opcional. Solo se muestran LIOs disponibles y no caducados.
              </p>
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
