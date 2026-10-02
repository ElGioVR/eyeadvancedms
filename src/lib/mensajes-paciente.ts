/**
 * Mensajes al paciente desde la vista de una consulta o cirugía (WhatsApp y
 * correo). Funciones puras y deterministas (sin `new Date()` del cliente) para
 * poder usarse en render y probarse en src/lib/__tests__/mensajes-paciente.test.ts.
 *
 * Privacidad: el mensaje solo lleva datos de la cita (fecha, hora, médico,
 * tipo/procedimiento), nunca diagnóstico ni notas clínicas.
 */

export const CLINICA_NOMBRE = process.env.NEXT_PUBLIC_CLINICA_NOMBRE || 'EyeAdvanced';
export const CLINICA_DIRECCION = process.env.NEXT_PUBLIC_CLINICA_DIRECCION || '';
export const CLINICA_TELEFONO = process.env.NEXT_PUBLIC_CLINICA_TELEFONO || '';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Teléfono en formato internacional para wa.me (solo dígitos, sin «+»).
 * - 10 dígitos (México) → 52 + número.
 * - 52 + 10, o 521 + 10 (formato móvil antiguo) → 52 + 10.
 * - 1 + 10 (EE. UU./Canadá) → se respeta.
 * - Otros con 11 a 15 dígitos → se respetan tal cual.
 * Devuelve null si no es un número utilizable.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  const d = (telefono || '').replace(/\D/g, '').replace(/^00/, '');
  if (d.length === 10) return `52${d}`;
  if (d.length === 13 && d.startsWith('521')) return `52${d.slice(3)}`;
  if (d.length === 12 && d.startsWith('52')) return d;
  if (d.length === 11 && d.startsWith('1')) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export function correoValido(email: string | null | undefined): boolean {
  const e = (email || '').trim();
  return e.length > 0 && e.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** 'YYYY-MM-DD' → «lunes 6 de octubre de 2026» (sin zona horaria: es una fecha civil). */
export function fechaLarga(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Día de la semana con la congruencia de Zeller (sin objetos Date: determinista).
  const mz = mo < 3 ? mo + 12 : mo;
  const yz = mo < 3 ? y - 1 : y;
  const k = yz % 100;
  const j = Math.floor(yz / 100);
  const h = (d + Math.floor((13 * (mz + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7; // 0 = sábado
  const dia = (h + 6) % 7; // 0 = domingo
  return `${DIAS[dia]} ${d} de ${MESES[mo - 1]} de ${y}`;
}

/** 'HH:MM[:SS]' → «9:30 a. m.» */
export function horaLegible(hora: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora || '');
  if (!m) return null;
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export interface DatosCita {
  tipo: 'consulta' | 'cirugia';
  paciente: string | null | undefined;
  fecha: string | null | undefined;
  hora: string | null | undefined;
  doctor?: string | null;
  /** Consulta: tipo/especialidad. Cirugía: procedimiento (y ojo). */
  detalle?: string | null;
  folio?: string | null;
}

export interface MensajeCita {
  asunto: string;
  cuerpo: string;
}

/** Texto de confirmación de la cita, igual para WhatsApp y correo. */
export function mensajeCita(c: DatosCita): MensajeCita {
  const esCirugia = c.tipo === 'cirugia';
  const nombre = (c.paciente || '').trim();
  const fecha = fechaLarga(c.fecha);
  const hora = horaLegible(c.hora);
  const que = esCirugia ? 'cirugía' : 'consulta';

  const lineas: string[] = [];
  lineas.push(nombre ? `Hola, ${nombre}.` : 'Hola.');
  lineas.push(`Le compartimos los datos de su ${que} en ${CLINICA_NOMBRE}:`);
  lineas.push('');
  if (fecha) lineas.push(`• Fecha: ${fecha}`);
  if (hora) lineas.push(`• Hora: ${hora}`);
  if (c.doctor) lineas.push(`• Médico: ${c.doctor}`);
  if (c.detalle) lineas.push(`• ${esCirugia ? 'Procedimiento' : 'Tipo'}: ${c.detalle}`);
  if (c.folio) lineas.push(`• Folio: ${c.folio}`);
  if (CLINICA_DIRECCION) lineas.push(`• Dirección: ${CLINICA_DIRECCION}`);
  lineas.push('');
  if (esCirugia) {
    lineas.push('Le pedimos llegar con anticipación, acompañado(a), y seguir las indicaciones de ayuno que le dio su médico.');
  } else {
    lineas.push('Le pedimos llegar 15 minutos antes de su cita.');
  }
  lineas.push(
    CLINICA_TELEFONO
      ? `Si necesita cambiar su cita, comuníquese al ${CLINICA_TELEFONO}.`
      : 'Si necesita cambiar su cita, responda a este mensaje.'
  );

  const asunto = `${esCirugia ? 'Cirugía' : 'Consulta'} programada${fecha ? ` — ${fecha}` : ''} · ${CLINICA_NOMBRE}`;
  return { asunto, cuerpo: lineas.join('\n') };
}

export function urlWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const tel = normalizarTelefono(telefono);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null;
}

export function urlCorreo(email: string | null | undefined, asunto: string, cuerpo: string): string | null {
  if (!correoValido(email)) return null;
  return `mailto:${(email || '').trim()}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
