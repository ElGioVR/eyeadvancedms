/**
 * Festivos / celebraciones para el banner dinámico del dashboard.
 *
 * Sistema de tabla estática por fecha (fácil de extender): cada festivo
 * tiene fecha de inicio (mes/día), duración en días y un tema visual
 * (gradiente + acento). `obtenerFestivo` devuelve el festivo activo para
 * una fecha dada, o null si es un día normal.
 *
 * Para agregar una celebración basta añadir una entrada a FESTIVOS.
 */

export interface Festivo {
  id: string;
  nombre: string;
  emoji: string;
  mensaje: string;
  gradient: string; // clases de fondo del banner
  anillo: string; // borde del banner
  texto: string; // color de acento del texto
  decoraciones: string[]; // emojis flotantes decorativos
}

export interface FestivoActivo {
  festivo: Festivo;
  inicioHoy: boolean; // es el primer día de la celebración
  diasFestivoRestantes: number; // días que faltan para que termine (incluye hoy)
}

interface FestivoDef {
  id: string;
  nombre: string;
  emoji: string;
  mensaje: string;
  mes: number; // 1-12
  dia: number; // día de inicio
  duracion: number; // días inclusivos que dura la decoración
  gradient: string;
  anillo: string;
  texto: string;
  decoraciones: string[];
}

const FESTIVOS: FestivoDef[] = [
  {
    id: 'ano-nuevo',
    nombre: 'Año Nuevo',
    emoji: '🎆',
    mensaje: '¡Feliz año! Empecemos con todo.',
    mes: 1,
    dia: 1,
    duracion: 2,
    gradient: 'from-indigo-600 via-blue-600 to-sky-500',
    anillo: 'ring-indigo-400/40',
    texto: 'text-white',
    decoraciones: ['🎆', '🎇', '🥂', '✨'],
  },
  {
    id: 'amor-y-amistad',
    nombre: 'Día del Amor y la Amistad',
    emoji: '💝',
    mensaje: 'Feliz Día del Amor y la Amistad. ¡Gracias por cuidar la visión de nuestros pacientes!',
    mes: 2,
    dia: 14,
    duracion: 2,
    gradient: 'from-rose-600 via-pink-600 to-fuchsia-500',
    anillo: 'ring-rose-400/40',
    texto: 'text-white',
    decoraciones: ['💝', '🌹', '❤️', '💌'],
  },
  {
    id: 'trabajador',
    nombre: 'Día del Trabajo',
    emoji: '🛠️',
    mensaje: 'Feliz Día del Trabajo. Descansa, te lo ganaste.',
    mes: 5,
    dia: 1,
    duracion: 1,
    gradient: 'from-slate-700 via-slate-600 to-gray-500',
    anillo: 'ring-slate-400/40',
    texto: 'text-white',
    decoraciones: ['🛠️', '⚙️', '🔧'],
  },
  {
    id: 'independencia-mx',
    nombre: 'Independencia de México',
    emoji: '🇲🇽',
    mensaje: '¡Viva México! Feliz Independencia.',
    mes: 9,
    dia: 15,
    duracion: 3,
    gradient: 'from-green-700 via-green-600 to-emerald-500',
    anillo: 'ring-green-400/40',
    texto: 'text-white',
    decoraciones: ['🇲🇽', '🎉', '🌶️', '🦅'],
  },
  {
    id: 'halloween',
    nombre: 'Halloween',
    emoji: '🎃',
    mensaje: '¡Feliz Halloween! Cuidando tu visión… sin sustos.',
    mes: 10,
    dia: 31,
    duracion: 2,
    gradient: 'from-purple-900 via-purple-800 to-orange-700',
    anillo: 'ring-orange-400/40',
    texto: 'text-white',
    decoraciones: ['🎃', '👻', '🦇', '🕸️'],
  },
  {
    id: 'dia-de-muertos',
    nombre: 'Día de Muertos',
    emoji: '🌸',
    mensaje: 'Honramos a quienes nos preceden. Feliz Día de Muertos.',
    mes: 11,
    dia: 1,
    duracion: 3,
    gradient: 'from-fuchsia-900 via-purple-800 to-orange-700',
    anillo: 'ring-purple-400/40',
    texto: 'text-white',
    decoraciones: ['🌸', '💀', '🕯️', '🌼'],
  },
  {
    id: 'navidad',
    nombre: 'Navidad',
    emoji: '🎄',
    mensaje: '¡Feliz Navidad! Gracias por un gran año.',
    mes: 12,
    dia: 24,
    duracion: 3,
    gradient: 'from-red-700 via-rose-600 to-emerald-600',
    anillo: 'ring-red-400/40',
    texto: 'text-white',
    decoraciones: ['🎄', '⭐', '🎁', '🔔'],
  },
  {
    id: 'fin-de-anio',
    nombre: 'Fin de Año',
    emoji: '✨',
    mensaje: 'Cerramos el año con visión clara. ¡Nos vemos el próximo!',
    mes: 12,
    dia: 29,
    duracion: 3,
    gradient: 'from-sky-700 via-indigo-600 to-violet-600',
    anillo: 'ring-indigo-400/40',
    texto: 'text-white',
    decoraciones: ['✨', '🎆', '🥂', '🎊'],
  },
];

/** Thanksgiving: 4.º jueves de noviembre (fecha variable). */
function obtenerThanksgiving(fecha: Date): FestivoActivo | null {
  if (fecha.getMonth() !== 10) return null; // noviembre
  const firstThursdayOffset = (4 - new Date(fecha.getFullYear(), 10, 1).getDay() + 7) % 7;
  const fourthThursday = 1 + firstThursdayOffset + 21;
  if (fecha.getDate() >= fourthThursday && fecha.getDate() < fourthThursday + 2) {
    return {
      festivo: {
        id: 'thanksgiving',
        nombre: 'Thanksgiving',
        emoji: '🦃',
        mensaje: 'Feliz Thanksgiving. Gracias por confiar en nosotros.',
        gradient: 'from-amber-700 via-orange-600 to-rose-600',
        anillo: 'ring-amber-400/40',
        texto: 'text-white',
        decoraciones: ['🦃', '🍂', '🥧', '🍁'],
      },
      inicioHoy: fecha.getDate() === fourthThursday,
      diasFestivoRestantes: 1 + (fourthThursday + 1 - fecha.getDate()),
    };
  }
  return null;
}

/** Ejemplo completo (Halloween) para vista previa del banner desde el configurador. */
export const FESTIVO_EJEMPLO: Festivo = {
  id: 'halloween',
  nombre: 'Halloween',
  emoji: '🎃',
  mensaje: '¡Feliz Halloween! Cuidando tu visión… sin sustos.',
  gradient: 'from-purple-900 via-purple-800 to-orange-700',
  anillo: 'ring-orange-400/40',
  texto: 'text-white',
  decoraciones: ['🎃', '👻', '🦇', '🕸️'],
};

export function obtenerFestivo(fecha: Date): FestivoActivo | null {
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();

  const thanksgiving = obtenerThanksgiving(fecha);
  if (thanksgiving) return thanksgiving;

  for (const def of FESTIVOS) {
    if (def.mes !== mes) continue;
    const offsetDia = dia - def.dia;
    if (offsetDia >= 0 && offsetDia < def.duracion) {
      return {
        festivo: {
          id: def.id,
          nombre: def.nombre,
          emoji: def.emoji,
          mensaje: def.mensaje,
          gradient: def.gradient,
          anillo: def.anillo,
          texto: def.texto,
          decoraciones: def.decoraciones,
        },
        inicioHoy: offsetDia === 0,
        diasFestivoRestantes: def.duracion - offsetDia,
      };
    }
  }
  return null;
}

export interface FestivoProximo {
  festivo: Festivo;
  diasRestantes: number;
}

/** Siguiente celebración a partir de una fecha (incluye año siguiente). */
export function obtenerFestivoProximo(fecha: Date): FestivoProximo | null {
  const inicioHoy = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  const candidatos: Array<{ def: FestivoDef; fechaInicio: Date }> = [];
  for (const year of [fecha.getFullYear(), fecha.getFullYear() + 1]) {
    for (const def of FESTIVOS) {
      candidatos.push({ def, fechaInicio: new Date(year, def.mes - 1, def.dia) });
    }
    // Thanksgiving (4.º jueves de noviembre) por año
    const firstThursdayOffset = (4 - new Date(year, 10, 1).getDay() + 7) % 7;
    candidatos.push({
      def: {
        id: 'thanksgiving',
        nombre: 'Thanksgiving',
        emoji: '🦃',
        mensaje: 'Feliz Thanksgiving. Gracias por confiar en nosotros.',
        mes: 11,
        dia: 0,
        duracion: 1,
        gradient: 'from-amber-700 via-orange-600 to-rose-600',
        anillo: 'ring-amber-400/40',
        texto: 'text-white',
        decoraciones: ['🦃', '🍂', '🥧', '🍁'],
      },
      fechaInicio: new Date(year, 10, 1 + firstThursdayOffset + 21),
    });
  }

  let mejor: { festivo: Festivo; diasRestantes: number } | null = null;
  for (const { def, fechaInicio } of candidatos) {
    if (fechaInicio < inicioHoy) continue;
    const diasRestantes = Math.round((fechaInicio.getTime() - inicioHoy.getTime()) / 86400000);
    if (!mejor || diasRestantes < mejor.diasRestantes) {
      mejor = {
        festivo: {
          id: def.id,
          nombre: def.nombre,
          emoji: def.emoji,
          mensaje: def.mensaje,
          gradient: def.gradient,
          anillo: def.anillo,
          texto: def.texto,
          decoraciones: def.decoraciones,
        },
        diasRestantes,
      };
    }
  }
  return mejor;
}
