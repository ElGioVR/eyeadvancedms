'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ETIQUETA_POLITICA, ordenSalida, type Insumo, type UbicacionInsumo } from '@/lib/insumos';
import { textoLote } from './comun';

export type AccionInsumo = 'entrada' | 'salida' | 'traslado' | 'ajuste' | 'merma';

const TITULO: Record<AccionInsumo, string> = {
  entrada: 'Entrada', salida: 'Salida', traslado: 'Traslado', ajuste: 'Ajuste por conteo', merma: 'Merma / caducado',
};
const LISTO: Record<AccionInsumo, string> = {
  entrada: 'Entrada registrada', salida: 'Salida registrada', traslado: 'Traslado registrado', ajuste: 'Ajuste registrado', merma: 'Merma registrada',
};
const AYUDA: Record<AccionInsumo, string> = {
  entrada: 'Piezas que llegan (compra, donación, devolución).',
  salida: 'Piezas que se usan (cirugía, consulta).',
  traslado: 'Mover piezas de una ubicación a otra.',
  ajuste: 'Escribe cuántas piezas hay realmente en el lote.',
  merma: 'Piezas que se tiran por caducidad o daño.',
};
const etiqueta = 'mb-1 block text-xs font-semibold text-fg-2';

export default function MovimientoInsumo({ insumo, accionInicial, ubicaciones, onClose, onGuardado }: {
  insumo: Insumo;
  accionInicial: AccionInsumo;
  ubicaciones: UbicacionInsumo[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const activas = ubicaciones.filter((u) => u.activa);
  const nombreUbic = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? '—';
  const conLotes = insumo.lotes.length > 0;
  const [accion, setAccion] = useState<AccionInsumo>(conLotes ? accionInicial : 'entrada');
  const [loteId, setLoteId] = useState(insumo.lotes[0]?.id ?? '');
  const [cantidad, setCantidad] = useState('');
  const [ubicacion, setUbicacion] = useState(activas[0]?.id ?? '');
  const [destino, setDestino] = useState('');
  const [lote, setLote] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Salida: automática según la política del insumo (por defecto) o eligiendo el lote a mano.
  const [auto, setAuto] = useState(true);
  const [ubicAuto, setUbicAuto] = useState('');
  const hoy = new Date().toLocaleDateString('en-CA');
  const candidatos = ordenSalida(insumo.lotes, insumo.politica_salida, hoy, ubicAuto || null);
  const vigentes = candidatos.reduce((s, l) => s + l.cantidad, 0);
  const plan = (() => {
    let resta = Number(cantidad) || 0;
    const out: Array<{ id: string; texto: string; toma: number }> = [];
    for (const l of candidatos) {
      if (resta <= 0) break;
      const toma = Math.min(resta, l.cantidad);
      out.push({ id: l.id, texto: textoLote(l, nombreUbic), toma });
      resta -= toma;
    }
    return out;
  })();
  const esAuto = accion === 'salida' && auto;

  const loteSel = insumo.lotes.find((l) => l.id === loteId);
  const destinos = activas.filter((u) => u.id !== loteSel?.ubicacion_id);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(cantidad);
    if (cantidad === '' || !Number.isInteger(n) || n < (accion === 'ajuste' ? 0 : 1)) return toast('Escribe una cantidad válida (número entero)', 'error');
    if (esAuto && n > vigentes) return toast(`Solo hay ${vigentes} pieza(s) vigentes${ubicAuto ? ' en esa ubicación' : ''}`, 'error');
    if (accion !== 'entrada' && !esAuto && !loteSel) return toast('Elige el lote', 'error');
    if (!esAuto && (accion === 'salida' || accion === 'merma' || accion === 'traslado') && loteSel && n > loteSel.cantidad) {
      return toast(`Ese lote solo tiene ${loteSel.cantidad} pieza(s)`, 'error');
    }
    const cuerpo =
      esAuto ? { accion: 'salida_auto', insumo_id: insumo.id, cantidad: n, ubicacion_id: ubicAuto || null, motivo }
      : accion === 'entrada' ? { accion, insumo_id: insumo.id, ubicacion_id: ubicacion, lote, fecha_caducidad: caducidad || null, cantidad: n, motivo }
      : accion === 'ajuste' ? { accion, lote_id: loteId, cantidad_real: n, motivo }
      : accion === 'traslado' ? { accion, lote_id: loteId, destino_id: destino || destinos[0]?.id, cantidad: n, motivo }
      : { accion, lote_id: loteId, cantidad: n, motivo };
    if (accion === 'traslado' && !(cuerpo as { destino_id?: string }).destino_id) return toast('Agrega otra ubicación para poder trasladar', 'error');
    setGuardando(true);
    try {
      await enviarJSON('/api/inventario/insumos/movimientos', 'POST', cuerpo);
      toast(`${LISTO[accion]}${esAuto && plan.length > 1 ? ` (${plan.length} lotes)` : ''}`);
      onGuardado();
      onClose();
    } catch (err) {
      toast(mensajeDeError(err, 'No se pudo registrar'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-fg">{insumo.nombre}</h3>
          <p className="text-xs text-muted">{AYUDA[accion]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de movimiento">
          {(Object.keys(TITULO) as AccionInsumo[]).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={accion === a} disabled={a !== 'entrada' && !conLotes}
              onClick={() => {
                setAccion(a);
                const venc = loteSel?.fecha_caducidad && loteSel.fecha_caducidad < hoy;
                setCantidad(loteSel && (a === 'ajuste' || (a === 'merma' && venc)) ? String(loteSel.cantidad) : '');
              }}
              className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40',
                accion === a ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200' : 'border-line text-fg-2 hover:bg-surface-2')}>
              {TITULO[a]}
            </button>
          ))}
        </div>

        {accion === 'entrada' ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="mv-ubic" className={etiqueta}>Ubicación</label>
              <select id="mv-ubic" className="input-field" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
                {activas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mv-lote" className={etiqueta}>Lote</label>
              <input id="mv-lote" maxLength={80} className="input-field" placeholder="Automático" value={lote} onChange={(e) => setLote(e.target.value)} />
            </div>
            <div>
              <label htmlFor="mv-cad" className={etiqueta}>Caducidad</label>
              <input id="mv-cad" type="date" className="input-field" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
            </div>
            <p className="col-span-2 -mt-1 text-[11px] text-muted">Sin lote se genera uno interno. Si el lote y la caducidad ya existen en esa ubicación, se suman al mismo renglón.</p>
          </div>
        ) : esAuto ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">Automática · {insumo.politica_salida} ({ETIQUETA_POLITICA[insumo.politica_salida].corta.toLowerCase()})</span>
              <button type="button" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-300" onClick={() => setAuto(false)}>Elegir lote</button>
            </div>
            <div>
              <label htmlFor="mv-ubic-auto" className={etiqueta}>De</label>
              <select id="mv-ubic-auto" className="input-field" value={ubicAuto} onChange={(e) => setUbicAuto(e.target.value)}>
                <option value="">Cualquier ubicación</option>
                {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="mv-lote-sel" className="block text-xs font-semibold text-fg-2">Lote</label>
              {accion === 'salida' && <button type="button" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-300" onClick={() => setAuto(true)}>Automática</button>}
            </div>
            <select id="mv-lote-sel" className="input-field" value={loteId} onChange={(e) => { setLoteId(e.target.value); if (accion === 'ajuste') setCantidad(String(insumo.lotes.find((l) => l.id === e.target.value)?.cantidad ?? '')); }}>
              {insumo.lotes.map((l) => <option key={l.id} value={l.id}>{textoLote(l, nombreUbic)}</option>)}
            </select>
          </div>
        )}

        {accion === 'traslado' && (
          <div>
            <label htmlFor="mv-dest" className={etiqueta}>Llevar a</label>
            <select id="mv-dest" className="input-field" value={destino || destinos[0]?.id || ''} onChange={(e) => setDestino(e.target.value)}>
              {destinos.length === 0 && <option value="">No hay otra ubicación activa</option>}
              {destinos.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mv-cant" className={etiqueta}>{accion === 'ajuste' ? 'Piezas reales' : 'Piezas'}</label>
            <input id="mv-cant" type="number" inputMode="numeric" min={accion === 'ajuste' ? 0 : 1} max={accion === 'entrada' || accion === 'ajuste' || esAuto ? undefined : loteSel?.cantidad} step={1} required className="input-field" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mv-motivo" className={etiqueta}>Motivo</label>
            <input id="mv-motivo" maxLength={500} className="input-field" placeholder={accion === 'salida' ? 'Cirugía, paciente…' : ''} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>

        {esAuto && plan.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Se descontará de</p>
            <ul className="space-y-1 rounded-xl bg-surface-2/60 p-2 text-xs">
              {plan.map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="truncate text-fg-2">{p.texto}</span><span className="shrink-0 font-bold text-fg">−{p.toma}</span></li>)}
            </ul>
          </div>
        )}
        {esAuto && Number(cantidad) > vigentes && <p className="text-xs font-semibold text-red-600 dark:text-red-400">Solo hay {vigentes} pieza(s) vigentes{ubicAuto ? ' en esa ubicación' : ''}.</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar</button>
        </div>
      </form>
    </Modal>
  );
}
