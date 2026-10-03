/**
 * Teléfonos del paciente (hasta 3, con etiqueta y uno principal).
 * Se guardan en pacientes.telefonos (JSONB, mig. 1800000000470) y el principal
 * se copia en pacientes.telefono, que sigue usando el resto del sistema
 * (búsqueda, importación, reportes). Funciones puras: ver
 * src/lib/__tests__/telefonos-paciente.test.ts.
 */
import { normalizarTelefono } from '@/lib/mensajes-paciente';

export const MAX_TELEFONOS = 3;
export const ETIQUETAS_TELEFONO = ['Celular', 'Casa', 'Trabajo', 'Familiar'] as const;
export type EtiquetaTelefono = (typeof ETIQUETAS_TELEFONO)[number];

export interface TelefonoPaciente {
  numero: string;
  etiqueta: EtiquetaTelefono;
  principal: boolean;
}

const soloDigitos = (t: string) => t.replace(/\D/g, '');

/**
 * Limpia la lista: quita vacíos y repetidos, máx. 3, etiqueta válida y
 * exactamente un principal (el primero si ninguno lo es). Si la lista viene
 * vacía y hay un teléfono suelto (registros anteriores), se usa ese.
 */
export function normalizarTelefonos(
  lista: Array<Partial<TelefonoPaciente>> | null | undefined,
  telefonoLegado?: string | null,
): TelefonoPaciente[] {
  const vistos = new Set<string>();
  const out: TelefonoPaciente[] = [];
  const fuente = Array.isArray(lista) && lista.length ? lista : telefonoLegado ? [{ numero: telefonoLegado, etiqueta: 'Celular' as const, principal: true }] : [];
  for (const t of fuente) {
    const numero = (t?.numero || '').trim();
    const d = soloDigitos(numero);
    if (!d || vistos.has(d)) continue;
    vistos.add(d);
    const etiqueta = (ETIQUETAS_TELEFONO as readonly string[]).includes(t?.etiqueta || '') ? (t!.etiqueta as EtiquetaTelefono) : 'Celular';
    out.push({ numero, etiqueta, principal: !!t?.principal });
    if (out.length === MAX_TELEFONOS) break;
  }
  const iPrincipal = Math.max(0, out.findIndex((t) => t.principal));
  return out.map((t, i) => ({ ...t, principal: i === iPrincipal }));
}

/** Número principal (el que se guarda en pacientes.telefono). */
export function telefonoPrincipal(lista: TelefonoPaciente[]): string | null {
  return lista.find((t) => t.principal)?.numero ?? lista[0]?.numero ?? null;
}

/** Texto para búsqueda: dígitos de todos los números separados por espacio. */
export function telefonosBusqueda(lista: TelefonoPaciente[]): string {
  return lista.map((t) => soloDigitos(t.numero)).join(' ');
}

/**
 * Números a los que se puede enviar WhatsApp, el principal primero.
 * Se descartan los que no forman un número válido para wa.me.
 */
export function telefonosWhatsApp(
  lista: TelefonoPaciente[] | null | undefined,
  telefonoLegado?: string | null,
): TelefonoPaciente[] {
  const todos = normalizarTelefonos(lista, telefonoLegado);
  return [...todos.filter((t) => t.principal), ...todos.filter((t) => !t.principal)]
    .filter((t) => normalizarTelefono(t.numero) !== null);
}
