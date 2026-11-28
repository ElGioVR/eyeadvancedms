'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { UbicacionInsumo } from '@/lib/insumos';

/** Alta, renombre y activar/desactivar ubicaciones (no se borran porque el kardex las referencia). */
export default function UbicacionesInsumo({ ubicaciones, onClose, onCambio }: { ubicaciones: UbicacionInsumo[]; onClose: () => void; onCambio: () => void }) {
  const { toast } = useToast();
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const ejecutar = async (clave: string, fn: () => Promise<unknown>) => {
    setOcupado(clave);
    try { await fn(); onCambio(); } catch (err) { toast(mensajeDeError(err, 'No se pudo guardar'), 'error'); } finally { setOcupado(null); }
  };
  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = nueva.trim();
    if (nombre.length < 2) return;
    void ejecutar('nueva', async () => { await enviarJSON('/api/inventario/insumos/ubicaciones', 'POST', { nombre }); setNueva(''); });
  };
  const renombrar = (u: UbicacionInsumo, nombre: string) => {
    if (nombre.trim().length < 2 || nombre.trim() === u.nombre) return;
    void ejecutar(u.id, () => enviarJSON('/api/inventario/insumos/ubicaciones', 'PATCH', { id: u.id, nombre: nombre.trim() }));
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md">
      <h3 className="text-lg font-bold text-fg">Ubicaciones</h3>
      <p className="mb-3 text-xs text-muted">Dónde se guardan los insumos. Una ubicación desactivada ya no aparece para nuevas entradas.</p>
      <ul className="space-y-2">
        {ubicaciones.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <input aria-label="Nombre de la ubicación" defaultValue={u.nombre} maxLength={80} onBlur={(e) => renombrar(u, e.target.value)}
              className={cn('input-field flex-1', !u.activa && 'opacity-60')} />
            <button type="button" disabled={ocupado === u.id}
              onClick={() => void ejecutar(u.id, () => enviarJSON('/api/inventario/insumos/ubicaciones', 'PATCH', { id: u.id, activa: !u.activa }))}
              className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-semibold', u.activa ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-surface-2 text-muted')}>
              {ocupado === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.activa ? 'Activa' : 'Inactiva'}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={agregar} className="mt-4 flex gap-2">
        <input aria-label="Nueva ubicación" placeholder="Nueva ubicación" maxLength={80} className="input-field flex-1" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={nueva.trim().length < 2 || ocupado === 'nueva'}>
          {ocupado === 'nueva' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </button>
      </form>
    </Modal>
  );
}
