'use client';

import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, PackageSearch, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clasificarPieza, coincideConModeloInventario, DISENOS_LIO, fabricanteCanonico, type ModeloLio } from '@/lib/catalogos/modelos-lio';
import SelectorModeloLio, { type NuevoModeloLio } from '@/components/cirugia/SelectorModeloLio';
import type { DisenoLio } from '@/lib/catalogos/modelos-lio';
import type { LIODisponible } from '@/components/cirugia/LIOSelector';

export type OrdenLenteForm = 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
/**
 * Cómo se obtiene el lente. SIN_TRAMITE = no se elige ninguna logística: el lente solo se
 * registra (lo surte el proveedor/hospital, p. ej. Hoya o Zeiss); no reserva inventario ni
 * genera pedido o recordatorio. Requiere sql/patch-agenda-cirugia-comentarios-16oct-supabase.sql.
 */
export type ModoLente = 'ASIGNAR' | 'SOLICITAR' | 'COMPRA_DIRECTA' | 'SIN_TRAMITE';

export interface LenteForm {
  orden: OrdenLenteForm;
  modo: ModoLente;
  torico: boolean;
  /** Check «Marca» (true/false) junto a Tórico; se guarda con el plan del lente. */
  marca: boolean;
  fabricante: string;
  modeloId: string;
  potencia: string;
  cilindro: string;
  /** Pieza de inventario comprometida (solo modo ASIGNAR). */
  itemId: string | null;
}

export interface LenteComprometidoInfo {
  inventario_item_id: string;
  cirugia_id: string;
  orden: string;
  fecha: string | null;
  paciente: string | null;
}

export const ETIQUETA_ORDEN: Record<OrdenLenteForm, string> = { PRIMERO: 'Primer lente', SEGUNDO: 'Segundo lente', RESPALDO: 'Lente de respaldo' };

export const MODOS_LENTE: Array<{ value: ModoLente; label: string; ayuda: string }> = [
  { value: 'ASIGNAR', label: 'Asignar', ayuda: 'Toma una pieza que ya está en el inventario de la clínica y la aparta para esta cirugía (no baja el stock hasta completar la cirugía).' },
  { value: 'SOLICITAR', label: 'Solicitar', ayuda: 'La clínica no lo tiene: entra al Plan de resurtimiento (Inventario) como «por solicitar». Ahí se marca «solicitado» y, al llegar, «recibir» lo da de alta en inventario y lo aparta para esta cirugía. Si no llega, no se puede marcar como usado al completar.' },
  { value: 'COMPRA_DIRECTA', label: 'Compra directa', ayuda: 'Lo paga/compra el paciente o se compra aparte: no entra al plan; se recuerda el día de la cirugía y hay que confirmar «listo» antes de operar.' },
];

/** Sin opción elegida: el lente solo se registra (no se reserva, no se pide, no se recuerda). */
export const AYUDA_SIN_TRAMITE = 'Sin opción elegida: el lente solo queda registrado en la cirugía (útil cuando lo surte el proveedor u hospital, p. ej. Hoya o Zeiss). No aparta inventario ni genera pedido.';
export const ETIQUETA_MODO_LENTE: Record<ModoLente, string> = {
  ASIGNAR: 'Asignado de inventario', SOLICITAR: 'Solicitado', COMPRA_DIRECTA: 'Compra directa', SIN_TRAMITE: 'Solo registro',
};

export const lenteVacio = (orden: OrdenLenteForm): LenteForm => ({
  orden, modo: 'SIN_TRAMITE', torico: false, marca: false, fabricante: '', modeloId: '', potencia: '', cilindro: '', itemId: null,
});

/** ¿El lente tiene algo capturado? (el primero solo cuenta si el usuario lo tocó). */
export function lenteCapturado(l: LenteForm): boolean {
  return !!(l.itemId || l.modeloId || l.fabricante || l.potencia.trim() || l.cilindro.trim());
}

const num = (t: string) => (t.trim() === '' ? NaN : Number(t.replace(',', '.')));

export function validarLente(l: LenteForm, modelos: ModeloLio[]): string | null {
  const nombre = ETIQUETA_ORDEN[l.orden];
  if (l.modo === 'ASIGNAR') {
    if (!l.itemId) return `${nombre}: elige la pieza del inventario o cambia a Solicitar / Compra directa.`;
    return null;
  }
  if (!l.modeloId && !l.fabricante) return `${nombre}: elige fabricante y modelo.`;
  if (!modelos.some((m) => m.id === l.modeloId)) return `${nombre}: elige el modelo de la lista o usa «+ Agregar modelo» si no aparece.`;
  const p = num(l.potencia);
  // Solo registro: la potencia puede no conocerse aún al agendar (se valida si se escribe).
  if (l.modo === 'SIN_TRAMITE' && l.potencia.trim() === '') return null;
  if (!Number.isFinite(p) || p < 0 || p > 40) return `${nombre}: captura la dioptría/potencia (0 a 40).`;
  if (l.torico && (l.modo !== 'SIN_TRAMITE' || l.cilindro.trim() !== '')) {
    const c = num(l.cilindro);
    // 0.00 es un valor válido (la API y la BD lo aceptan); antes se rechazaba con «captura el cilindro».
    if (!Number.isFinite(c)) return `${nombre}: captura el cilindro del lente tórico.`;
    if (c < 0 || c > 12) return `${nombre}: el cilindro del lente tórico debe estar entre 0 y 12 D.`;
  }
  return null;
}

interface Props {
  lente: LenteForm;
  onChange: (patch: Partial<LenteForm>) => void;
  modelos: ModeloLio[];
  cargandoModelos?: boolean;
  lios: LIODisponible[];
  comprometidos: LenteComprometidoInfo[];
  /** Piezas ya elegidas en OTROS lentes de esta misma cirugía (para no sobre-asignar). */
  itemsEnOtrosLentes: string[];
  /** Aviso del padre (ej. cirugía editada): ids comprometidos por esta misma cirugía no cuentan. */
  cirugiaIdActual?: string | null;
  onQuitar?: () => void;
  inputCls: string;
  labelCls: string;
  /** Alta rápida de marca/modelo (ver SelectorModeloLio). */
  onAgregarModelo?: (m: NuevoModeloLio) => Promise<ModeloLio>;
  disenoSugerido?: DisenoLio | null;
}

const compactoFab = (t: string | null | undefined) =>
  fabricanteCanonico(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function mismoFabricante(a: string | null | undefined, b: string): boolean {
  const x = compactoFab(a);
  const y = compactoFab(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : 'sin fecha');

export default function LenteLogistica({
  lente, onChange, modelos, cargandoModelos, lios, comprometidos, itemsEnOtrosLentes, cirugiaIdActual, onQuitar, inputCls, labelCls,
  onAgregarModelo, disenoSugerido,
}: Props) {
  const modeloSel = modelos.find((m) => m.id === lente.modeloId) || null;
  const p = num(lente.potencia);
  const fabSel = lente.fabricante.trim();
  // Se busca con fabricante y/o modelo; la potencia solo afina (no es obligatoria).
  const hayFiltro = !!modeloSel || !!fabSel || Number.isFinite(p);

  const coincidencias = useMemo(() => {
    if (!hayFiltro) return [];
    return lios
      // Reconoce la pieza aunque el inventario use el código del fabricante y el catálogo el nombre oficial.
      .filter((i) => (modeloSel ? coincideConModeloInventario(i, modeloSel) : !fabSel || mismoFabricante(i.marca, fabSel)))
      .filter((i) => !Number.isFinite(p) || (i.potencia_dioptrias != null && Math.abs(i.potencia_dioptrias - p) < 0.005))
      .map((i) => {
        const prop = comprometidos.filter((c) => c.inventario_item_id === i.id && c.cirugia_id !== cirugiaIdActual);
        const enOtros = itemsEnOtrosLentes.filter((x) => x === i.id).length;
        const libres = i.stock - prop.length - enOtros;
        return { item: i, comprometidos: prop, libres };
      });
  }, [lios, modeloSel, fabSel, p, hayFiltro, comprometidos, itemsEnOtrosLentes, cirugiaIdActual]);

  const libres = coincidencias.filter((c) => c.libres > 0);

  // Explorador: todo el inventario de LIO disponible, para elegir la pieza aunque no coincida con el catálogo.
  const [verInventario, setVerInventario] = useState(false);
  const [buscarInv, setBuscarInv] = useState('');
  const inventario = useMemo(() => {
    const q = buscarInv.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return lios
      .map((i) => {
        const prop = comprometidos.filter((c) => c.inventario_item_id === i.id && c.cirugia_id !== cirugiaIdActual);
        const enOtros = itemsEnOtrosLentes.filter((x) => x === i.id).length;
        return { item: i, libres: i.stock - prop.length - enOtros, comprometidos: prop, clase: clasificarPieza(i, modelos) };
      })
      .filter(({ item }) => {
        if (!q) return true;
        const t = `${item.marca} ${item.modelo ?? ''} ${item.producto ?? ''} ${item.lote ?? ''} ${item.potencia_dioptrias ?? ''}`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return q.split(/\s+/).every((w) => t.includes(w));
      })
      // Primero: misma clasificación (tórico) y misma potencia; luego por potencia.
      .sort((a, b) => {
        const pa = (a.clase?.torico ?? false) === lente.torico ? 0 : 1;
        const pb = (b.clase?.torico ?? false) === lente.torico ? 0 : 1;
        const ea = Number.isFinite(p) && a.item.potencia_dioptrias != null && Math.abs(a.item.potencia_dioptrias - p) < 0.005 ? 0 : 1;
        const eb = Number.isFinite(p) && b.item.potencia_dioptrias != null && Math.abs(b.item.potencia_dioptrias - p) < 0.005 ? 0 : 1;
        return ea - eb || pa - pb || (a.item.potencia_dioptrias ?? 99) - (b.item.potencia_dioptrias ?? 99);
      });
  }, [lios, comprometidos, itemsEnOtrosLentes, cirugiaIdActual, modelos, buscarInv, lente.torico, p]);
  const elegirDelInventario = (i: LIODisponible) => {
    onChange({
      itemId: i.id,
      // Completa lo que falte con los datos de la pieza (no pisa lo ya capturado).
      ...(lente.potencia.trim() === '' && i.potencia_dioptrias != null ? { potencia: String(i.potencia_dioptrias) } : {}),
      ...(!lente.modeloId && !lente.fabricante ? { fabricante: fabricanteCanonico(i.marca) } : {}),
    });
    setVerInventario(false);
  };
  const etiquetaClase = (c: ReturnType<typeof clasificarPieza>) =>
    c ? `${DISENOS_LIO.find((d) => d.value === c.diseno)?.label ?? c.diseno}${c.torico ? ' · Tórico' : ''}` : null;
  // Pieza ya asignada (p. ej. al editar): se muestra cuál es y, si la cirugía se guardó sin modelo
  // ni potencia, se completan con los datos de la pieza para que el formulario no quede vacío.
  const piezaElegida = lente.itemId ? lios.find((i) => i.id === lente.itemId) ?? null : null;
  useEffect(() => {
    if (!piezaElegida || lente.modo !== 'ASIGNAR' || lente.modeloId || lente.fabricante.trim() || lente.potencia.trim()) return;
    const modelo = modelos
      .filter((m) => m.activo && m.torico === lente.torico && coincideConModeloInventario(piezaElegida, m))
      .sort((a, b) => b.modelo.length - a.modelo.length)[0];
    onChange({
      fabricante: modelo?.fabricante ?? fabricanteCanonico(piezaElegida.marca),
      ...(modelo ? { modeloId: modelo.id } : {}),
      ...(piezaElegida.potencia_dioptrias != null ? { potencia: String(piezaElegida.potencia_dioptrias) } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piezaElegida?.id, modelos.length]);
  const soloComprometidos = coincidencias.filter((c) => c.libres <= 0 && c.comprometidos.length > 0);
  const modoInfo = MODOS_LENTE.find((m) => m.value === lente.modo) ?? null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-fg">{ETIQUETA_ORDEN[lente.orden]}</p>
        {onQuitar && (
          <button type="button" onClick={onQuitar} className="text-xs font-bold text-red-600 hover:underline">Quitar</button>
        )}
      </div>

      <SelectorModeloLio
        modelos={modelos}
        cargando={cargandoModelos}
        torico={lente.torico}
        onTorico={(v) => onChange({ torico: v, itemId: null, cilindro: v ? lente.cilindro : '' })}
        marca={lente.marca}
        onMarca={(v) => onChange({ marca: v })}
        fabricante={lente.fabricante}
        onFabricante={(v) => onChange({ fabricante: v })}
        modeloId={lente.modeloId}
        onModelo={(id) => onChange({ modeloId: id, itemId: null })}
        onAgregar={onAgregarModelo}
        disenoSugerido={disenoSugerido}
      />

      <div className={cn('grid grid-cols-1 gap-3', lente.torico ? 'sm:grid-cols-2' : 'sm:grid-cols-1 sm:max-w-xs')}>
        <div>
          <label className={labelCls}>Dioptría / potencia (D)</label>
          <input
            type="text"
            inputMode="decimal"
            value={lente.potencia}
            onChange={(e) => onChange({ potencia: e.target.value, itemId: null })}
            placeholder="Ej. 22.5"
            className={inputCls}
            aria-label="Dioptría o potencia del lente"
          />
        </div>
        {lente.torico && (
          <div>
            <label className={labelCls}>Cilindro del lente (D)</label>
            <input
              type="text"
              inputMode="decimal"
              value={lente.cilindro}
              onChange={(e) => onChange({ cilindro: e.target.value })}
              placeholder="Ej. 2.25"
              className={inputCls}
              aria-label="Cilindro del lente tórico"
            />
          </div>
        )}
      </div>

      <div>
        <p className={labelCls}>¿Cómo se obtiene este lente? <span className="font-normal">(opcional)</span></p>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Obtención del lente">
          {MODOS_LENTE.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={lente.modo === m.value}
              // Volver a tocar la opción elegida la quita: el lente queda «solo registro».
              onClick={() => (lente.modo === m.value
                ? onChange({ modo: 'SIN_TRAMITE', itemId: null })
                : onChange({ modo: m.value, itemId: m.value === 'ASIGNAR' ? lente.itemId : null }))}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-bold transition-colors',
                lente.modo === m.value
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                  : 'border-line text-fg-2 hover:bg-surface-2',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{modoInfo ? `${modoInfo.ayuda} (Toca de nuevo para quitar la opción.)` : AYUDA_SIN_TRAMITE}</p>
      </div>

      {lente.modo === 'ASIGNAR' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-fg-2">Piezas del inventario</p>
            <button
              type="button"
              onClick={() => setVerInventario((v) => !v)}
              aria-expanded={verInventario}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-surface-2 dark:text-primary-300"
            >
              <PackageSearch className="h-3.5 w-3.5" /> {verInventario ? 'Ocultar inventario' : 'Ver todo el inventario'}
            </button>
          </div>
          {verInventario && (
            <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-50/40 p-2.5 dark:border-primary-500/30 dark:bg-primary-500/5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={buscarInv}
                  onChange={(e) => setBuscarInv(e.target.value)}
                  placeholder="Buscar por marca, modelo, nombre, lote o dioptría (ej. clareon 24)"
                  className={cn(inputCls, 'pl-8')}
                  aria-label="Buscar en el inventario de lentes"
                />
              </div>
              {inventario.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted">{lios.length === 0 ? 'No hay lentes intraoculares disponibles en el inventario.' : 'Ninguna pieza coincide con la búsqueda.'}</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="Inventario de lentes">
                  {inventario.map(({ item, libres: n, comprometidos: c, clase }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={n <= 0}
                        onClick={() => elegirDelInventario(item)}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                          lente.itemId === item.id ? 'border-primary-500 bg-surface' : 'border-line bg-surface hover:border-primary-300',
                          n <= 0 && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-fg">{fabricanteCanonico(item.marca)} {item.modelo ?? ''}</span>
                          {item.potencia_dioptrias != null && <span className="font-semibold text-fg"> · {item.potencia_dioptrias} D</span>}
                          {item.producto && <span className="block truncate text-xs text-fg-2">{item.producto}</span>}
                          <span className="block text-[11px] text-muted">
                            Lote {item.lote || 'N/A'} · Cad. {item.fecha_caducidad || 'N/A'} ·{' '}
                            {n > 0 ? `${n} pza(s) libre(s)` : `sin piezas libres${c.length ? ` (apartada para ${c.map((x) => x.paciente ?? 'otra cirugía').join(', ')})` : ''}`}
                          </span>
                        </span>
                        {etiquetaClase(clase) && (
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', clase?.torico === lente.torico ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-surface-2 text-fg-2')}>
                            {etiquetaClase(clase)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-1 text-[11px] text-muted">Al elegir una pieza se aparta para esta cirugía al guardar y se descuenta del inventario al completarla.</p>
            </div>
          )}
          {!hayFiltro ? (
            <p className="text-xs text-muted">Elige el fabricante y el modelo para ver las piezas que coinciden, o usa <strong>Ver todo el inventario</strong> para elegirla directamente.</p>
          ) : libres.length > 0 ? (
            <ul className="space-y-1.5">
              {libres.map(({ item, libres: n, comprometidos: c }) => (
                <li key={item.id}>
                  <label className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                    lente.itemId === item.id ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-500/10' : 'border-line hover:bg-surface-2',
                  )}>
                    <input type="radio" className="mt-1" checked={lente.itemId === item.id} onChange={() => onChange({ itemId: item.id })} />
                    <span>
                      <span className="font-medium text-fg">{fabricanteCanonico(item.marca)} {item.modelo ?? ''}</span>
                      {item.potencia_dioptrias != null && <span className="text-fg-2"> · {item.potencia_dioptrias}D</span>}
                      <span className="block text-[11px] text-muted">
                        Lote {item.lote || 'N/A'} · Cad. {item.fecha_caducidad || 'N/A'} · {n} pza(s) libre(s)
                        {c.length > 0 && ` (${c.length} comprometida(s))`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>No encontramos piezas libres que coincidan con el modelo elegido. Usa <strong>Ver todo el inventario</strong> para elegir la pieza directamente, o cambia a <strong>Solicitar</strong> o <strong>Compra directa</strong>.</span>
            </div>
          )}
          {lente.itemId && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Pieza elegida{piezaElegida
                ? `: ${fabricanteCanonico(piezaElegida.marca)} ${piezaElegida.modelo ?? ''}${piezaElegida.potencia_dioptrias != null ? ` · ${piezaElegida.potencia_dioptrias}D` : ''}${piezaElegida.lote ? ` · Lote ${piezaElegida.lote}` : ''}`
                : ''}. Se compromete a esta cirugía al guardar.
            </p>
          )}
        </div>
      )}

      {soloComprometidos.length > 0 && (
        <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          {soloComprometidos.map(({ item, comprometidos: c }) => (
            <p key={item.id} className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Existe en el inventario ({fabricanteCanonico(item.marca)} {item.modelo ?? ''}{item.potencia_dioptrias != null ? ` ${item.potencia_dioptrias}D` : ''}) pero está asignado a{' '}
                {c.map((x) => `la cirugía de ${x.paciente ?? 'paciente'} (${fmtFecha(x.fecha)})`).join(' y ')}.
              </span>
            </p>
          ))}
        </div>
      )}

      {lente.modo !== 'ASIGNAR' && libres.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ya hay {libres.reduce((a, c) => a + c.libres, 0)} pieza(s) libre(s) con estos datos en inventario; considera Asignar.
        </p>
      )}
    </div>
  );
}
