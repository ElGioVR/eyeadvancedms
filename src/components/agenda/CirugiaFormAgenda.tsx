'use client';

import { Doctor } from '@/components/agenda/agenda-comun';
import { type AgendaCirugia } from '@/types';
import { useState, useEffect } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import useSWR from 'swr';
import { enviarJSON } from '@/lib/fetcher';
import { agendaSoloPropia } from '@/lib/permisos-agenda';
import { cn } from '@/lib/utils';
import LIOSelector from '@/components/cirugia/LIOSelector';
import { ANESTESIAS } from '@/lib/catalogos/cirugia';

/* ───────── Quick Add / Form ───────── */
export function CirugiaForm({ cirugiaId, doctores, userRol, initialDate, initialHour, onClose, onSaved }: {
  cirugiaId: string | null; doctores: Doctor[]; userRol: string; initialDate?: string | null; initialHour?: string;
  onClose: () => void; onSaved: (id: string | null, cambios?: Partial<AgendaCirugia>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!cirugiaId;
  interface CirugiaForm {
    nombre_paciente: string; expediente: string; fecha: string; hora: string;
    jornada: string; diagnostico: string; procedimiento: string; ojo: string; lio: string; marca_lio: string;
    inventario_item_id: string;
    tiempo_estimado: string; tiempo_estancia: string; doctor_id: string; notas: string; procedencia: string; motivo_aplazamiento: string;
    anestesia: string;
  }

  const defaultCirugiaForm: CirugiaForm = {
    nombre_paciente: '', expediente: '', fecha: initialDate || '', hora: initialHour || '',
    jornada: '', diagnostico: '', procedimiento: '', ojo: '', lio: '', marca_lio: '',
    inventario_item_id: '',
    tiempo_estimado: '', tiempo_estancia: '', doctor_id: '', notas: '', procedencia: '', motivo_aplazamiento: '',
    anestesia: '',
  };

  const [form, setForm] = useState<CirugiaForm>(() => {
    // Load draft only for new surgeries
    if (!cirugiaId) {
      try {
        const raw = localStorage.getItem('autosave:nueva-cirugia');
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && draft.nombre_paciente !== undefined) return draft;
        }
      } catch {}
    }
    return defaultCirugiaForm;
  });
  const [formCargado, setFormCargado] = useState(!cirugiaId);

  const { clearDraft } = useAutosave(isEditing ? '' : 'nueva-cirugia', form, isEditing ? 999999 : 1500);

  // Detalle del evento a editar (caché compartida con el popover de la agenda).
  const { data: detalle, error: errorDetalle } = useSWR<AgendaCirugia>(
    cirugiaId ? `/api/agenda/${cirugiaId}` : null,
    { revalidateOnFocus: false }
  );
  useEffect(() => {
    if (errorDetalle && !formCargado) { setError('Error al cargar la cirugía'); setFormCargado(true); }
  }, [errorDetalle, formCargado]);
  useEffect(() => {
    if (!detalle || formCargado) return;
    const data = detalle;
    setForm({
      nombre_paciente: data.nombre_paciente || '', expediente: data.expediente || '', fecha: data.fecha || '',
      hora: data.hora?.slice(0, 5) || '', jornada: data.jornada || '', diagnostico: data.diagnostico || '',
      procedimiento: data.procedimiento || '', ojo: data.ojo || '', lio: data.lio || '', marca_lio: data.marca_lio || '',
      inventario_item_id: data.inventario_item_id || '',
      tiempo_estimado: data.tiempo_estimado || '', tiempo_estancia: data.tiempo_estancia || '', doctor_id: data.doctor_id || '',
      notas: data.notas || '', procedencia: data.procedencia || '', motivo_aplazamiento: data.motivo_aplazamiento || '',
      anestesia: data.anestesia || '',
    });
    setFormCargado(true);
  }, [detalle, formCargado]);
  const loadingCirugia = !formCargado;
  const { data: procedenciasData } = useSWR<string[]>('/api/catalogos/procedencias', { revalidateOnFocus: false });

  const handleLIOSelect = (itemId: string | null) => {
    setForm(f => ({
      ...f,
      inventario_item_id: itemId || '',
      // No se copian marca/modelo/lote a campos de texto; la relación es por FK.
      lio: '',
      marca_lio: '',
    }));
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.nombre_paciente.trim()) { setError('El nombre del paciente es obligatorio'); return; }
    if (form.nombre_paciente.trim().length > 200) { setError('El nombre del paciente es demasiado largo (máx. 200 caracteres)'); return; }
    if (form.notas.length > 2000) { setError('Las notas son demasiado largas (máx. 2000 caracteres)'); return; }
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        nombre_paciente: form.nombre_paciente.trim(), expediente: form.expediente || null, fecha: form.fecha || null,
        hora: form.hora || null, jornada: form.jornada || null, diagnostico: form.diagnostico || null,
        procedimiento: form.procedimiento || null, ojo: form.ojo || null, lio: form.lio || null,
        marca_lio: form.marca_lio || null, inventario_item_id: form.inventario_item_id || null,
        tiempo_estimado: form.tiempo_estimado || null, tiempo_estancia: form.tiempo_estancia || null,
        doctor_id: form.doctor_id || null, notas: form.notas || null, procedencia: form.procedencia || null,
        motivo_aplazamiento: form.motivo_aplazamiento || null,
        // Sin valor = no se toca (la base conserva la anestesia actual).
        anestesia: form.anestesia || undefined,
      };
      const url = cirugiaId ? `/api/agenda/${cirugiaId}` : '/api/agenda';
      await enviarJSON(url, cirugiaId ? 'PATCH' : 'POST', body);
      clearDraft();
      const doctor = doctores.find((d) => d.id === form.doctor_id);
      onSaved(cirugiaId, cirugiaId ? {
        ...(body as Partial<AgendaCirugia>),
        ...(!agendaSoloPropia(userRol) ? { doctor_nombre: doctor?.alias ?? null } : {}),
      } : undefined);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error desconocido'); } finally { setSaving(false); }
  };

  if (loadingCirugia) {
    return (
      <div className="animate-pulse space-y-4 py-1" aria-busy="true" aria-label="Cargando">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-surface-3/70" />
            <div className="h-10 rounded-lg bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500";
  const labelCls = "block text-xs font-bold text-muted mb-1";

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div><label className={labelCls}>Nombre del paciente <span className="text-red-500">*</span></label><input type="text" value={form.nombre_paciente} onChange={e => setForm(f => ({ ...f, nombre_paciente: e.target.value }))} placeholder="Nombre completo" className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Expediente</label><input type="text" value={form.expediente} onChange={e => setForm(f => ({ ...f, expediente: e.target.value }))} placeholder="Núm. expediente" className={inputCls} /></div>
        <div><label className={labelCls}>Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Hora</label><input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Jornada</label><input type="text" value={form.jornada} onChange={e => setForm(f => ({ ...f, jornada: e.target.value }))} placeholder="Ej. TIJUANA" className={inputCls} /></div>
      </div>
      {!agendaSoloPropia(userRol) && (
        <div><label className={labelCls}>Doctor / Cirujano</label>
          <select value={form.doctor_id} onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">Sin asignar</option>
            {doctores.filter(d => d.tipo_personal !== 'ENFERMERO' && d.tipo_personal !== 'ANESTESIOLOGO').map(d => <option key={d.id} value={d.id}>{d.alias}</option>)}
          </select>
        </div>
      )}
      <div><label className={labelCls}>Procedimiento</label><input type="text" value={form.procedimiento} onChange={e => setForm(f => ({ ...f, procedimiento: e.target.value }))} placeholder="Ej. FACO + LIO" className={inputCls} /></div>
      <div><label className={labelCls}>Diagnóstico</label><input type="text" value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))} placeholder="Diagnóstico" className={inputCls} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>Ojo</label>
          <select value={form.ojo} onChange={e => setForm(f => ({ ...f, ojo: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">—</option><option value="OD">OD</option><option value="OI">OS</option><option value="OU">OU</option>
          </select>
        </div>
        <div className="col-span-2"><label className={labelCls}>LIO desde Inventario <span className="font-normal text-muted">(opcional)</span></label>
          <LIOSelector value={form.inventario_item_id} onChange={handleLIOSelect} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Tiempo estimado</label><input type="text" value={form.tiempo_estimado} onChange={e => setForm(f => ({ ...f, tiempo_estimado: e.target.value }))} placeholder="Ej. 1 HR" className={inputCls} /></div>
        <div><label className={labelCls}>Tiempo estancia</label><input type="text" value={form.tiempo_estancia} onChange={e => setForm(f => ({ ...f, tiempo_estancia: e.target.value }))} placeholder="Ej. 3 HR" className={inputCls} /></div>
      </div>
      <div><label className={labelCls}>Notas</label><textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Notas adicionales..." className={cn(inputCls, 'resize-none')} /></div>
      <div><label className={labelCls}>Procedencia</label><input type="text" list="procedencias-lista-edicion" value={form.procedencia} onChange={e => setForm(f => ({ ...f, procedencia: e.target.value }))} placeholder="Ej. Derivación externa" className={inputCls} /></div>
      <datalist id="procedencias-lista-edicion">
        {(procedenciasData ?? []).map((p) => <option key={p} value={p} />)}
      </datalist>
      <div><label className={labelCls}>Anestesia</label>
        <select value={form.anestesia} onChange={e => setForm(f => ({ ...f, anestesia: e.target.value }))} className={inputCls}>
          <option value="">Sin cambio</option>
          {ANESTESIAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div><label className={labelCls}>Motivo de aplazamiento</label><input type="text" value={form.motivo_aplazamiento} onChange={e => setForm(f => ({ ...f, motivo_aplazamiento: e.target.value }))} placeholder="Solo si aplica" className={inputCls} /></div>
      <div className="flex gap-3 pt-3 border-t border-line/70">
        <button onClick={onClose} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors">CANCELAR</button>
        <button onClick={handleSubmit} disabled={saving} aria-busy={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : cirugiaId ? 'ACTUALIZAR' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}
