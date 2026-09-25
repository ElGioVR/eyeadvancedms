'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Printer, Calendar, Clock, User, Stethoscope, Eye, FileText,
  Activity, CreditCard, Shield, Upload, X, File, Download, Trash2,
  AlertTriangle, CheckCircle2, History, Users, Package, ExternalLink, Loader2
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import StatusBadge from '@/components/ui/StatusBadge';
import ClientDate from '@/components/ui/ClientDate';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';

interface RelacionSimple { nombre_completo?: string; alias?: string; nombre?: string; }
interface Origen { nombre?: string; }
interface Servicio { nombre?: string; }
interface Recurso { nombre?: string; ubicacion?: string; }
interface LioInfo { marca?: string; modelo?: string; tipo_lio?: string; lote?: string; fecha_caducidad?: string; }
interface Participante {
  id: string;
  medico_id: string;
  rol_id: string;
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
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{value || '—'}</p>
    </div>
  );
}

const SKELETON_BOX = 'bg-gray-100 dark:bg-[#202327] rounded animate-pulse';

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
      <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-4 sm:p-6 mb-6 flex items-center gap-4">
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
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
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
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-40 mb-4')} />
            <div className="space-y-3">
              <div className={cn(SKELETON_BOX, 'h-10 w-full rounded-lg')} />
              <div className={cn(SKELETON_BOX, 'h-10 w-full rounded-lg')} />
            </div>
          </div>

          {/* Archivos */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-36 mb-4')} />
            <div className={cn(SKELETON_BOX, 'h-20 w-full rounded-lg border-2 border-dashed border-gray-200 dark:border-[#2F3336]')} />
          </div>
        </div>

        <div className="space-y-6">
          {/* LIO */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-32 mb-4')} />
            <div className="space-y-2">
              <div className={cn(SKELETON_BOX, 'h-4 w-40 max-w-full')} />
              <div className={cn(SKELETON_BOX, 'h-4 w-28')} />
            </div>
          </div>

          {/* Productividad */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <div className={cn(SKELETON_BOX, 'h-4 w-36 mb-4')} />
            <div className="space-y-3">
              <div className={cn(SKELETON_BOX, 'h-8 w-full rounded-lg')} />
              <div className={cn(SKELETON_BOX, 'h-8 w-full rounded-lg')} />
            </div>
          </div>

          {/* Historial */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
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
  const [data, setData] = useState<CirugiaDetalleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ archivo: Archivo; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchCirugia = useCallback(async () => {
    try {
      const res = await fetch(`/api/cirugias/${id}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `Error al cargar la cirugía (${res.status})`);
      }
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCirugia(); }, [fetchCirugia]);

  // Vista previa de archivos: bloquea scroll de fondo y cierra con Escape
  useEffect(() => {
    if (!preview) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [preview]);

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
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('tipo_documento', tipoDocumento.trim());
        const res = await fetch(`/api/cirugias/${id}/archivos`, { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Error al subir ${file.name}`);
        }
      }
      toast('Archivos subidos exitosamente');
      setFiles([]);
      setTipoDocumento('');
      setShowUpload(false);
      await fetchCirugia();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al subir archivos', 'error');
    } finally {
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
    try {
      const res = await fetch(`/api/cirugias/${id}/archivos/${archivoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al eliminar');
      }
      toast('Archivo eliminado');
      await fetchCirugia();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  }

  if (loading) {
    return <CirugiaDetalleSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Cirugía no encontrada'}</p>
        <button onClick={() => router.push('/agenda')} className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold">Volver</button>
      </div>
    );
  }

  const { cirugia, participantes, archivos, productividad, historial } = data;
  const nombrePaciente = cirugia.pacientes?.nombre_completo || cirugia.nombre_paciente || '—';
  const procedimiento = cirugia.servicio?.nombre || '—';
  const procedimientoOjo = cirugia.ojo ? `${procedimiento} ${cirugia.ojo}` : procedimiento;

  return (
    <div className="print-page">
      <PageHeader
        title={cirugia.codigo || 'Cirugía'}
        subtitle={`${nombrePaciente} — ${cirugia.fecha || 'Sin fecha'} ${cirugia.hora || ''}`}
        backLink={{ href: '/agenda', label: 'Agenda' }}
        action={
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors no-print">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
        }
      />

      {/* Header */}
      <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-4 sm:p-6 mb-6 flex items-center gap-4">
        <Avatar initials={nombrePaciente.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()} className="bg-primary-500" size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{nombrePaciente}</h2>
          <p className="text-sm text-gray-500 dark:text-[#71767B]">
            {procedimientoOjo} — {cirugia.origen?.nombre || 'Sin origen'} — {cirugia.fecha || 'Sin fecha'} {cirugia.hora || ''}
          </p>
        </div>
        <StatusBadge status={cirugia.estado} config={estadoConfig} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Información de cirugía */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <FileText className="h-4 w-4 text-primary-600" /> Información de la cirugía
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Código" value={cirugia.codigo} />
              <Field label="Paciente" value={nombrePaciente} />
              <Field label="Procedimiento" value={cirugia.servicio?.nombre} />
              <Field label="Ojo" value={cirugia.ojo} />
              <Field label="Origen" value={cirugia.origen?.nombre} />
              <Field label="Recurso / Quirófano" value={cirugia.recurso?.nombre ? `${cirugia.recurso.nombre}${cirugia.recurso.ubicacion ? ` — ${cirugia.recurso.ubicacion}` : ''}` : undefined} />
              <Field label="Fecha" value={cirugia.fecha} />
              <Field label="Hora" value={cirugia.hora?.slice(0, 5)} />
              <Field label="Duración estimada" value={cirugia.duracion_min ? `${cirugia.duracion_min} min` : undefined} />
              {cirugia.consulta_id && (
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Consulta de origen</span>
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
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <Users className="h-4 w-4 text-sky-600" /> Equipo médico
            </h3>
            {participantes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin participantes registrados</p>
            ) : (
              <div className="space-y-2">
                {participantes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{p.doctores?.alias || '—'}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase">{p.roles?.nombre || p.roles?.clave || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. LIO */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <Eye className="h-4 w-4 text-violet-600" /> Lente Intraocular
            </h3>
            {!cirugia.lio ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B]">No se registró LIO</p>
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
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
                <Upload className="h-4 w-4 text-emerald-600" /> Archivos de apoyo
              </h3>
              <button onClick={() => setShowUpload((s) => !s)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors no-print">
                <Upload className="h-3.5 w-3.5" /> + Agregar archivo
              </button>
            </div>

            {showUpload && (
              <div className="mb-4 rounded-lg border border-dashed border-gray-300 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] p-4 no-print">
                <input type="file" multiple accept={EXTENSIONES_PERMITIDAS.join(',')} className="hidden" id="archivo-detalle" onChange={handleFileInput} />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFilesDrop}
                  onClick={() => document.getElementById('archivo-detalle')?.click()}
                  className="cursor-pointer rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 text-center text-sm text-gray-500 dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
                >
                  Arrastra archivos aquí o haz clic para seleccionar (PDF, JPG, PNG, WebP, máx. {MAX_SIZE_MB}MB)
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Tipo de documento</label>
                  <input
                    type="text"
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value)}
                    placeholder="Ej. Consentimiento informado"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA]"
                  />
                </div>
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((f) => (
                      <div key={`${f.name}-${f.size}`} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-sm">
                        <span className="truncate text-gray-900 dark:text-[#E7E9EA]">{f.name} ({formatBytes(f.size)})</span>
                        <button onClick={() => removeFile(f)} className="text-red-600 hover:text-red-700"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => { setShowUpload(false); setFiles([]); setTipoDocumento(''); }} className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-3 py-2 text-xs font-bold text-gray-600 dark:text-[#E7E9EA]">Cancelar</button>
                  <button onClick={uploadFiles} disabled={uploading} className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                    {uploading ? 'Subiendo...' : 'Subir'}
                  </button>
                </div>
              </div>
            )}

            {archivos.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin archivos adjuntos</p>
            ) : (
              <div className="space-y-2">
                {archivos.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] px-4 py-2.5">
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-75 transition-opacity"
                      onClick={() => openPreview(a)}
                      title="Ver vista previa"
                    >
                      <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA] truncate">{a.nombre_original}</p>
                        <p className="text-xs text-gray-500 dark:text-[#71767B]">{a.tipo_documento} — {formatBytes(a.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button onClick={() => openPreview(a)} className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400" title="Vista previa"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => downloadFile(a.id)} className="text-primary-600 hover:text-primary-700" title="Descargar"><Download className="h-4 w-4" /></button>
                      <button onClick={() => deleteFile(a.id)} className="text-red-600 hover:text-red-700" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* 5. Productividad */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Productividad
            </h3>
            {productividad.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin registros</p>
            ) : (
              <div className="space-y-2">
                {productividad.map((p) => {
                  const medico = participantes.find((x) => x.id === p.participante_id)?.doctores?.alias || '—';
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA] truncate">{medico}</p>
                        <p className="text-xs text-gray-500 dark:text-[#71767B]">{p.roles?.nombre || '—'}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.estado}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Historial */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <History className="h-4 w-4 text-violet-600" /> Historial
            </h3>
            {historial.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B] text-center py-4">Sin eventos registrados</p>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-[#2F3336]" />
                {historial.map((h) => {
                  const Icon = h.accion.includes('ARCHIVO') ? Upload : h.accion.includes('ESTADO') ? AlertTriangle : CheckCircle2;
                  return (
                    <div key={h.id} className="relative flex items-start gap-3">
                      <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336]">
                        <Icon className="h-4 w-4 text-gray-500 dark:text-[#71767B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{h.accion}</p>
                        <p className="text-xs text-gray-400 dark:text-[#71767B]"><ClientDate date={h.created_at} dateTime /></p>
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
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm no-print" onClick={() => setPreview(null)}>
          <div
            className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{preview.archivo.nombre_original}</p>
                <p className="text-xs text-gray-500 dark:text-[#71767B] truncate">{preview.archivo.tipo_documento} — {formatBytes(preview.archivo.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {preview.url && (
                <button
                  onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327] text-primary-600 dark:text-primary-400 transition-colors"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => setPreview(null)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327] text-gray-500 dark:text-[#71767B] transition-colors"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
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
                <p className="text-sm text-gray-400 dark:text-[#71767B]">Vista previa no disponible para este formato</p>
                <button
                  onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
                >
                  Abrir archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
