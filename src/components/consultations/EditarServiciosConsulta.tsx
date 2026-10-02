'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { enviarJSON } from '@/lib/fetcher';
import { esAnestesiologo, esMedicoTratante } from '@/lib/catalogos/personal';

export interface ServicioEditable {
  id: string | null;
  nombre: string;
  doctor_id: string | null;
  indicado_por_id: string | null;
}

interface Doctor { id: string; alias?: string | null; nombre?: string | null; tipo_personal?: string | null; cobra_honorarios?: boolean | null }
interface ServicioCatalogo { id: string; tipo: string; nombre: string; costo?: number | null }

interface Props {
  consultaId: string;
  pacienteId: string | null;
  doctorConsultaId: string;
  doctorConsultaNombre?: string | null;
  estudios: ServicioEditable[];
  procedimientos: ServicioEditable[];
  onClose: () => void;
  onSaved: () => void;
}

const sel = 'w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20';

/**
 * Editar estudios y procedimientos de una consulta ya agendada (alta rápida o
 * al concluir la consulta). Guarda con PUT /api/consultas/[id]/servicios, que
 * recalcula el costo y los honorarios.
 */
export default function EditarServiciosConsulta({
  consultaId, pacienteId, doctorConsultaId, doctorConsultaNombre, estudios: estIni, procedimientos: procIni, onClose, onSaved,
}: Props) {
  const [estudios, setEstudios] = useState<ServicioEditable[]>(estIni);
  const [procedimientos, setProcedimientos] = useState<ServicioEditable[]>(procIni);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: doctoresRaw } = useSWR<Doctor[]>('/api/configuracion/doctores', { revalidateOnFocus: false });
  const doctores = useMemo(() => (Array.isArray(doctoresRaw) ? doctoresRaw : []).map((d) => ({ ...d, etiqueta: d.alias || d.nombre || d.id })), [doctoresRaw]);
  const medicos = useMemo(() => doctores.filter(esMedicoTratante), [doctores]);
  const personalEstudios = useMemo(
    () => doctores.filter((d) => !esAnestesiologo(d) && (d.tipo_personal !== 'ENFERMERO' || d.cobra_honorarios !== false)),
    [doctores],
  );

  const urlCatalogo = pacienteId ? `/api/catalogo-servicios?paciente_id=${encodeURIComponent(pacienteId)}` : null;
  const { data: catalogo } = useSWR<{ servicios?: ServicioCatalogo[] }>(urlCatalogo, { revalidateOnFocus: false });
  const catEstudios = (catalogo?.servicios || []).filter((s) => s.tipo === 'ESTUDIO');
  const catProcs = (catalogo?.servicios || []).filter((s) => s.tipo === 'PROCEDIMIENTO');

  const agregar = (tipo: 'est' | 'proc', servicioId: string) => {
    const cat = (tipo === 'est' ? catEstudios : catProcs).find((s) => s.id === servicioId);
    if (!cat) return;
    const nuevo: ServicioEditable = { id: cat.id, nombre: cat.nombre, doctor_id: null, indicado_por_id: null };
    if (tipo === 'est') setEstudios((p) => (p.length >= 3 ? p : [...p, nuevo]));
    else setProcedimientos((p) => [...p, nuevo]);
  };
  const cambiar = (tipo: 'est' | 'proc', i: number, campo: 'doctor_id' | 'indicado_por_id', valor: string) => {
    const set = tipo === 'est' ? setEstudios : setProcedimientos;
    set((p) => p.map((s, j) => (j === i ? { ...s, [campo]: valor || null } : s)));
  };
  const quitar = (tipo: 'est' | 'proc', i: number) => {
    const set = tipo === 'est' ? setEstudios : setProcedimientos;
    set((p) => p.filter((_, j) => j !== i));
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await enviarJSON(`/api/consultas/${consultaId}/servicios`, 'PUT', { estudios, procedimientos });
      onSaved();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const consultaLabel = doctorConsultaNombre ? `${doctorConsultaNombre} (doctor de la consulta)` : 'Doctor de la consulta';

  const lista = (tipo: 'est' | 'proc') => {
    const items = tipo === 'est' ? estudios : procedimientos;
    const cat = (tipo === 'est' ? catEstudios : catProcs).filter((s) => !items.some((it) => it.id === s.id));
    const realizan = tipo === 'est' ? personalEstudios : medicos;
    const puedeAgregar = tipo === 'proc' || items.length < 3;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
          {tipo === 'est' ? 'Estudios (máx. 3)' : 'Procedimientos'}
        </p>
        {items.length === 0 && <p className="text-xs text-muted">Sin {tipo === 'est' ? 'estudios' : 'procedimientos'}.</p>}
        {items.map((s, i) => (
          <div key={`${s.id ?? s.nombre}-${i}`} className="rounded-lg border border-line bg-surface-2/60 p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-bold text-fg">{s.nombre}</span>
              <button type="button" onClick={() => quitar(tipo, i)} aria-label={`Quitar ${s.nombre}`} className="rounded p-0.5 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase text-muted">Indicado por</span>
                <select value={s.indicado_por_id || ''} onChange={(e) => cambiar(tipo, i, 'indicado_por_id', e.target.value)} className={sel}>
                  <option value="">{consultaLabel}</option>
                  {medicos.filter((d) => d.id !== doctorConsultaId).map((d) => <option key={d.id} value={d.id}>{d.etiqueta}</option>)}
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase text-muted">Realizado por</span>
                <select value={s.doctor_id || ''} onChange={(e) => cambiar(tipo, i, 'doctor_id', e.target.value)} className={sel}>
                  <option value="">{consultaLabel}</option>
                  {realizan.filter((d) => d.id !== doctorConsultaId).map((d) => (
                    <option key={d.id} value={d.id}>{d.etiqueta}{d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
        {puedeAgregar && (
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 shrink-0 text-primary-600" />
            <select
              value=""
              onChange={(e) => agregar(tipo, e.target.value)}
              disabled={!catalogo}
              className={sel}
              aria-label={tipo === 'est' ? 'Agregar estudio' : 'Agregar procedimiento'}
            >
              <option value="">
                {!catalogo ? 'Cargando catálogo…' : cat.length ? `Agregar ${tipo === 'est' ? 'estudio' : 'procedimiento'}…` : 'No hay más en el catálogo'}
              </option>
              {cat.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="pr-6">
          <h3 className="text-lg font-bold text-fg">Estudios y procedimientos</h3>
          <p className="text-sm text-muted">
            Agrega o quita lo que se indicó en la consulta. El costo se toma del catálogo de la aseguranza y los honorarios se actualizan.
          </p>
        </div>
        {lista('est')}
        {lista('proc')}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
