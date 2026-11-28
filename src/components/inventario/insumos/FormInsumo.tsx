'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import { CATEGORIAS_INSUMO, ETIQUETA_CATEGORIA, ETIQUETA_POLITICA, POLITICAS_SALIDA, type CategoriaInsumo, type Insumo, type PoliticaSalida, type UbicacionInsumo } from '@/lib/insumos';

const etiqueta = 'mb-1 block text-xs font-semibold text-fg-2';

/** Alta (con existencia inicial opcional) o edición de un insumo. */
export default function FormInsumo({ insumo, ubicaciones, onClose, onGuardado }: {
  insumo: Insumo | null;
  ubicaciones: UbicacionInsumo[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const activas = ubicaciones.filter((u) => u.activa);
  const [f, setF] = useState({
    nombre: insumo?.nombre ?? '',
    categoria: (insumo?.categoria ?? 'CASSETTE') as CategoriaInsumo,
    presentacion: insumo?.presentacion ?? '',
    codigo: insumo?.codigo ?? '',
    fabricante: insumo?.fabricante ?? '',
    stock_minimo: String(insumo?.stock_minimo ?? 0),
    notas: insumo?.notas ?? '',
    politica_salida: (insumo?.politica_salida ?? 'FEFO') as PoliticaSalida,
  });
  const [ent, setEnt] = useState({ cantidad: '', ubicacion_id: activas[0]?.id ?? '', lote: '', fecha_caducidad: '' });
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const minimo = Number(f.stock_minimo || 0);
    if (!Number.isInteger(minimo) || minimo < 0) return toast('El stock mínimo debe ser un número entero', 'error');
    const cant = ent.cantidad ? Number(ent.cantidad) : 0;
    if (!insumo && ent.cantidad && (!Number.isInteger(cant) || cant <= 0)) return toast('La cantidad inicial debe ser un número entero mayor a cero', 'error');
    if (!insumo && cant > 0 && !ent.ubicacion_id) return toast('Elige dónde está la existencia inicial', 'error');
    setGuardando(true);
    const datos = { ...f, stock_minimo: minimo };
    try {
      if (insumo) {
        await enviarJSON('/api/inventario/insumos', 'PATCH', { id: insumo.id, ...datos });
        toast('Insumo actualizado');
      } else {
        const r = await enviarJSON<{ id: string; aviso?: string }>('/api/inventario/insumos', 'POST', {
          ...datos,
          entrada: cant > 0 ? { cantidad: cant, ubicacion_id: ent.ubicacion_id, lote: ent.lote, fecha_caducidad: ent.fecha_caducidad || null } : null,
        });
        toast(r?.aviso ?? 'Insumo agregado', r?.aviso ? 'warning' : 'success');
      }
      onGuardado();
      onClose();
    } catch (err) {
      toast(mensajeDeError(err, 'No se pudo guardar'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={guardar} className="space-y-4">
        <h3 className="text-lg font-bold text-fg">{insumo ? 'Editar insumo' : 'Nuevo insumo'}</h3>
        <div>
          <label htmlFor="in-nombre" className={etiqueta}>Nombre *</label>
          <input id="in-nombre" required maxLength={200} className="input-field" placeholder="Cassette catarata combinada" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="in-cat" className={etiqueta}>Categoría</label>
            <select id="in-cat" className="input-field" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaInsumo })}>
              {CATEGORIAS_INSUMO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="in-min" className={etiqueta}>Stock mínimo (piezas)</label>
            <input id="in-min" type="number" inputMode="numeric" min={0} step={1} className="input-field" value={f.stock_minimo} onChange={(e) => setF({ ...f, stock_minimo: e.target.value })} />
          </div>
          <div>
            <label htmlFor="in-pres" className={etiqueta}>Presentación</label>
            <input id="in-pres" maxLength={60} className="input-field" placeholder="Pieza, caja c/10…" value={f.presentacion} onChange={(e) => setF({ ...f, presentacion: e.target.value })} />
          </div>
          <div>
            <label htmlFor="in-fab" className={etiqueta}>Fabricante / marca</label>
            <input id="in-fab" maxLength={120} className="input-field" value={f.fabricante} onChange={(e) => setF({ ...f, fabricante: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="in-pol" className={etiqueta}>Salidas automáticas</label>
          <select id="in-pol" className="input-field" value={f.politica_salida} onChange={(e) => setF({ ...f, politica_salida: e.target.value as PoliticaSalida })}>
            {POLITICAS_SALIDA.map((p) => <option key={p} value={p}>{p} · {ETIQUETA_POLITICA[p].corta}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-muted">{ETIQUETA_POLITICA[f.politica_salida].larga} Los vencidos nunca salen: van por merma.</p>
        </div>
        <div>
          <label htmlFor="in-cod" className={etiqueta}>Código / SKU</label>
          <input id="in-cod" maxLength={100} className="input-field" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        </div>

        {!insumo && (
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Existencia inicial (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="in-cant" className={etiqueta}>Piezas</label>
                <input id="in-cant" type="number" inputMode="numeric" min={1} step={1} className="input-field" value={ent.cantidad} onChange={(e) => setEnt({ ...ent, cantidad: e.target.value })} />
              </div>
              <div>
                <label htmlFor="in-ubic" className={etiqueta}>Ubicación</label>
                <select id="in-ubic" className="input-field" value={ent.ubicacion_id} onChange={(e) => setEnt({ ...ent, ubicacion_id: e.target.value })}>
                  {activas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="in-lote" className={etiqueta}>Lote</label>
                <input id="in-lote" maxLength={80} className="input-field" placeholder="Automático" value={ent.lote} onChange={(e) => setEnt({ ...ent, lote: e.target.value })} />
              </div>
              <div>
                <label htmlFor="in-cad" className={etiqueta}>Caducidad</label>
                <input id="in-cad" type="date" className="input-field" value={ent.fecha_caducidad} onChange={(e) => setEnt({ ...ent, fecha_caducidad: e.target.value })} />
              </div>
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="in-notas" className={etiqueta}>Notas</label>
          <textarea id="in-notas" rows={2} maxLength={1000} className="input-field" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
