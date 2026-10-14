'use client';

import { useEffect, useState } from 'react';
import { StickyNote, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useInvalidar } from '@/hooks/useFetch';
import { cn } from '@/lib/utils';

/**
 * Nota editable desde el preview de la agenda (cirugía, consulta o estudio).
 * Cirugías → PATCH /api/agenda/[id]; consultas y estudios → PATCH /api/consultas/[id].
 */
export default function NotaEditable({
  id,
  tipo,
  notas,
  puedeEditar = true,
  compacto = false,
  onGuardada,
  className,
}: {
  id: string;
  tipo?: string | null;
  notas?: string | null;
  puedeEditar?: boolean;
  compacto?: boolean;
  onGuardada?: (notas: string | null) => void;
  className?: string;
}) {
  const { toast } = useToast();
  const invalidar = useInvalidar();
  const [guardada, setGuardada] = useState(notas || '');
  const [texto, setTexto] = useState(notas || '');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setGuardada(notas || ''); setTexto(notas || ''); setEditando(false); }, [id, notas]);

  const esCirugia = !tipo || tipo === 'cirugia';

  const guardar = async () => {
    const nuevo = texto.trim();
    if (nuevo === guardada.trim()) { setEditando(false); setTexto(guardada); return; }
    setGuardando(true);
    try {
      await enviarJSON(esCirugia ? `/api/agenda/${id}` : `/api/consultas/${id}`, 'PATCH', { notas: nuevo || null });
      setGuardada(nuevo);
      setTexto(nuevo);
      setEditando(false);
      onGuardada?.(nuevo || null);
      toast('Nota guardada');
      void invalidar('/api/agenda', '/api/consultas', '/api/cirugias');
    } catch (err) {
      toast(mensajeDeError(err, 'No se pudo guardar la nota'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => { setTexto(guardada); setEditando(false); };

  if (!editando) {
    if (!guardada && !puedeEditar) return null;
    return (
      <div className={cn('rounded-lg border border-line/70 bg-surface-2 p-3', className)}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <StickyNote className="h-3 w-3" /> Notas
          </span>
          {puedeEditar && (
            <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
              <Pencil className="h-3 w-3" /> {guardada ? 'Editar' : 'Agregar'}
            </button>
          )}
        </div>
        {guardada
          ? <p className={cn('whitespace-pre-wrap text-sm text-fg-2', compacto && 'line-clamp-4')}>{guardada}</p>
          : <p className="text-sm text-muted">Sin notas</p>}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-primary-300 bg-surface p-3', className)}>
      <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        <StickyNote className="h-3 w-3" /> Notas
      </label>
      <textarea
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={5000}
        disabled={guardando}
        className="input-field w-full text-sm"
        placeholder="Escribe una nota…"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={cancelar} disabled={guardando} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {guardando && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}
