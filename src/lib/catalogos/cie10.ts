/**
 * Buscador de diagnósticos CIE-10 oftalmológicos (Capítulo VII, H00-H59).
 *
 * Funciones puras (sin React ni red) para que el buscador sea instantáneo en el
 * cliente y se pueda probar con node:test. Los datos viven en
 * `cie10-oftalmologia-datos.ts` y el componente los carga con import dinámico.
 *
 * El diagnóstico se sigue guardando como texto (columna `diagnostico`, máx. 500),
 * solo con el nombre («Catarata senil nuclear»); varios van en líneas separadas.
 * No requiere cambios de esquema.
 */
import { normalizeNombre } from '../text';

export interface DiagnosticoCie10 {
  codigo: string;
  nombre: string;
  grupoCodigo: string;
  grupo: string;
  tipo: 'categoria' | 'subcategoria';
  /** Código con asterisco (*): manifestación de una enfermedad clasificada en otro capítulo. */
  dual: boolean;
}

export interface EntradaIndiceCie10 extends DiagnosticoCie10 {
  codigoN: string;
  nombreN: string;
  palabras: string[];
  grupoPalabras: string[];
  alias: string[];
}

type FilaCie10 = readonly [string, string, number];
type GrupoCie10 = { codigo: string; nombre: string };

/**
 * Términos clínicos de uso diario que no aparecen literalmente en el nombre
 * oficial. Ayudan a llegar al código correcto escribiendo como se habla en consulta.
 */
export const ALIAS_CIE10: Readonly<Record<string, readonly string[]>> = {
  'H00.1': ['chalazion', 'chalacion'],
  'H00.0': ['perrilla'],
  'H02.0': ['entropion', 'triquiasis'],
  'H02.3': ['dermatocalasia', 'exceso de piel parpado'],
  'H02.4': ['ptosis', 'parpado caido'],
  'H04.1': ['ojo seco', 'sindrome de ojo seco', 'xeroftalmia', 'disfuncion lagrimal'],
  'H04.3': ['dacriocistitis aguda'],
  'H04.4': ['dacriocistitis cronica'],
  'H04.5': ['obstruccion lagrimal', 'obstruccion conducto nasolagrimal'],
  'H10.1': ['conjuntivitis alergica'],
  'H11.0': ['pterigion', 'pterigio', 'carnosidad'],
  'H11.1': ['pinguecula'],
  'H11.3': ['hiposfagma', 'derrame ocular'],
  'H16.0': ['ulcera corneal'],
  'H18.6': ['keratocono'],
  'H20.0': ['uveitis anterior aguda'],
  'H20.1': ['uveitis anterior cronica'],
  'H20.9': ['uveitis'],
  'H25.1': ['catarata nuclear', 'esclerosis nuclear'],
  'H25.0': ['catarata cortical'],
  'H25.9': ['catarata relacionada a la edad'],
  'H26.4': ['opacidad capsular', 'opacificacion capsula posterior', 'opc', 'catarata secundaria'],
  'H27.0': ['afaco'],
  'H27.1': ['subluxacion del cristalino'],
  'H33.0': ['desprendimiento de retina regmatogeno', 'dr regmatogeno'],
  'H33.3': ['agujero retiniano', 'desgarro retiniano'],
  'H34.8': ['oclusion de vena central', 'ovcr', 'orvr', 'trombosis venosa retiniana'],
  'H35.3': ['dmae', 'dmre', 'degeneracion macular', 'membrana epirretiniana', 'agujero macular', 'drusas'],
  'H35.8': ['edema macular'],
  'H36.0': ['retinopatia diabetica', 'rd', 'rdnp', 'rdp'],
  'H40.0': ['hipertension ocular', 'pio elevada', 'sospecha glaucoma'],
  'H40.1': ['gpaa', 'glaucoma cronico'],
  'H40.2': ['gpac', 'angulo estrecho', 'glaucoma agudo'],
  'H43.1': ['hemovitreo'],
  'H43.3': ['miodesopsias', 'moscas volantes', 'cuerpos flotantes'],
  'H43.8': ['desprendimiento de vitreo posterior', 'dvp'],
  'H44.0': ['endoftalmitis'],
  'H50.0': ['endotropia', 'esotropia'],
  'H50.1': ['exotropia'],
  'H50.2': ['hipertropia', 'hipotropia'],
  'H52.0': ['hipermetrope'],
  'H52.1': ['miope'],
  'H52.4': ['presbiopia', 'vista cansada'],
  'H53.0': ['ambliopia', 'ojo vago', 'ojo flojo'],
  'H57.1': ['dolor de ojo'],
  'H59.0': ['queratopatia bulosa pseudofaquica', 'edema corneal postquirurgico'],
};

export function construirIndiceCie10(
  filas: ReadonlyArray<FilaCie10>,
  grupos: ReadonlyArray<GrupoCie10>,
): EntradaIndiceCie10[] {
  return filas.map(([codigo, nombre, gi]) => {
    const grupo = grupos[gi] ?? { codigo: '', nombre: '' };
    const nombreN = normalizeNombre(nombre);
    const codigoBase = codigo.replace('*', '');
    const alias = (ALIAS_CIE10[codigo] ?? ALIAS_CIE10[codigoBase] ?? []).map(normalizeNombre);
    return {
      codigo,
      nombre,
      grupoCodigo: grupo.codigo,
      grupo: grupo.nombre,
      tipo: codigo.includes('.') ? 'subcategoria' : 'categoria',
      dual: codigo.includes('*'),
      codigoN: normalizarCodigo(codigo),
      nombreN,
      palabras: separarPalabras(nombreN),
      grupoPalabras: separarPalabras(normalizeNombre(grupo.nombre)),
      alias,
    };
  });
}

/** «H25.1», «h251», «H25,1» → «h251» (sin punto, sin asterisco). */
export function normalizarCodigo(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function separarPalabras(t: string): string[] {
  return t.split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/** Palabras vacías que no deben filtrar resultados («de», «la», «y»...). */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'en', 'a', 'con', 'por', 'sin', 'su', 'sus', 'un', 'una', 'ojo', 'ojos']);

/**
 * ¿La palabra del catálogo coincide con lo escrito?
 * Prefijo («catar» → catarata) y plural simple («cataratas» → catarata).
 */
function coincidePalabra(token: string, palabra: string): boolean {
  if (palabra.startsWith(token)) return true;
  if (token.length >= 5 && palabra.length >= 4 && token.startsWith(palabra)) return token.length - palabra.length <= 2;
  return false;
}

const PATRON_CODIGO = /^h\d{1,2}(?:[.,]?\d?)?\*?$/i;

/**
 * Busca en el índice. Acepta código (H25, H25.1, h251) o texto libre en
 * cualquier orden, sin acentos ni mayúsculas, incluidos términos de uso diario.
 * Devuelve los mejores `limite` resultados ordenados por relevancia.
 */
export function buscarCie10(indice: ReadonlyArray<EntradaIndiceCie10>, consulta: string, limite = 12): DiagnosticoCie10[] {
  const q = normalizeNombre(consulta);
  if (!q) return [];

  const puntuados: { e: EntradaIndiceCie10; p: number; i: number }[] = [];

  if (PATRON_CODIGO.test(q.replace(/\s/g, ''))) {
    const qc = normalizarCodigo(q);
    indice.forEach((e, i) => {
      if (e.codigoN === qc) puntuados.push({ e, p: 1000, i });
      else if (e.codigoN.startsWith(qc)) puntuados.push({ e, p: 500 - (e.codigoN.length - qc.length), i });
    });
  } else {
    const todos = separarPalabras(q);
    const tokens = todos.filter((t) => !VACIAS.has(t));
    const usar = tokens.length ? tokens : todos;
    if (!usar.length) return [];

    indice.forEach((e, i) => {
      let p = 0;
      // Alias clínicos: la frase exacta gana a todo; una coincidencia parcial queda
      // por debajo del nombre oficial para no desplazar resultados genéricos
      // («glaucoma» debe mostrar primero H40 Glaucoma, no un alias).
      for (const a of e.alias) {
        if (a === q) p = Math.max(p, 900);
        else if (a.startsWith(q)) p = Math.max(p, 420);
        else {
          const ap = separarPalabras(a);
          if (usar.every((t) => ap.some((w) => coincidePalabra(t, w)))) p = Math.max(p, 400);
        }
      }

      // Nombre oficial: todas las palabras deben aparecer (en cualquier orden).
      let enNombre = 0;
      let enGrupo = 0;
      for (const t of usar) {
        if (e.palabras.some((w) => coincidePalabra(t, w))) enNombre++;
        else if (e.grupoPalabras.some((w) => coincidePalabra(t, w))) enGrupo++;
        else if (t.length >= 4 && e.nombreN.includes(t)) enNombre++;
      }
      if (enNombre + enGrupo === usar.length && enNombre > 0) {
        let pn = 200 + enNombre * 30 + enGrupo * 5;
        if (e.nombreN === q) pn += 400;
        else if (e.nombreN.startsWith(q)) pn += 200;
        else if (e.palabras[0] && coincidePalabra(usar[0], e.palabras[0])) pn += 80;
        // Preferir lo específico y lo que no es residual («no especificado», «otros»).
        if (e.tipo === 'subcategoria') pn += 10;
        if (/no especificad|sin otra especificacion/.test(e.nombreN)) pn -= 15;
        if (/^otr[oa]s? /.test(e.nombreN)) pn -= 20;
        if (e.dual) pn -= 25;
        pn -= Math.min(e.palabras.length, 15); // nombres cortos = coincidencia más precisa
        p = Math.max(p, pn);
      }
      if (p > 0) puntuados.push({ e, p, i });
    });
  }

  puntuados.sort((a, b) => b.p - a.p || a.i - b.i);
  return puntuados.slice(0, limite).map(({ e }) => ({
    codigo: e.codigo,
    nombre: e.nombre,
    grupoCodigo: e.grupoCodigo,
    grupo: e.grupo,
    tipo: e.tipo,
    dual: e.dual,
  }));
}

/** Texto que se guarda en el campo: solo el nombre («Catarata senil nuclear»). */
export function formatearDiagnostico(d: Pick<DiagnosticoCie10, 'nombre'>): string {
  return d.nombre;
}

/**
 * Parte del texto que se está escribiendo ahora (la línea actual, o lo que sigue
 * a un «;» si el médico lo escribió a mano). Es lo que se busca en el catálogo.
 */
export function segmentoActual(texto: string, cursor = texto.length): { inicio: number; fin: number; consulta: string } {
  const antes = texto.slice(0, cursor);
  const corte = Math.max(antes.lastIndexOf(';'), antes.lastIndexOf('\n'));
  let inicio = corte + 1;
  while (inicio < cursor && texto[inicio] === ' ') inicio++;
  const resto = texto.slice(cursor);
  const sig = resto.search(/[;\n]/);
  const fin = sig === -1 ? texto.length : cursor + sig;
  return { inicio, fin, consulta: texto.slice(inicio, fin).trim() };
}

/**
 * Sustituye el segmento que se está escribiendo por el nombre del diagnóstico
 * elegido (sin código ni separador). Respeta `max` (límite de la columna).
 */
export function insertarDiagnostico(
  texto: string,
  d: Pick<DiagnosticoCie10, 'nombre'>,
  cursor = texto.length,
  max = 500,
): { texto: string; cursor: number } {
  const { inicio, fin } = segmentoActual(texto, cursor);
  const previo = texto.slice(0, inicio);
  const posterior = texto.slice(fin);
  const etiqueta = formatearDiagnostico(d);
  const nuevo = (previo + etiqueta + posterior).slice(0, max);
  return { texto: nuevo, cursor: Math.min(previo.length + etiqueta.length, nuevo.length) };
}

/** Diagnósticos del catálogo ya escritos en el campo (por nombre, sin acentos). */
export function nombresEnTexto(texto: string): Set<string> {
  return new Set(texto.split(/[;\n]/).map((t) => normalizeNombre(t)).filter(Boolean));
}
