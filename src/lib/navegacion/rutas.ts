/** Etiquetas y reglas de la «ruta de navegación» (Pacientes › Agenda › Consulta › Nueva). */

export interface EntradaRuta {
  /** Ruta con query (p. ej. `/consultas/nueva?paciente_id=…`). */
  href: string;
  label: string;
}

const UUID = '[0-9a-f-]{8,}';

/** [patrón, etiqueta] en orden de especificidad. */
const ETIQUETAS: [RegExp, string][] = [
  [/^\/dashboard$/, 'Inicio'],
  [/^\/pacientes$/, 'Pacientes'],
  [new RegExp(`^/pacientes/${UUID}/historial$`), 'Historial'],
  [/^\/pacientes\/nuevo$/, 'Nuevo paciente'],
  [/^\/agenda$/, 'Agenda'],
  [new RegExp(`^/agenda/${UUID}$`), 'Detalle de cita'],
  [/^\/consultas$/, 'Consultas'],
  [/^\/consultas\/nueva$/, 'Nueva consulta'],
  [new RegExp(`^/consultas/${UUID}/editar$`), 'Editar consulta'],
  [new RegExp(`^/consultas/${UUID}$`), 'Consulta'],
  [/^\/cirugias$/, 'Cirugías'],
  [/^\/cirugias\/pendientes$/, 'Cirugías pendientes'],
  [/^\/cirugias\/nueva$/, 'Nueva cirugía'],
  [new RegExp(`^/cirugias/${UUID}/editar$`), 'Editar cirugía'],
  [new RegExp(`^/cirugias/${UUID}$`), 'Cirugía'],
  [/^\/configuracion\/conceptos$/, 'Conceptos'],
  [/^\/configuracion/, 'Configuración'],
  [/^\/productividad/, 'Productividad'],
  [/^\/inventario/, 'Inventario'],
  [/^\/mi-perfil$/, 'Mi perfil'],
];

export function rutaSinQuery(href: string): string {
  return href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
}

export function etiquetaRuta(href: string): string {
  const p = rutaSinQuery(href);
  for (const [re, label] of ETIQUETAS) if (re.test(p)) return label;
  return 'Atrás';
}

/** Formularios (alta/edición): solo viven en la ruta como pantalla actual; al salir se descartan. */
export function esFormulario(href: string): boolean {
  const p = rutaSinQuery(href);
  return /\/nueva?$/.test(p) || /\/nuevo$/.test(p) || /\/editar$/.test(p);
}

/** Secciones raíz del menú: entrar desde el menú reinicia la ruta. */
export function esRaizMenu(href: string): boolean {
  return /^\/(dashboard|pacientes|agenda|consultas|cirugias|configuracion|productividad|inventario|mi-perfil)?$/.test(rutaSinQuery(href));
}

const CLAVE = 'ruta-navegacion:v1';
const CLAVE_REINICIO = 'ruta-navegacion:reiniciar';
const MAX = 12;

export function leerRuta(): EntradaRuta[] {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && typeof e.href === 'string' && typeof e.label === 'string') : [];
  } catch {
    return [];
  }
}

export function guardarRuta(ruta: EntradaRuta[]): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(ruta.slice(-MAX)));
  } catch {
    /* sin almacenamiento: la ruta vive solo en memoria */
  }
}

/** El menú lateral llama esto: la próxima pantalla arranca una ruta nueva. */
export function marcarReinicioRuta(): void {
  try {
    sessionStorage.setItem(CLAVE_REINICIO, '1');
  } catch {
    /* noop */
  }
}

export function consumirReinicioRuta(): boolean {
  try {
    const v = sessionStorage.getItem(CLAVE_REINICIO) === '1';
    if (v) sessionStorage.removeItem(CLAVE_REINICIO);
    return v;
  } catch {
    return false;
  }
}

/**
 * Registra la pantalla actual en la ruta:
 *  - reinicio (menú) → ruta nueva con solo esta pantalla;
 *  - misma pantalla (solo cambia el query) → reemplaza la última;
 *  - pantalla ya visitada antes → se vuelve a ella y se descarta lo posterior (regreso);
 *  - si la última era un formulario, se descarta (ya se salió de él);
 *  - si no → se agrega al final.
 */
export function registrarPantalla(ruta: EntradaRuta[], actual: EntradaRuta, reiniciar: boolean): EntradaRuta[] {
  if (reiniciar) return [actual];
  let base = [...ruta];
  const sinQ = rutaSinQuery(actual.href);
  const idx = base.findIndex((e) => rutaSinQuery(e.href) === sinQ);
  if (idx >= 0) return [...base.slice(0, idx), actual];
  if (base.length && esFormulario(base[base.length - 1].href)) base = base.slice(0, -1);
  return [...base, actual];
}
