'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Printer, Calendar, Clock, User, Stethoscope, Eye, FileText,
  Activity, CreditCard, Shield, Upload, X, File, Download, Trash2,
  AlertTriangle, CheckCircle2, History, Users, Package, ExternalLink, Loader2
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { etiquetaModeloLio } from '@/lib/catalogos/modelos-lio';
import { ROLES_PERSONAL, TIPOS_DOCUMENTO_APOYO, etiquetaAnestesia, etiquetaOjo, tipoLioDe } from '@/lib/catalogos/cirugia';
import Avatar from '@/components/ui/Avatar';
import StatusBadge from '@/components/ui/StatusBadge';
import ClientDate from '@/components/ui/ClientDate';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import EnviarPaciente from '@/components/ui/EnviarPaciente';
import FichaPaciente from '@/components/ui/FichaPaciente';

interface RelacionSimple { nombre_completo?: string; alias?: string; nombre?: string; telefono?: string | null; email?: string | null; sexo?: string | null; fecha_nacimiento?: string | null; edad?: number | null; numero_expediente?: string | null; }
interface Origen { nombre?: string; }
interface Servicio { nombre?: string; }
interface Recurso { nombre?: string; ubicacion?: string; }
interface LioInfo { marca?: string; modelo?: string; tipo_lio?: string; lote?: string; fecha_caducidad?: string; }
interface Participante {
  id: string;
  medico_id: string;
  rol_id: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  doctores: RelacionSimple | null;
  roles: { nombre?: string; clave?: string } | null;
}
interface Archivo {
  id: string;
  nombre_original: string;
  mime_type: string;
  size: number;
  tipo_documento: string;
  uploaded_by: string | null;
  created_at: string;
}
interface ProductividadItem {
  id: string;
  participante_id: string;
  rol_id: string;
  estado: string;
  monto: number | null;
  regla_id: string | null;
  roles: { nombre?: string } | null;
}
interface HistorialItem {
  id: string;
  accion: string;
  detalle: unknown;
  usuario_id: string | null;
  created_at: string;
}
interface CirugiaData {
  id: string;
  codigo: string | null;
  paciente_id: string;
  nombre_paciente: string | null;
  fecha: string | null;
  hora: string | null;
  estado: string;
  ojo: string | null;
  duracion_min: number | null;
  notas: string | null;
  diagnostico?: string | null;
  anestesia?: string | null;
  procedencia?: string | null;
  motivo_consulta?: string | null;
  lio_diseno?: string | null;
  lio_torico?: boolean | null;
  especialidad?: { nombre: string } | null;
  modelo_lio?: { fabricante: string; modelo: string; torico: boolean } | null;
  origen_id: string | null;
  servicio_id: string | null;
  recurso_id: string | null;
  inventario_item_id: string | null;
  consulta_id: string | null;
  created_by: string | null;
  created_at: string;
  pacientes: RelacionSimple | null;
  origen: Origen | null;
  servicio: Servicio | null;
  recurso: Recurso | null;
  lio: LioInfo | null;
}
interface CirugiaDetalleResponse {
  cirugia: CirugiaData;
  participantes: Participante[];
  archivos: Archivo[];
  productividad: ProductividadItem[];
  historial: HistorialItem[];
  procedimientos_adicionales?: { id: string; nombre: string }[];
  personal?: { id: string; rol: string; nombre: string; hora_inicio?: string | null; hora_fin?: string | null }[];
}

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  aplazada: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  reagendada: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelada: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-fg">{value || '—'}</p>
    </div>
  );
}

const SKELETON_BOX = 'bg-surface-2 rounded animate-pulse';

function CirugiaDetalleSkeleton() {
  return (
    <div className="print-page" aria-busy="true" aria-live="polite">
      {/* PageHeader skeleton */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className={cn(SKELETON_BOX, 'h-4 w-24')} />
          <div className={cn(SKELETON_BOX, 'h-7 w-52')} />
          <div className={cn(SKELETON_BOX, 'h-4 w-72 max-w-full')} />
        </div>
        <div className={cn(SKELETON_BOX, 'h-10 w-32 rounded-lg')} />
      </div>

      {/* Header card */}
      <div className="bg-surface border border-line rounded-xl p-4 sm:p-6 mb-6 flex items-center gap-4">
        <div className={cn(SKELETON_BOX, 'h-12 w-12 rounded-full shrink-0')} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className={cn(SKELETON_BOX, 'h-5 w-48 max-w-full')} />
          <div className={cn(SKELETON_BOX, 'h-4 w-72 max-w-full')} />
        </div>
        <div className={cn(SKELETON_BOX, 'h-6 w-24 rounded-full shrink-0')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Información de la cirugía */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-56 mb-4')} />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className={cn(SKELETON_BOX, 'h-3 w-20')} />
                  <div className={cn(SKELETON_BOX, 'h-4 w-32 max-w-full')} />
                </div>
              ))}
            </div>
          </div>

          {/* Equipo médico */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-40 mb-4')} />
            <div className="space-y-3">
              <div className={cn(SKELETON_BOX, 'h-10 w-full rounded-lg')} />
              <div className={cn(SKELETON_BOX, 'h-10 w-full rounded-lg')} />
            </div>
          </div>

          {/* Archivos */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-36 mb-4')} />
            <div className={cn(SKELETON_BOX, 'h-20 w-full rounded-lg border-2 border-dashed border-line')} />
          </div>
        </div>

        <div className="space-y-6">
          {/* LIO */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-32 mb-4')} />
            <div className="space-y-2">
              <div className={cn(SKELETON_BOX, 'h-4 w-40 max-w-full')} />
              <div className={cn(SKELETON_BOX, 'h-4 w-28')} />
            </div>
          </div>

          {/* Productividad */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-36 mb-4')} />
            <div className="space-y-3">
              <div className={cn(SKELETON_BOX, 'h-8 w-full rounded-lg')} />
              <div className={cn(SKELETON_BOX, 'h-8 w-full rounded-lg')} />
            </div>
          </div>

          {/* Historial */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-28 mb-4')} />
            <div className="space-y-3">
              <div className={cn(SKELETON_BOX, 'h-4 w-full')} />
              <div className={cn(SKELETON_BOX, 'h-4 w-3/4')} />
              <div className={cn(SKELETON_BOX, 'h-4 w-2/3')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CirugiaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();
  // Detalle vía SWR: al volver a la pantalla se muestra al instante y tras subir o
  // eliminar archivos solo se revalidan los datos (sin volver al skeleton).
  const {
    data,
    error: errorSWR,
    isLoading: loading,
    isValidating: validating,
    mutate,
  } = useSWR<CirugiaDetalleResponse>(id ? `/api/cirugias/${id}` : null);
  const error = errorSWR ? (errorSWR instanceof Error ? errorSWR.message : 'Error desconocido') : null;
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ archivo: Archivo; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Vista previa de archivos: bloquea scroll de fondo, cierra con Escape y con
  // el botón «atrás» del celular (se agrega una entrada al historial al abrir).
  const visorAbierto = preview !== null;
  useEffect(() => {
    if (!visorAbierto) return;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ visorArchivo: true }, '');
    let cerradoPorAtras = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    const onPop = () => {
      cerradoPorAtras = true;
      setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // Cerrado con la X / Escape: se retira la entrada que se agregó al abrir
      if (!cerradoPorAtras && window.history.state?.visorArchivo) window.history.back();
    };
  }, [visorAbierto]);

  async function openPreview(a: Archivo) {
    setPreview({ archivo: a, url: '' });
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/cirugias/${id}/archivos/${a.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Error al obtener archivo');
      }
      const { signedUrl } = await res.json();
      setPreview({ archivo: a, url: signedUrl });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al abrir la vista previa', 'error');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleFile(f: File) {
    setFiles((prev) => {
      const exists = prev.find((x) => x.name === f.name && x.size === f.size);
      if (exists) return prev.filter((x) => !(x.name === f.name && x.size === f.size));
      return [...prev, f];
    });
  }

  function removeFile(f: File) {
    setFiles((prev) => prev.filter((x) => !(x.name === f.name && x.size === f.size)));
  }

  function handleFilesDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach(validarYAgregar);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    selected.forEach(validarYAgregar);
    e.target.value = '';
  }

  function validarYAgregar(file: File) {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      toast(`Formato no permitido: ${file.name}`, 'error');
      return;
    }
    if (!MIME_PERMITIDOS.includes(file.type)) {
      toast(`Tipo de archivo no válido: ${file.name}`, 'error');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast(`El archivo excede ${MAX_SIZE_MB}MB: ${file.name}`, 'error');
      return;
    }
    toggleFile(file);
  }

  async function uploadFiles() {
    if (!tipoDocumento.trim()) {
      toast('El tipo de documento es obligatorio', 'error');
      return;
    }
    if (files.length === 0) {
      toast('Selecciona al menos un archivo', 'error');
      return;
    }
    if (tipoDocumento.trim().length > 120) {
      toast('El tipo de documento es demasiado largo (máx. 120 caracteres)', 'error');
      return;
    }
    if (uploading) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('tipo_documento', tipoDocumento.trim());
        const res = await fetch(`/api/cirugias/${id}/archivos`, { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Error al subir ${file.name}`);
        }
      }
      toast('Archivos subidos exitosamente');
      setFiles([]);
      setTipoDocumento('');
      setShowUpload(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al subir archivos', 'error');
    } finally {
      // Revalida aunque falle a medias (algunos archivos pudieron subirse)
      void mutate();
      setUploading(false);
    }
  }

  async function downloadFile(archivoId: string) {
    try {
      const res = await fetch(`/api/cirugias/${id}/archivos/${archivoId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al obtener archivo');
      }
      const { signedUrl } = await res.json();
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al descargar', 'error');
    }
  }

  async function deleteFile(archivoId: string) {
    if (!confirm('¿Eliminar este archivo? Se conservará el registro en historial.')) return;
    if (eliminando) return;
    setEliminando(archivoId);
    try {
      // Optimista: el archivo desaparece al instante; se revierte si el servidor falla.
      await mutate(
        async (actual) => {
          const res = await fetch(`/api/cirugias/${id}/archivos/${archivoId}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || 'Error al eliminar');
          }
          return actual;
        },
        {
          optimisticData: (actual) =>
            actual ? { ...actual, archivos: actual.archivos.filter((a) => a.id !== archivoId) } : (actual as unknown as CirugiaDetalleResponse),
          rollbackOnError: true,
          populateCache: false,
          revalidate: true, // trae el historial actualizado
        }
      );
      toast('Archivo eliminado');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    } finally {
      setEliminando(null);
    }
  }

  if (loading && !data) {
    return <CirugiaDetalleSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Cirugía no encontrada'}</p>
        <button onClick={() => router.push('/agenda')} className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold">Volver</button>
      </div>
    );
  }

  const { cirugia, participantes, archivos, productividad, historial } = data;
  const procedimientosAdicionales = data.procedimientos_adicionales ?? [];
  const personalApoyo = data.personal ?? [];
  const nombrePaciente = cirugia.pacientes?.nombre_completo || cirugia.nombre_paciente || '—';
  const procedimiento = cirugia.servicio?.nombre || '—';
  const procedimientoOjo = cirugia.ojo ? `${procedimiento} ${etiquetaOjo(cirugia.ojo)}` : procedimiento;
  const cirujano =
    participantes.find((p) => /CIRUJANO/i.test(p.roles?.clave || p.roles?.nombre || ''))?.doctores?.alias || null;

  return (
    <div className="print-page relative animate-fadeIn" aria-busy={validating}>
      <BarraRevalidando activo={validating} className="no-print" />
      <PageHeader
        title={cirugia.codigo || 'Cirugía'}
        subtitle={`${nombrePaciente} — ${cirugia.fecha || 'Sin fecha'} ${cirugia.hora || ''}`}
        backLink={{ href: '/agenda', label: 'Agenda' }}
        action={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <EnviarPaciente
              cita={{
                tipo: 'cirugia',
                paciente: nombrePaciente === '—' ? null : nombrePaciente,
                fecha: cirugia.fecha,
                hora: cirugia.hora,
                doctor: cirujano,
                detalle: procedimiento === '—' ? null : procedimientoOjo,
                folio: cirugia.codigo,
              }}
              telefono={cirugia.pacientes?.telefono}
              email={cirugia.pacientes?.email}
            />
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors no-print">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
        }
      />

      {/* Header */}
      <div className="bg-surface border border-line rounded-xl p-4 sm:p-6 mb-6 flex items-center gap-4">
        <Avatar initials={nombrePaciente.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()} className="bg-primary-500" size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-fg truncate">{nombrePaciente}</h2>
          {cirugia.pacientes && (
            <FichaPaciente
              variante="linea"
              expediente={cirugia.pacientes.numero_expediente}
              sexo={cirugia.pacientes.sexo}
              fechaNacimiento={cirugia.pacientes.fecha_nacimiento}
              edad={cirugia.pacientes.edad}
            />
          )}
          <p className="text-sm text-muted">
            {procedimientoOjo} — {cirugia.origen?.nombre || 'Sin origen'} — {cirugia.fecha || 'Sin fecha'} {cirugia.hora || ''}
          </p>
        </div>
        <StatusBadge status={cirugia.estado} config={estadoConfig} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Información de cirugía */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <FileText className="h-4 w-4 text-primary-600" /> Información de la cirugía
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Código" value={cirugia.codigo} />
              <Field label="Paciente" value={nombrePaciente} />
              <Field label="Procedimiento" value={cirugia.servicio?.nombre} />
              {procedimientosAdicionales.length > 0 && (
                <Field label="Procedimientos adicionales" value={procedimientosAdicionales.map((p) => p.nombre).join(', ')} full />
              )}
              <Field label="Especialidad" value={cirugia.especialidad?.nombre} />
              <Field label="Procedencia" value={cirugia.procedencia ?? undefined} />
              <Field label="Motivo de consulta" value={cirugia.motivo_consulta ?? undefined} full />
              <Field label="Ojo" value={etiquetaOjo(cirugia.ojo)} />
              <Field label="Anestesia" value={etiquetaAnestesia(cirugia.anestesia) ?? undefined} />
              <Field label="Diagnóstico" value={cirugia.diagnostico ?? undefined} full />
              <Field label="Origen" value={cirugia.origen?.nombre} />
              <Field label="Recurso / Quirófano" value={cirugia.recurso?.nombre ? `${cirugia.recurso.nombre}${cirugia.recurso.ubicacion ? ` — ${cirugia.recurso.ubicacion}` : ''}` : undefined} />
              <Field label="Fecha" value={cirugia.fecha} />
              <Field label="Hora" value={cirugia.hora?.slice(0, 5)} />
              <Field label="Duración estimada" value={cirugia.duracion_min ? `${cirugia.duracion_min} min` : undefined} />
              {cirugia.consulta_id && (
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Consulta de origen</span>
                  <p className="mt-0.5 text-sm font-medium">
                    <button onClick={() => router.push(`/consultas/${cirugia.consulta_id}`)} className="text-primary-600 hover:text-primary-700 font-bold">
                      Ver consulta →
                    </button>
                  </p>
                </div>
              )}
              <Field label="Notas" value={cirugia.notas} full />
            </div>
          </div>

          {/* 2. Equipo médico */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Users className="h-4 w-4 text-sky-600" /> Equipo médico
            </h3>
            {personalApoyo.length > 0 && (
              <div className="mb-3 space-y-2">
                {personalApoyo.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-dashed border-line px-4 py-2.5">
                    <span className="text-sm font-medium text-fg">{p.nombre}</span>
                    <span className="text-xs font-bold text-muted uppercase">
                      {ROLES_PERSONAL.find((r) => r.value === p.rol)?.label || p.rol}
                      {p.hora_inicio && p.hora_fin ? ` · ${p.hora_inicio.slice(0, 5)}–${p.hora_fin.slice(0, 5)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {participantes.length === 0 ? (
              <p className="text-sm text-muted">Sin participantes registrados</p>
            ) : (
              <div className="space-y-2">
                {participantes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-2.5">
                    <span className="text-sm font-medium text-fg">{p.doctores?.alias || '—'}</span>
                    <span className="text-xs font-bold text-muted uppercase">
                      {p.roles?.nombre || p.roles?.clave || '—'}
                      {p.hora_inicio && p.hora_fin ? ` · ${p.hora_inicio.slice(0, 5)}–${p.hora_fin.slice(0, 5)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. LIO */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Eye className="h-4 w-4 text-violet-600" /> Lente Intraocular
            </h3>
            {tipoLioDe(cirugia.lio_diseno, cirugia.lio_torico) && (
              <p className="mb-3 text-sm"><span className="text-[10px] font-bold uppercase tracking-widest text-muted">Tipo de LIO</span><br /><span className="font-medium text-fg">{tipoLioDe(cirugia.lio_diseno, cirugia.lio_torico)!.label}</span></p>
            )}
            {cirugia.modelo_lio && (
              <p className="mb-3 text-sm"><span className="text-[10px] font-bold uppercase tracking-widest text-muted">Modelo (catálogo)</span><br /><span className="font-medium text-fg">{etiquetaModeloLio(cirugia.modelo_lio)}</span></p>
            )}
            {!cirugia.lio ? (
              <p className="text-sm text-muted">No se registró LIO</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Marca" value={cirugia.lio.marca} />
                <Field label="Modelo" value={cirugia.lio.modelo} />
                <Field label="Tipo" value={cirugia.lio.tipo_lio} />
                <Field label="Lote" value={cirugia.lio.lote} />
                <Field label="Caducidad" value={cirugia.lio.fecha_caducidad} />
              </div>
            )}
          </div>

          {/* 4. Archivos de apoyo */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
                <Upload className="h-4 w-4 text-emerald-600" /> Archivos de apoyo
              </h3>
              <button onClick={() => setShowUpload((s) => !s)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors no-print">
                <Upload className="h-3.5 w-3.5" /> + Agregar archivo
              </button>
            </div>

            {showUpload && (
              <div className="mb-4 rounded-lg border border-dashed border-gray-300 dark:border-line bg-surface-2 p-4 no-print animate-fadeIn">
                <input type="file" multiple accept={EXTENSIONES_PERMITIDAS.join(',')} className="hidden" id="archivo-detalle" onChange={handleFileInput} />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFilesDrop}
                  onClick={() => document.getElementById('archivo-detalle')?.click()}
                  className="cursor-pointer rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted hover:bg-surface-2"
                >
                  Arrastra archivos aquí o haz clic para seleccionar (PDF, JPG, PNG, WebP, máx. {MAX_SIZE_MB}MB)
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-muted mb-1">Tipo de documento</label>
                  <input
                    type="text"
                    list="tipos-documento-apoyo"
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value)}
                    placeholder="Ej. Consulta de medicina interna"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                  <datalist id="tipos-documento-apoyo">
                    {TIPOS_DOCUMENTO_APOYO.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((f) => (
                      <div key={`${f.name}-${f.size}`} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                        <span className="truncate text-fg">{f.name} ({formatBytes(f.size)})</span>
                        <button onClick={() => removeFile(f)} aria-label={`Quitar ${f.name}`} className="text-red-600 transition-colors hover:text-red-700"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => { setShowUpload(false); setFiles([]); setTipoDocumento(''); }} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2">Cancelar</button>
                  <button onClick={uploadFiles} disabled={uploading} aria-busy={uploading} className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                    {uploading ? 'Subiendo…' : 'Subir'}
                  </button>
                </div>
              </div>
            )}

            {archivos.length === 0 ? (
              <p className="text-sm text-muted">Sin archivos adjuntos</p>
            ) : (
              <div className="space-y-2 anim-lista">
                {archivos.map((a) => (
                  <div key={a.id} className={cn('flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-2.5 transition-opacity duration-200', eliminando === a.id && 'opacity-50')}>
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-75 transition-opacity"
                      onClick={() => openPreview(a)}
                      title="Ver vista previa"
                    >
                      <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{a.nombre_original}</p>
                        <p className="text-xs text-muted">{a.tipo_documento} — {formatBytes(a.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button onClick={() => openPreview(a)} className="text-gray-400 transition-colors hover:text-primary-600 dark:hover:text-primary-400" title="Vista previa" aria-label={`Vista previa de ${a.nombre_original}`}><Eye className="h-4 w-4" /></button>
                      <button onClick={() => downloadFile(a.id)} className="text-primary-600 transition-colors hover:text-primary-700" title="Descargar" aria-label={`Descargar ${a.nombre_original}`}><Download className="h-4 w-4" /></button>
                      <button onClick={() => deleteFile(a.id)} disabled={eliminando === a.id} className="text-red-600 transition-colors hover:text-red-700 disabled:opacity-50" title="Eliminar" aria-label={`Eliminar ${a.nombre_original}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* 5. Productividad */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Productividad
            </h3>
            {productividad.length === 0 ? (
              <p className="text-sm text-muted">Sin registros</p>
            ) : (
              <div className="space-y-2">
                {productividad.map((p) => {
                  const medico = participantes.find((x) => x.id === p.participante_id)?.doctores?.alias || '—';
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{medico}</p>
                        <p className="text-xs text-muted">{p.roles?.nombre || '—'}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.estado}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Historial */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <History className="h-4 w-4 text-violet-600" /> Historial
            </h3>
            {historial.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin eventos registrados</p>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-surface-3" />
                {historial.map((h) => {
                  const Icon = h.accion.includes('ARCHIVO') ? Upload : h.accion.includes('ESTADO') ? AlertTriangle : CheckCircle2;
                  return (
                    <div key={h.id} className="relative flex items-start gap-3">
                      <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-line">
                        <Icon className="h-4 w-4 text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg">{h.accion}</p>
                        <p className="text-xs text-muted"><ClientDate date={h.created_at} dateTime /></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visor de archivos (móvil y desktop) */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm no-print"
          role="dialog"
          aria-modal="true"
          aria-label={`Vista previa de ${preview.archivo.nombre_original}`}
          onClick={() => setPreview(null)}
        >
          {/* pt con safe-area: en la app instalada (iOS) la barra quedaba bajo el notch y la X no se podía tocar */}
          <div
            className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg truncate">{preview.archivo.nombre_original}</p>
                <p className="text-xs text-muted truncate">{preview.archivo.tipo_documento} — {formatBytes(preview.archivo.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {preview.url && (
                <button
                  onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                  className="p-2 rounded-full hover:bg-surface-2 text-primary-600 dark:text-primary-400 transition-colors"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => setPreview(null)}
                className="p-2.5 rounded-full hover:bg-surface-2 text-muted transition-colors"
                title="Cerrar"
                aria-label="Cerrar vista previa"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
          {/* overflow-auto: Safari iOS ignora la altura del iframe y lo crece al tamaño del PDF */}
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
            {previewLoading || !preview.url ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            ) : preview.archivo.mime_type === 'application/pdf' ? (
              <iframe
                src={preview.url}
                title={preview.archivo.nombre_original}
                className="h-full w-full rounded-lg bg-white"
              />
            ) : preview.archivo.mime_type.startsWith('image/') ? (
              <div className="flex h-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt={preview.archivo.nombre_original}
                  className="max-h-full max-w-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <File className="h-10 w-10 text-gray-500" />
                <p className="text-sm text-muted">Vista previa no disponible para este formato</p>
                <button
                  onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
                >
                  Abrir archivo
                </button>
              </div>
            )}
          </div>
          {/* Cierre al alcance del pulgar en celular */}
          <div
            className="border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreview(null)}
              className="w-full rounded-xl bg-surface-2 py-3 text-sm font-bold text-fg active:scale-[0.99]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
