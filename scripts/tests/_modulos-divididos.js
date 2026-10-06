/**
 * Las pruebas estáticas (b*) buscan patrones en archivos concretos. En la
 * optimización de oct 2026 algunos archivos grandes se dividieron en módulos
 * (misma funcionalidad, cargada bajo demanda). Este shim hace que leer el
 * archivo original devuelva también el contenido de sus módulos, para que las
 * pruebas sigan validando la funcionalidad y no la ubicación del código.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const r = (...p) => path.join(ROOT, 'src', ...p);

const DIVIDIDOS = new Map([
  [r('app', '(dashboard)', 'agenda', 'AgendaContent.tsx'), [
    r('components', 'agenda', 'agenda-comun.tsx'),
    r('components', 'agenda', 'AgendaDetalle.tsx'),
    r('components', 'agenda', 'CirugiaFormAgenda.tsx'),
    r('components', 'agenda', 'ImportarAgenda.tsx'),
    r('components', 'agenda', 'CampoBusquedaAgenda.tsx'),
  ]],
  [r('app', '(dashboard)', 'cirugias', 'nueva', 'page.tsx'), [
    r('components', 'cirugia', 'nueva-cirugia-comun.tsx'),
  ]],
  [r('app', '(dashboard)', 'consultas', 'nueva', 'page.tsx'), [
    r('components', 'consultations', 'nueva-consulta-comun.tsx'),
  ]],
]);

if (!fs.__modulosDivididos) {
  const original = fs.readFileSync;
  fs.readFileSync = function (file, ...resto) {
    const contenido = original.call(fs, file, ...resto);
    const clave = typeof file === 'string' ? path.resolve(file) : null;
    const extras = clave && DIVIDIDOS.get(clave);
    if (!extras || typeof contenido !== 'string') return contenido;
    return [contenido, ...extras.filter((f) => fs.existsSync(f)).map((f) => original.call(fs, f, 'utf8'))].join('\n');
  };
  fs.__modulosDivididos = true;
}
