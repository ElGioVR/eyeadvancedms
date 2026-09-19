'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';

interface ConsultaData {
  id: string;
  doctor_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  tipo_consulta: string | null;
  tipo_visita: string | null;
  diagnostico: string | null;
  notas: string | null;
  metodo_pago: string | null;
}

const input = 'w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';
const label = 'block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5';

export default function EditarConsultaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ConsultaData>>({});

  const fetchConsulta = useCallback(async () => {
    try {
      const res = await fetch(`/api/consultas?pageSize=999`);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      const found = data.data?.find((c: ConsultaData) => c.id === id);
      if (!found) throw new Error('No encontrada');
      setForm({
        doctor_id: found.doctor_id,
        fecha: found.fecha,
        hora_inicio: found.hora_inicio,
        hora_fin: found.hora_fin,
        tipo_consulta: found.tipo_consulta,
        tipo_visita: found.tipo_visita,
        diagnostico: found.diagnostico,
        notas: found.notas,
        metodo_pago: found.metodo_pago,
      });
    } catch {
      toast('Error al cargar consulta', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchConsulta(); }, [fetchConsulta]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/consultas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Error');
      toast('Consulta actualizada');
      router.push(`/consultas/${id}`);
    } catch {
      toast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <PageHeader
        title="Editar Consulta"
        subtitle={`Consulta ${id.slice(0, 8)}`}
        backLink={{ href: `/consultas/${id}`, label: 'Consulta' }}
        action={
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Cambios
          </button>
        }
      />

      <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6 space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Datos de Consulta</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Fecha</label>
            <input type="date" value={form.fecha || ''} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Hora Inicio</label>
            <input type="time" value={form.hora_inicio || ''} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Hora Fin</label>
            <input type="time" value={form.hora_fin || ''} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Tipo Consulta</label>
            <select value={form.tipo_consulta || ''} onChange={(e) => setForm({ ...form, tipo_consulta: e.target.value })} className={input}>
              <option value="">Seleccionar</option>
              <option value="CONSULTA">Consulta</option>
              <option value="ESTUDIO">Estudio</option>
              <option value="REVISION">Revisión</option>
              <option value="PROCEDIMIENTO">Procedimiento</option>
            </select>
          </div>
          <div>
            <label className={label}>Tipo Visita</label>
            <select value={form.tipo_visita || ''} onChange={(e) => setForm({ ...form, tipo_visita: e.target.value })} className={input}>
              <option value="">Seleccionar</option>
              <option value="PRIMERA_VEZ">Primera Vez</option>
              <option value="SUBSECUENTE">Subsecuente</option>
            </select>
          </div>
          <div>
            <label className={label}>Método de Pago</label>
            <select value={form.metodo_pago || ''} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} className={input}>
              <option value="">Seleccionar</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="SEGURO">Seguro</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Diagnóstico</label>
          <textarea value={form.diagnostico || ''} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} className={input} rows={3} />
        </div>
        <div>
          <label className={label}>Notas</label>
          <textarea value={form.notas || ''} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={input} rows={3} />
        </div>
      </div>
    </div>
  );
}
