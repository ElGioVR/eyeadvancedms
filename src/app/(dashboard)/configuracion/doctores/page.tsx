'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import BadgeCompletar from '@/components/ui/BadgeCompletar';
import {
  Plus,
  Search,
  X,
  Mail,
  Phone,
  Stethoscope,
  Trash2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text';
import { useFetch } from '@/hooks/useFetch';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { buscarEspecialidad } from '@/lib/catalogos/especialidades';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface DoctorAPI {
  id: string;
  alias: string;
  nombre: string | null;
  apellido: string | null;
  especialidad: string;
  cedula: string | null;
  telefono: string | null;
  email: string | null;
  usuario_id: string | null;
  activo: boolean;
  /** Personal unificado (mig. 390) */
  tipo_personal?: 'MEDICO' | 'ENFERMERO' | 'ANESTESIOLOGO';
  cobra_honorarios?: boolean;
  /** Alta automática por importación con datos por completar (mig. 400) */
  pendiente_completar?: boolean;
  faltantes?: string[];
  created_at: string;
}

type TipoPersonal = 'MEDICO' | 'ENFERMERO' | 'ANESTESIOLOGO';
const ESPECIALIDAD_ENFERMERIA = 'Enfermería';
const ESPECIALIDAD_ANESTESIA = 'Anestesiología';

interface UsuarioOption {
  id: string;
  email: string;
  nombre: string;
  rol?: string;
}

const avatarColors = [
  'bg-primary-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-violet-500',
];


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const comoLista = (actual: unknown): DoctorAPI[] => (Array.isArray(actual) ? (actual as DoctorAPI[]) : []);
const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function getAvatarColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

export default function DoctoresPage() {
  const { data: doctores, loading, validating, error, mutate } = useFetch<DoctorAPI>('/api/configuracion/doctores');
  const { especialidades } = useEspecialidades();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingDoctor, setEditingDoctor] = useState<DoctorAPI | null>(null);
  const [showNewDoctor, setShowNewDoctor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formAlias, setFormAlias] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formApellido, setFormApellido] = useState('');
  const [formEspecialidad, setFormEspecialidad] = useState('Oftalmología');
  const [formCedula, setFormCedula] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsuarioId, setFormUsuarioId] = useState('');
  const [formTipo, setFormTipo] = useState<TipoPersonal>('MEDICO');
  const [formCobra, setFormCobra] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<'' | TipoPersonal>('');
  // ?tipo=ENFERMERO (p. ej. desde la antigua pestaña Personal clínico) preselecciona el filtro.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tipo');
    if (t === 'ENFERMERO' || t === 'MEDICO' || t === 'ANESTESIOLOGO') setFiltroTipo(t);
  }, []);

  // Usuarios vinculables: misma caché que /configuracion/usuarios; solo se pide con el panel abierto.
  const panelAbierto = !!editingDoctor || showNewDoctor;
  const { data: todosUsuarios } = useFetch<UsuarioOption>('/api/configuracion/usuarios', undefined, { enabled: panelAbierto });
  const usuariosDoctor = useMemo(
    () => todosUsuarios.filter((u) => ['doctor', 'admin', 'enfermero'].includes(u.rol ?? '')),
    [todosUsuarios]
  );

  const debouncedSearch = useDebounce(search);
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return doctores.filter(
      (d) =>
        (!filtroTipo || (d.tipo_personal || 'MEDICO') === filtroTipo) &&
        ((d.alias || '').toLowerCase().includes(term) ||
          (d.especialidad || '').toLowerCase().includes(term) ||
          (d.cedula && d.cedula.toLowerCase().includes(term)))
    );
  }, [doctores, debouncedSearch, filtroTipo]);

  const resetForm = useCallback(() => {
    setFormAlias('');
    setFormNombre('');
    setFormApellido('');
    setFormEspecialidad('Oftalmología');
    setFormCedula('');
    setFormTelefono('');
    setFormEmail('');
    setFormUsuarioId('');
    setFormTipo('MEDICO');
    setFormCobra(true);
  }, []);

  const handleNewDoctor = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewDoctor(true);
  }, [resetForm]);

  const handleEditDoctor = useCallback((doc: DoctorAPI) => {
    setFormAlias(doc.alias);
    setFormNombre(doc.nombre || '');
    setFormApellido(doc.apellido || '');
    setFormEspecialidad(doc.especialidad);
    setFormCedula(doc.cedula || '');
    setFormTelefono(doc.telefono || '');
    setFormEmail(doc.email || '');
    setFormUsuarioId(doc.usuario_id || '');
    setFormTipo(doc.tipo_personal || 'MEDICO');
    setFormCobra(doc.cobra_honorarios !== false);
    setFormError(null);
    setEditingDoctor(doc);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingDoctor(null);
    setShowNewDoctor(false);
    resetForm();
  }, [resetForm]);

  const payloadForm = useCallback(() => ({
    alias: formAlias.trim(),
    nombre: formNombre.trim() || null,
    apellido: formApellido.trim() || null,
    especialidad: formEspecialidad,
    cedula: formCedula.trim(),
    telefono: formTelefono.trim(),
    // Vacío → sin correo (el esquema del servidor rechaza '' como email).
    email: formEmail.trim() || null,
    usuario_id: formUsuarioId || null,
    tipo_personal: formTipo,
    cobra_honorarios: formCobra,
  }), [formAlias, formNombre, formApellido, formEspecialidad, formCedula, formTelefono, formEmail, formUsuarioId, formTipo, formCobra]);

  /** Validación local (el servidor sigue siendo la autoridad). */
  const validar = useCallback((): string | null => {
    if (!formAlias.trim()) return 'El alias es obligatorio';
    if (formAlias.trim().length > 100) return 'El alias no puede exceder 100 caracteres';
    if (formEmail.trim() && !EMAIL_RE.test(formEmail.trim())) return 'Correo electrónico no válido';
    if (formTelefono.trim() && !/^[0-9+()\-\s.]{7,20}$/.test(formTelefono.trim())) return 'Teléfono no válido';
    return null;
  }, [formAlias, formEmail, formTelefono]);

  const handleCreate = useCallback(async () => {
    if (saving) return;
    const invalido = validar();
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    try {
      const { email, ...resto } = payloadForm();
      // En alta el esquema acepta email opcional pero no null.
      const body = email ? { ...resto, email } : resto;
      await mutate(
        async (actual: unknown) => {
          const nuevo = await enviarJSON<DoctorAPI>('/api/configuracion/doctores', 'POST', body);
          return nuevo?.id ? [...comoLista(actual), nuevo] : comoLista(actual);
        },
        { populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Doctor creado exitosamente');
    } catch (err) {
      setFormError(msg(err, 'Error al crear doctor'));
    } finally {
      setSaving(false);
    }
  }, [saving, validar, payloadForm, mutate, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingDoctor || saving) return;
    const invalido = validar();
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    const id = editingDoctor.id;
    const body = payloadForm();
    const aplicar = (actual: unknown) => comoLista(actual).map((d) => (d.id === id ? { ...d, ...body } : d));
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON('/api/configuracion/doctores', 'PATCH', { id, ...body });
          return aplicar(actual);
        },
        { optimisticData: aplicar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Doctor actualizado exitosamente');
    } catch (err) {
      setFormError(msg(err, 'Error al actualizar doctor'));
    } finally {
      setSaving(false);
    }
  }, [editingDoctor, saving, validar, payloadForm, mutate, handleCloseSidebar, toast]);

  const handleDelete = useCallback(async (doctorId: string) => {
    const quitar = (actual: unknown) => comoLista(actual).filter((d) => d.id !== doctorId);
    setDeleting(doctorId);
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON(`/api/configuracion/doctores?id=${encodeURIComponent(doctorId)}`, 'DELETE');
          return quitar(actual);
        },
        { optimisticData: quitar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      toast('Doctor eliminado');
      if (editingDoctor?.id === doctorId) handleCloseSidebar();
    } catch (err) {
      toast(msg(err, 'No se pudo eliminar el doctor'), 'error');
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }, [mutate, toast, editingDoctor, handleCloseSidebar]);

  const cargandoInicial = loading && doctores.length === 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, especialidad o cédula..."
              className="w-full pl-8 pr-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleNewDoctor}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            NUEVO PERSONAL
          </button>
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Tipo de personal">
            {([['', 'Todos'], ['MEDICO', 'Médicos'], ['ANESTESIOLOGO', 'Anestesiólogos'], ['ENFERMERO', 'Enfermería']] as const).map(([v, l]) => (
              <button
                key={l}
                onClick={() => setFiltroTipo(v)}
                className={cn('rounded-md px-3 py-1.5 text-xs font-bold', filtroTipo === v ? 'bg-surface-2 text-fg' : 'text-muted')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && doctores.length === 0 && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Cards */}
        {cargandoInicial ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl border border-line bg-surface animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-12 text-center animate-fadeIn">
            <Stethoscope className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-muted">No se encontró personal</p>
          </div>
        ) : (
          <div className="relative" aria-busy={validating}>
          <BarraRevalidando activo={validating} className="-top-2" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 anim-lista">
            {filtered.map((doc) => {
              const initials = getInitials(doc.alias);
              const avatarColor = getAvatarColor(doc.id);
              return (
                <div key={doc.id} className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none transition-[box-shadow,transform] duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', avatarColor)}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-fg truncate">{doc.alias}</h3>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', doc.tipo_personal === 'ENFERMERO' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : doc.tipo_personal === 'ANESTESIOLOGO' ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' : 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300')}>
                            {doc.tipo_personal === 'ENFERMERO' ? 'Enfermería' : doc.tipo_personal === 'ANESTESIOLOGO' ? 'Anestesiólogo' : 'Médico'}
                          </span>
                          {doc.cobra_honorarios === false && (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">Sin honorarios</span>
                          )}
                          {doc.pendiente_completar && <BadgeCompletar faltantes={doc.faltantes} />}
                        </div>
                        {(doc.nombre || doc.apellido) && (
                          <p className="text-xs text-muted mt-0.5 truncate">
                            {[doc.nombre, doc.apellido].filter(Boolean).join(' ')}
                          </p>
                        )}
                        <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                          <Stethoscope className="h-3 w-3" />
                          {doc.especialidad}
                        </p>
                        {doc.cedula && (
                          <p className="text-xs text-muted mt-0.5">Céd. {doc.cedula}</p>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5 text-xs text-muted border-t border-line/70 pt-3">
                      {doc.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted dark:text-muted" />
                          <span className="truncate">{doc.email}</span>
                        </div>
                      )}
                      {doc.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted dark:text-muted" />
                          <span>{doc.telefono}</span>
                        </div>
                      )}
                      {!doc.email && !doc.telefono && (
                        <p className="text-gray-300 dark:text-muted italic">Sin contacto registrado</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleEditDoctor(doc)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 dark:text-muted hover:bg-surface-2 dark:bg-surface-2 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(doc.id)}
                        disabled={deleting === doc.id}
                        aria-label={`Eliminar a ${doc.alias}`}
                        className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-bold text-muted dark:text-muted hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                      >
                        {deleting === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingDoctor || showNewDoctor) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-fadeIn" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl animate-fadeIn lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">
                  {editingDoctor ? 'Editar personal' : 'Nuevo personal'}
                </h3>
                <button onClick={handleCloseSidebar} aria-label="Cerrar" className="text-muted dark:text-muted hover:text-gray-600 dark:hover:text-fg dark:text-fg dark:text-muted transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Tipo de personal</label>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de personal">
                    {([['MEDICO', 'Médico'], ['ANESTESIOLOGO', 'Anestesiólogo'], ['ENFERMERO', 'Enfermero(a)']] as const).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={formTipo === v}
                        onClick={() => {
                          setFormTipo(v);
                          if (v === 'ENFERMERO') {
                            setFormEspecialidad(ESPECIALIDAD_ENFERMERIA);
                            if (!editingDoctor) setFormCobra(false);
                          } else if (v === 'ANESTESIOLOGO') {
                            setFormEspecialidad(ESPECIALIDAD_ANESTESIA);
                            if (!editingDoctor) setFormCobra(true);
                          } else if (formEspecialidad === ESPECIALIDAD_ENFERMERIA || formEspecialidad === ESPECIALIDAD_ANESTESIA) {
                            setFormEspecialidad('Oftalmología');
                          }
                        }}
                        title={l}
                        className={cn(
                          // 3 opciones en un panel angosto: el texto se ajusta sin desbordar el borde.
                          'min-w-0 truncate rounded-lg border px-1.5 py-2 text-xs font-bold sm:text-[13px]',
                          formTipo === v ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'border-line text-fg-2'
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {formTipo === 'ANESTESIOLOGO'
                      ? 'El anestesiólogo solo ejerce la anestesia: aparece únicamente en el rol «Anestesiólogo» de las cirugías y sus honorarios se manejan en Productividad.'
                      : 'Enfermería se asigna en cirugías como instrumentista, enfermero(a) o circulante y aparece en la agenda.'}
                  </p>
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
                  <input type="checkbox" checked={formCobra} onChange={(e) => setFormCobra(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-bold text-fg">Cobra honorarios</span>
                    <span className="block text-[11px] text-muted">
                      {formTipo === 'ANESTESIOLOGO'
                        ? 'Genera un honorario (rol Anestesiólogo) por cada cirugía en la que anestesia; el monto se liquida en Productividad.'
                        : formTipo === 'ENFERMERO'
                        ? 'Activo: puede realizar estudios (y consultas de tipo Estudios), genera honorarios y ve «Mis honorarios». Inactivo: solo apoyo en cirugía, sin honorarios.'
                        : 'Genera honorarios por consultas, estudios, procedimientos y cirugías.'}
                    </span>
                  </span>
                </label>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                    Alias <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formAlias}
                    onChange={(e) => setFormAlias(e.target.value)}
                    placeholder="Ej. DR BAYARDO"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <p className="mt-1 text-[11px] text-muted">Nombre con el que se muestra en toda la app (agenda, citas, reportes).</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Nombre</label>
                    <input
                      type="text"
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      placeholder="Bayardo"
                      className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Apellido</label>
                    <input
                      type="text"
                      value={formApellido}
                      onChange={(e) => setFormApellido(e.target.value)}
                      placeholder="Cisneros"
                      className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>
                {formTipo === 'MEDICO' && (
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Especialidad</label>
                  <select
                    value={buscarEspecialidad(especialidades, formEspecialidad)?.nombre ?? formEspecialidad}
                    onChange={(e) => setFormEspecialidad(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    {/* Catálogo compartido con consultas y agenda (cat_especialidades). */}
                    {formEspecialidad && !buscarEspecialidad(especialidades, formEspecialidad) && (
                      <option value={formEspecialidad}>{formEspecialidad}</option>
                    )}
                    {especialidades.map((e) => (
                      <option key={e.clave} value={e.nombre}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Cédula Profesional</label>
                  <input
                    type="text"
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    placeholder="Ej. 12345678"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="Ej. 664-111-2222"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="correo@eyeadvanced.com"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Vincular Usuario</label>
                  <select
                    value={formUsuarioId}
                    onChange={(e) => setFormUsuarioId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="">Sin vincular</option>
                    {usuariosDoctor.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.email} {u.rol === 'admin' ? '(Admin)' : '(Doctor)'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-muted">Usuarios con rol Doctor o Administrador</p>
                </div>
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCloseSidebar}
                    className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 dark:text-muted hover:bg-surface-2 dark:bg-surface-2 transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={editingDoctor ? handleUpdate : handleCreate}
                    disabled={saving || !formAlias.trim()}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                    ) : editingDoctor ? 'GUARDAR CAMBIOS' : 'CREAR DOCTOR'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Eliminar Doctor"
        message="¿Eliminar este doctor? Esta acción no se puede deshacer."
        confirmLabel="ELIMINAR"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
