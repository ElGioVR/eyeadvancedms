'use client';

import { Plus, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETAS_TELEFONO, MAX_TELEFONOS, type EtiquetaTelefono, type TelefonoPaciente } from '@/lib/telefonos-paciente';

interface Props {
  value: TelefonoPaciente[];
  onChange: (lista: TelefonoPaciente[]) => void;
  /** Clases de los campos para igualar el formulario donde se usa. */
  inputClassName?: string;
}

/**
 * Hasta 3 teléfonos con etiqueta; la estrella marca el principal (el que usa
 * WhatsApp primero). En celular cada teléfono ocupa su propio renglón.
 */
export default function EditorTelefonos({ value, onChange, inputClassName }: Props) {
  const lista = value.length ? value : [{ numero: '', etiqueta: 'Celular' as EtiquetaTelefono, principal: true }];
  const campo = inputClassName || 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  const actualizar = (i: number, cambio: Partial<TelefonoPaciente>) =>
    onChange(lista.map((t, j) => (j === i ? { ...t, ...cambio } : t)));
  const marcarPrincipal = (i: number) => onChange(lista.map((t, j) => ({ ...t, principal: j === i })));
  const quitar = (i: number) => {
    const resto = lista.filter((_, j) => j !== i);
    if (resto.length && !resto.some((t) => t.principal)) resto[0] = { ...resto[0], principal: true };
    onChange(resto);
  };
  const agregar = () => {
    if (lista.length >= MAX_TELEFONOS) return;
    const usadas = new Set(lista.map((t) => t.etiqueta));
    const etiqueta = ETIQUETAS_TELEFONO.find((e) => !usadas.has(e)) ?? 'Celular';
    onChange([...lista, { numero: '', etiqueta, principal: false }]);
  };

  return (
    <div className="space-y-2">
      {lista.map((t, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => marcarPrincipal(i)}
            title={t.principal ? 'Principal (WhatsApp)' : 'Marcar como principal'}
            aria-label={t.principal ? 'Teléfono principal' : 'Marcar como principal'}
            aria-pressed={t.principal}
            className={cn('shrink-0 rounded-md p-1.5 transition-colors', t.principal ? 'text-amber-500' : 'text-muted hover:text-amber-500')}
          >
            <Star className={cn('h-4 w-4', t.principal && 'fill-current')} />
          </button>
          <input
            type="tel"
            inputMode="tel"
            maxLength={20}
            value={t.numero}
            onChange={(e) => actualizar(i, { numero: e.target.value })}
            placeholder="10 dígitos"
            aria-label={`Teléfono ${i + 1}`}
            className={cn(campo, 'min-w-0 flex-1')}
          />
          <select
            value={t.etiqueta}
            onChange={(e) => actualizar(i, { etiqueta: e.target.value as EtiquetaTelefono })}
            aria-label={`Tipo del teléfono ${i + 1}`}
            className={cn(campo, 'w-auto shrink-0')}
          >
            {ETIQUETAS_TELEFONO.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          {lista.length > 1 && (
            <button type="button" onClick={() => quitar(i)} aria-label={`Quitar teléfono ${i + 1}`} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lista.length < MAX_TELEFONOS ? (
          <button type="button" onClick={agregar} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700">
            <Plus className="h-3.5 w-3.5" /> Agregar teléfono
          </button>
        ) : <span />}
        <span className="text-[11px] text-muted">★ principal para WhatsApp</span>
      </div>
    </div>
  );
}
