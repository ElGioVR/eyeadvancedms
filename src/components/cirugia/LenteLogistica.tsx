'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { coincideConModelo, fabricanteCanonico, type ModeloLio } from '@/lib/catalogos/modelos-lio';
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
    if (!Number.isFinite(c) || c <= 0 || c > 12) return `${nombre}: captura el cilindro del lente tórico.`;
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
      .filter((i) => (modeloSel ? coincideConModelo(i, modeloSel) : !fabSel || mismoFabricante(i.marca, fabSel)))
      .filter((i) => !Number.isFinite(p) || (i.potencia_dioptrias != null && Math.abs(i.potencia_dioptrias - p) < 0.005))
      .map((i) => {
        const prop = comprometidos.filter((c) => c.inventario_item_id === i.id && c.cirugia_id !== cirugiaIdActual);
        const enOtros = itemsEnOtrosLentes.filter((x) => x === i.id).length;
        const libres = i.stock - prop.length - enOtros;
        return { item: i, comprometidos: prop, libres };
      });
  }, [lios, modeloSel, fabSel, p, hayFiltro, comprometidos, itemsEnOtrosLentes, cirugiaIdActual]);

  const libres = coincidencias.filter((c) => c.libres > 0);
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
          {!hayFiltro ? (
            <p className="text-xs text-muted">Elige el fabricante y el modelo para buscar piezas en el inventario; la potencia es opcional y afina la búsqueda.</p>
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
              <span>No hay piezas libres con estos datos. Cambia a <strong>Solicitar</strong> o <strong>Compra directa</strong>, o quita la opción para solo registrar el lente.</span>
            </div>
          )}
          {lente.itemId && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Pieza elegida: se compromete a esta cirugía al guardar.
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
