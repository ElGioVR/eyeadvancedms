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

// ─── Plantillas configurables (Configuración › Mensajes) ─────────────────────

/** Plantillas guardadas en configuracion_sistema (clave «mensajes_paciente»). Vacío = mensaje por defecto. */
export interface PlantillasMensaje {
  consulta?: string | null;
  cirugia?: string | null;
}

export const CLAVE_CONFIG_MENSAJES = 'mensajes_paciente';

/** Variables disponibles en las plantillas, con su descripción para la pantalla de configuración. */
export const VARIABLES_PLANTILLA: Array<{ clave: string; descripcion: string }> = [
  { clave: 'paciente', descripcion: 'Nombre del paciente' },
  { clave: 'fecha', descripcion: 'Fecha larga (lunes 6 de octubre de 2026)' },
  { clave: 'hora', descripcion: 'Hora (9:30 a. m.)' },
  { clave: 'medico', descripcion: 'Médico de la cita' },
  { clave: 'detalle', descripcion: 'Consulta: tipo · Cirugía: procedimiento' },
  { clave: 'folio', descripcion: 'Folio' },
  { clave: 'clinica', descripcion: 'Nombre de la clínica' },
  { clave: 'direccion', descripcion: 'Dirección de la clínica' },
  { clave: 'telefono', descripcion: 'Teléfono de la clínica' },
];

/** Plantilla equivalente al mensaje por defecto (punto de partida para editar). */
export function plantillaPorDefecto(tipo: 'consulta' | 'cirugia'): string {
  const esCirugia = tipo === 'cirugia';
  return [
    'Hola, {paciente}.',
    `Le compartimos los datos de su ${esCirugia ? 'cirugía' : 'consulta'} en {clinica}:`,
    '',
    '• Fecha: {fecha}',
    '• Hora: {hora}',
    '• Médico: {medico}',
    `• ${esCirugia ? 'Procedimiento' : 'Tipo'}: {detalle}`,
    '• Folio: {folio}',
    '• Dirección: {direccion}',
    '',
    esCirugia
      ? 'Le pedimos llegar con anticipación, acompañado(a), y seguir las indicaciones de ayuno que le dio su médico.'
      : 'Le pedimos llegar 15 minutos antes de su cita.',
    'Si necesita cambiar su cita, comuníquese al {telefono}.',
  ].join('\n');
}

/**
 * Sustituye {variable} en la plantilla. Una línea cuyas variables quedan todas
 * vacías se omite (así «• Folio: {folio}» desaparece si no hay folio). Las
 * variables desconocidas se dejan tal cual. «Hola, {paciente}.» sin nombre → «Hola.».
 */
export function aplicarPlantilla(plantilla: string, c: DatosCita): string {
  const valores: Record<string, string> = {
    paciente: (c.paciente || '').trim(),
    fecha: fechaLarga(c.fecha) || '',
    hora: horaLegible(c.hora) || '',
    medico: (c.doctor || '').trim(),
    detalle: (c.detalle || '').trim(),
    folio: (c.folio || '').trim(),
    clinica: CLINICA_NOMBRE,
    direccion: CLINICA_DIRECCION,
    telefono: CLINICA_TELEFONO,
  };
  const re = /\{(\w+)\}/g;
  const lineas: string[] = [];
  for (const linea of plantilla.replace(/\r\n?/g, '\n').split('\n')) {
    const claves = [...linea.matchAll(re)].map((m) => m[1]).filter((k) => k in valores);
    if (claves.length > 0 && claves.every((k) => !valores[k])) {
      // Caso especial del saludo: «Hola, {paciente}.» → «Hola.»
      if (claves.length === 1 && claves[0] === 'paciente' && /^\s*hola\b/i.test(linea)) lineas.push('Hola.');
      continue;
    }
    lineas.push(linea.replace(re, (todo, k: string) => (k in valores ? valores[k] : todo)));
  }
  // Sin líneas en blanco repetidas ni al inicio/final.
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Igual que mensajeCita, pero con la plantilla configurada si existe. */
export function mensajeCitaConPlantilla(c: DatosCita, plantillas?: PlantillasMensaje | null): MensajeCita {
  const base = mensajeCita(c);
  const plantilla = (c.tipo === 'cirugia' ? plantillas?.cirugia : plantillas?.consulta)?.trim();
  return plantilla ? { asunto: base.asunto, cuerpo: aplicarPlantilla(plantilla, c) } : base;
}

/** Línea que pide la confirmación (bandeja de la agenda). */
export const LINEA_CONFIRMACION = 'Por favor confirme su asistencia respondiendo *SÍ*, o *NO* si necesita cambiar la fecha.';

/** Mensaje de la cita + petición de confirmación (SÍ / NO). */
export function mensajeConfirmacionCita(c: DatosCita, plantillas?: PlantillasMensaje | null): MensajeCita {
  const base = mensajeCitaConPlantilla(c, plantillas);
  return {
    asunto: `Confirme su ${c.tipo === 'cirugia' ? 'cirugía' : 'cita'} · ${CLINICA_NOMBRE}`,
    cuerpo: `${base.cuerpo}\n\n${LINEA_CONFIRMACION}`,
  };
}
