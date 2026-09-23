#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pruebas de bajo nivel para el bloque B9 (UI formulario de creación de
 * cirugía homologada: página cliente `/cirugias/nueva` con 6 secciones,
 * integración con la API de creación y catálogo de roles/recursos,
 * endpoints de soporte para paciente/resumen y AgendaContent con el
 * enlace "Formulario homologado") de Fase 1 (Creación de cirugía
 * homologada) de EyeAdvancedMS.
 *
 * IDs cubiertos: FLU-001, OBJ-003, PAC-001, PAC-002, PAC-003, PAC-004,
 * CAT-001, CAT-002, OJO-001, MED-001, EXP-001, ARC-001, VAL-007
 * (ver `docs/cirugias/fase-1-creacion-cirugia.md`).
 *
 * No instala ni ejecuta frameworks pesados: usa Node.js puro con
 * aserciones textuales sobre los archivos fuente. NO conecta a
 * Supabase/PostgreSQL ni ejecuta migraciones; sólo lee el contenido del
 * repo y verifica que estén los elementos obligatorios del bloque B9:
 *
 *   - Página cliente `src/app/(dashboard)/cirugias/nueva/page.tsx`:
 *       * `'use client'`
 *       * exporta componente por defecto
 *       * expone 6 secciones en el orden FLU-001:
 *           1) Paciente
 *           2) Expediente
 *           3) Datos de la cirugía / Procedimiento
 *           4) Asignación médica / Participantes
 *           5) LIO / Lente intraocular
 *           6) Archivos de apoyo
 *       * usa `SearchInput` o `fetch('/api/search?q=...')` para búsqueda
 *       * muestra expediente (`Ver expediente`) y datos de última
 *         consulta / historial
 *       * usa `/api/catalogo-servicios?paciente_id=` para procedimientos
 *       * ojo con select/options OD/OI/OU (OJO-001)
 *       * participantes: select de médicos, select de roles, botón
 *         "Agregar participante" (MED-001)
 *       * renderiza `<LIOSelector` (ARC-001, LIO)
 *       * sección de archivos con drag&drop y formatos PDF, JPG, JPEG,
 *         PNG, WEBP (VAL-007)
 *       * NO incluye campo de `monto` en el formulario
 *       * POST a `/api/cirugias` con los campos requeridos (paciente_id,
 *         origen_id, servicio_id, fecha, hora, duracion_min, ojo,
 *         participantes) y luego sube archivos a
 *         `/api/cirugias/[id]/archivos`
 *
 *   - `src/app/(dashboard)/agenda/AgendaContent.tsx`:
 *       * contiene enlace/botón a `/cirugias/nueva` con texto
 *         "Formulario homologado"
 *
 *   - Endpoints nuevos:
 *       * `src/app/api/cirugias/roles/route.ts`: GET, consulta
 *         `cat_roles_participante`, filtra `activo=true`, ordena por
 *         `orden`
 *       * `src/app/api/cirugias/recursos/route.ts`: GET, consulta
 *         `cat_recursos`, filtra `tipo='QUIROFANO'` y `activo=true`
 *       * `src/app/api/pacientes/[id]/resumen/route.ts`: GET, requiere
 *         auth, devuelve paciente, aseguranza, ultima_consulta,
 *         consultas_previas, cirugias_previas, expediente_id
 *
 *   - `package.json`: añade `"test:b9": "node scripts/tests/b9-ui-formulario.test.js"`
 *     y deja intactos test:b1..b8.
 *
 * Salida:
 *   - exit 0 -> todas las verificaciones pasaron
 *   - exit 1 -> al menos una verificación falló (se imprime el detalle)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PAGE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'cirugias',
  'nueva',
  'page.tsx'
);
const AGENDA_CONTENT_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  '(dashboard)',
  'agenda',
  'AgendaContent.tsx'
);
const ROLES_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'roles',
  'route.ts'
);
const RECURSOS_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'cirugias',
  'recursos',
  'route.ts'
);
const RESUMEN_ROUTE_FILE = path.join(
  REPO_ROOT,
  'src',
  'app',
  'api',
  'pacientes',
  '[id]',
  'resumen',
  'route.ts'
);
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');

// ---------------------------------------------------------------------------
// Mini-framework de aserciones (mismo estilo que b1..b8)
// ---------------------------------------------------------------------------

let failures = 0;
let passes = 0;
const failuresDetail = [];

function ok(label) {
  passes += 1;
  console.log('  \u2713 ' + label);
}

function fail(label, detail) {
  failures += 1;
  const message = detail ? label + ' -> ' + detail : label;
  failuresDetail.push(message);
  console.log('  \u2717 ' + message);
}

function assertContainsAll(content, needles, groupLabel) {
  const missing = needles.filter(function (needle) {
    return !content.includes(needle);
  });
  if (missing.length === 0) {
    ok(groupLabel + ' (' + needles.length + ' elementos)');
    return true;
  }
  fail(
    groupLabel,
    'faltan: ' + missing.map(function (m) {
      return JSON.stringify(m);
    }).join(', ')
  );
  return false;
}

function assertNotContains(content, needle, groupLabel) {
  if (!content.includes(needle)) {
    ok(groupLabel);
    return true;
  }
  fail(groupLabel, 'presencia prohibida de: ' + JSON.stringify(needle));
  return false;
}

function assertRegexMatches(content, re, groupLabel) {
  if (re.test(content)) {
    ok(groupLabel);
    return true;
  }
  fail(groupLabel, 'no se encontró el patrón: ' + re.toString());
  return false;
}

function fileExistsOrFail(file, label) {
  if (!fs.existsSync(file)) {
    fail(label, file);
    return null;
  }
  ok(label);
  return fs.readFileSync(file, 'utf8');
}

// Localiza la posición (índice) de la primera coincidencia de un patrón
// regex en el contenido, o -1 si no aparece. Se usa para validar el
// orden secuencial de las 6 secciones.
function firstIndexOf(content, re) {
  const m = content.search(re);
  return m === -1 ? -1 : m;
}

// ---------------------------------------------------------------------------
// [1/6] Página cliente /cirugias/nueva
// ---------------------------------------------------------------------------

function checkNuevaPage() {
  console.log(
    '\n[1/6] Página /cirugias/nueva: ' +
      path.relative(REPO_ROOT, PAGE_FILE)
  );

  const content = fileExistsOrFail(PAGE_FILE, 'archivo de la página existe');
  if (content === null) return;

  // 1. 'use client'
  assertRegexMatches(
    content,
    /^['"]use client['"]/m,
    "página marcada con 'use client'"
  );

  // 2. Exporta componente por defecto
  assertRegexMatches(
    content,
    /export\s+default\s+function\s+\w+/,
    'exporta componente por defecto (export default function ...)'
  );

  // 3. Las 6 secciones en orden FLU-001. Para cada sección capturamos el
  //    índice de su `<h2>` (los encabezados de las secciones) y exigimos
  //    que las posiciones sean crecientes. Esto verifica simultáneamente
  //    presencia y orden.

  const sectionRegexes = [
    { label: '1. Paciente', re: /1\.\s*Paciente|<\/?User\b|>\s*1\.\s*Paciente/ },
    {
      label: '2. Expediente',
      re: /2\.\s*Expediente|>\s*2\.\s*Expediente/,
    },
    {
      label: '3. Datos de la cirugía',
      re: /3\.\s*Datos\s+de\s+la\s+cirug|>\s*3\.\s*Datos\s+de\s+la\s+cirug/,
    },
    {
      label: '4. Asignación médica',
      re: /4\.\s*Asignaci(ó|o)n\s+m(é|e)dica|>\s*4\.\s*Asignaci(ó|o)n\s+m(é|e)dica/,
    },
    {
      label: '5. LIO / Lente intraocular',
      re: /5\.\s*Lente\s+intraocular|5\.\s*LIO|>5\.\s*LIO|>5\.\s*Lente/,
    },
    {
      label: '6. Archivos de apoyo',
      re: /6\.\s*Archivos\s+de\s+apoyo|>\s*6\.\s*Archivos\s+de\s+apoyo/,
    },
  ];

  // Para los encabezados siguientes aceptamos tanto la presencia literal
  // como la presencia del icono adyacente. Aceptamos también "Expediente
  // clínico" pero el orden se valida por el número de sección.
  const positions = sectionRegexes.map(function (s) {
    return firstIndexOf(content, s.re);
  });

  // Verificamos presencia
  sectionRegexes.forEach(function (s, i) {
    if (positions[i] === -1) {
      fail('presencia de sección "' + s.label + '"', 'no se encontró el patrón');
    } else {
      ok('presencia de sección "' + s.label + '"');
    }
  });

  // Verificamos orden creciente (cada sección aparece después de la
  // anterior)
  let orderOk = true;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i - 1] === -1 || positions[i] === -1) continue;
    if (positions[i] <= positions[i - 1]) {
      orderOk = false;
      fail(
        'orden de secciones FLU-001 (' + i + ' después de ' + (i + 1) + ')',
        'posición de "' +
          sectionRegexes[i - 1].label +
          '"=' +
          positions[i - 1] +
          ' >= "' +
          sectionRegexes[i].label +
          '"=' +
          positions[i]
      );
    }
  }
  if (orderOk) {
    ok('orden secuencial 1→6 de las secciones (FLU-001)');
  }

  // 4. Búsqueda de paciente: usa SearchInput + fetch('/api/search?q=...').
  assertRegexMatches(
    content,
    /import\s+SearchInput\s+from\s+['"]@\/components\/ui\/SearchInput['"]/,
    "importa SearchInput desde '@/components/ui/SearchInput'"
  );
  assertRegexMatches(
    content,
    /<SearchInput\b/,
    'renderiza <SearchInput> para el buscador de paciente'
  );
  assertRegexMatches(
    content,
    /fetch\(\s*[`'"]\/api\/search\?q=/,
    "usa fetch('/api/search?q=...') para búsqueda de paciente"
  );

  // 5. Muestra expediente y datos de última consulta / historial.
  assertRegexMatches(
    content,
    /Ver\s+expediente/i,
    'muestra botón "Ver expediente" tras seleccionar paciente (PAC-002)'
  );
  assertRegexMatches(
    content,
    /\u00daltima\s+consulta/i,
    'muestra datos de última consulta del paciente (PAC-004)'
  );
  assertRegexMatches(
    content,
    /antecedentes|historial/i,
    'muestra antecedentes / historial del paciente (PAC-004)'
  );
  assertRegexMatches(
    content,
    /\/api\/pacientes\/\$\{[^}]*\}\/resumen|\/api\/pacientes\/`?\/?\$\{[^}]*\}\/resumen/,
    'consulta /api/pacientes/[id]/resumen para cargar el expediente (EXP-001)'
  );

  // 6. Usa /api/catalogo-servicios?paciente_id= para procedimientos
  //    (CAT-001, CAT-002: catálogo dependiente del paciente = origen).
  assertRegexMatches(
    content,
    /\/api\/catalogo-servicios\?paciente_id=/,
    "usa '/api/catalogo-servicios?paciente_id=' para cargar procedimientos (CAT-001/002)"
  );

  // 7. Ojo normalizado: select con OD/OI/OU (OJO-001).
  assertRegexMatches(
    content,
    /['"]OD['"]/,
    'ojo incluye opción "OD" (OJO-001)'
  );
  assertRegexMatches(
    content,
    /['"]OI['"]/,
    'ojo incluye opción "OI" (OJO-001)'
  );
  assertRegexMatches(
    content,
    /['"]OU['"]/,
    'ojo incluye opción "OU" (OJO-001)'
  );

  // 8. Participantes: select de médicos + select de roles + botón
  //    "Agregar participante" (MED-001).
  assertRegexMatches(
    content,
    /Agregar\s+participante/i,
    'muestra botón "Agregar participante" (MED-001)'
  );
  // Hay al menos un select que itera sobre `doctores` y otro sobre `roles`.
  assertRegexMatches(
    content,
    /doctores\.map\s*\(/,
    'renderiza <select> con doctores para médicos participantes'
  );
  assertRegexMatches(
    content,
    /roles\.map\s*\(/,
    'renderiza <select> con roles para roles de participantes'
  );

  // 9. Renderiza <LIOSelector.
  assertRegexMatches(
    content,
    /import\s+LIOSelector\s+from\s+['"]@\/components\/cirugia\/LIOSelector['"]/,
    "importa LIOSelector desde '@/components/cirugia/LIOSelector'"
  );
  assertRegexMatches(
    content,
    /<LIOSelector\b/,
    'renderiza <LIOSelector /> en la sección LIO'
  );

  // 10. Sección de archivos: drag&drop + formatos (VAL-007).
  assertRegexMatches(
    content,
    /onDrop\s*=/,
    'sección de archivos implementa drag&drop con onDrop'
  );
  assertRegexMatches(
    content,
    /onDragOver\s*=/,
    'sección de archivos implementa drag&drop con onDragOver'
  );
  const formatosEsperados = ['PDF', 'JPG', 'JPEG', 'PNG', 'WEBP'];
  formatosEsperados.forEach(function (f) {
    assertRegexMatches(
      content,
      new RegExp('\\b' + f + '\\b'),
      'formatos visibles en UI incluyen ' + f + ' (VAL-007)'
    );
  });
  // Verifica que el accept del input file coincida con los formatos.
  assertRegexMatches(
    content,
    /EXTENSIONES_PERMITIDAS\s*=\s*\[[^\]]*\.(?:pdf|jpg|jpeg|png|webp)[^\]]*\]/,
    'EXTENSIONES_PERMITIDAS incluye pdf, jpg, jpeg, png y webp'
  );

  // 11. Campo de `monto` NO debe existir en el formulario (ARC-001,
  //     VAL-007 / decisiones: el alta de cirugía no captura monto).
  assertNotContains(
    content,
    'monto',
    'no existe campo/uso de "monto" en el formulario'
  );

  // 12. POST a /api/cirugias con los campos requeridos.
  assertRegexMatches(
    content,
    /fetch\(\s*[`'"]\/api\/cirugias['"]\s*,[^)]*method:\s*['"]POST['"]/,
    "hace fetch POST a '/api/cirugias' al enviar"
  );
  const camposBody = [
    'paciente_id',
    'origen_id',
    'servicio_id',
    'fecha',
    'hora',
    'duracion_min',
    'ojo',
    'participantes',
  ];
  camposBody.forEach(function (campo) {
    // Acepta tanto la sintaxis `campo: valor` como la shorthand
    // `campo,` / `campo\n` cuando el valor es una variable con el
    // mismo nombre (p. ej. `hora,` o `ojo,`).
    assertRegexMatches(
      content,
      new RegExp(campo + '\\s*[,\\n:]'),
      'body del POST a /api/cirugias incluye campo "' + campo + '"'
    );
  });

  // 13. Tras crear la cirugía, sube archivos a /api/cirugias/[id]/archivos.
  assertRegexMatches(
    content,
    /\/api\/cirugias\/\$\{[^}]+\}\/archivos|\/api\/cirugias\/`?\$\{[^}]+\}\/archivos`?/,
    'sube archivos a /api/cirugias/[id]/archivos tras crear la cirugía'
  );
  // Y hace FormData con `archivo` + `tipo_documento`.
  assertRegexMatches(
    content,
    /fd\.append\(\s*['"]archivo['"]/,
    'el FormData de subida adjunta campo "archivo"'
  );
  assertRegexMatches(
    content,
    /fd\.append\(\s*['"]tipo_documento['"]/,
    'el FormData de subida adjunta campo "tipo_documento"'
  );

  // 14. Validaciones frontend: paciente obligatorio, duración > 0,
  //     cirujano obligatorio (refuerza PAC-003 y FLU-001).
  assertRegexMatches(
    content,
    /Debe\s+seleccionar\s+un\s+paciente/i,
    'valida paciente obligatorio (PAC-003)'
  );
  assertRegexMatches(
    content,
    /duraci(ó|o)n[^\n]*mayor\s+a\s+0|duraci(ó|o)n\s+debe\s+ser\s+mayor\s+a\s+0/i,
    'valida duración estimada > 0 (FLU-001 / VAL-001)'
  );
  assertRegexMatches(
    content,
    /Debe\s+asignar\s+al\s+menos\s+un\s+cirujano/i,
    'valida cirujano obligatorio (MED-001)'
  );

  // 15. Botón final "Validar y crear cirugía".
  assertRegexMatches(
    content,
    /Validar\s+y\s+crear\s+cirug|ía/i,
    'botón final del formulario es "Validar y crear cirugía" (FLU-001)'
  );
}

// ---------------------------------------------------------------------------
// [2/6] AgendaContent.tsx: enlace/botón a /cirugias/nueva
// ---------------------------------------------------------------------------

function checkAgendaContentLink() {
  console.log(
    '\n[2/6] AgendaContent.tsx: enlace/botón a /cirugias/nueva'
  );

  const content = fileExistsOrFail(
    AGENDA_CONTENT_FILE,
    'archivo AgendaContent.tsx existe'
  );
  if (content === null) return;

  // 1. Contiene navegación a /cirugias/nueva (anchor o router.push).
  const hasLink = /href\s*=\s*['"]\/cirugias\/nueva['"]/.test(content);
  const hasButton = /router\.push\(['"]\/cirugias\/nueva['"]\)/.test(content);
  if (hasLink || hasButton) {
    ok('AgendaContent contiene navegación a /cirugias/nueva');
  } else {
    fail(
      'AgendaContent contiene href o router.push a /cirugias/nueva',
      'no se encontró href ni router.push a /cirugias/nueva'
    );
  }

  // 2. El texto del botón/enlace incluye "Nueva cirugía".
  const anchorMatch = content.match(
    /<a[^>]*href=['"]\/cirugias\/nueva['"][^>]*>[\s\S]*?<\/a>/
  );
  const buttonMatch = content.match(
    /<button[^>]*>[\s\S]*?Nueva cirugía[\s\S]*?<\/button>/
  );
  if (anchorMatch || buttonMatch) {
    const node = anchorMatch ? anchorMatch[0] : buttonMatch[0];
    const innerText = node.replace(/<[^>]*>/g, '');
    if (/Nueva\s+cirug[íi]a/i.test(innerText)) {
      ok('navegación a /cirugias/nueva con texto "Nueva cirugía" presente');
    } else {
      fail(
        'navegación a /cirugias/nueva con texto "Nueva cirugía"',
        'texto interno: ' + JSON.stringify(innerText.trim())
      );
    }
  } else {
    fail(
      'navegación a /cirugias/nueva con texto "Nueva cirugía"',
      'no se encontró <a> ni <button> con destino/texto adecuado'
    );
  }
}

// ---------------------------------------------------------------------------
// [3/6] Endpoint GET /api/cirugias/roles
// ---------------------------------------------------------------------------

function checkRolesEndpoint() {
  console.log(
    '\n[3/6] Endpoint GET /api/cirugias/roles: ' +
      path.relative(REPO_ROOT, ROLES_ROUTE_FILE)
  );

  const content = fileExistsOrFail(
    ROLES_ROUTE_FILE,
    'archivo del endpoint /api/cirugias/roles existe'
  );
  if (content === null) return;

  // 1. Exporta GET
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );

  // 2. Usa requireAuth
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar al usuario'
  );

  // 3. Consulta cat_roles_participante
  assertRegexMatches(
    content,
    /\.from\(\s*['"]cat_roles_participante['"]\s*\)/,
    "consulta la tabla 'cat_roles_participante'"
  );

  // 4. Filtra activo=true
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]activo['"]\s*,\s*true\s*\)/,
    "filtra .eq('activo', true)"
  );

  // 5. Ordena por orden ascendente
  assertRegexMatches(
    content,
    /\.order\(\s*['"]orden['"]\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/,
    "ordena por 'orden' ascendente"
  );

  // 6. Manejo de error con status 500
  assertRegexMatches(
    content,
    /status\s*:\s*500/,
    'responde 500 ante error interno'
  );
}

// ---------------------------------------------------------------------------
// [4/6] Endpoint GET /api/cirugias/recursos
// ---------------------------------------------------------------------------

function checkRecursosEndpoint() {
  console.log(
    '\n[4/6] Endpoint GET /api/cirugias/recursos: ' +
      path.relative(REPO_ROOT, RECURSOS_ROUTE_FILE)
  );

  const content = fileExistsOrFail(
    RECURSOS_ROUTE_FILE,
    'archivo del endpoint /api/cirugias/recursos existe'
  );
  if (content === null) return;

  // 1. Exporta GET
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );

  // 2. Usa requireAuth
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar al usuario'
  );

  // 3. Consulta cat_recursos
  assertRegexMatches(
    content,
    /\.from\(\s*['"]cat_recursos['"]\s*\)/,
    "consulta la tabla 'cat_recursos'"
  );

  // 4. Filtra activo=true
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]activo['"]\s*,\s*true\s*\)/,
    "filtra .eq('activo', true)"
  );

  // 5. Filtra tipo='QUIROFANO'
  assertRegexMatches(
    content,
    /\.eq\(\s*['"]tipo['"]\s*,\s*['"]QUIROFANO['"]\s*\)/,
    "filtra .eq('tipo', 'QUIROFANO')"
  );

  // 6. Manejo de error con status 500
  assertRegexMatches(
    content,
    /status\s*:\s*500/,
    'responde 500 ante error interno'
  );
}

// ---------------------------------------------------------------------------
// [5/6] Endpoint GET /api/pacientes/[id]/resumen
// ---------------------------------------------------------------------------

function checkResumenEndpoint() {
  console.log(
    '\n[5/6] Endpoint GET /api/pacientes/[id]/resumen: ' +
      path.relative(REPO_ROOT, RESUMEN_ROUTE_FILE)
  );

  const content = fileExistsOrFail(
    RESUMEN_ROUTE_FILE,
    'archivo del endpoint /api/pacientes/[id]/resumen existe'
  );
  if (content === null) return;

  // 1. Exporta GET con params (Next.js App Router)
  assertRegexMatches(
    content,
    /export\s+async\s+function\s+GET\s*\(/,
    'exporta async function GET'
  );
  assertRegexMatches(
    content,
    /params\s*:\s*\{\s*id\s*:\s*string\s*\}/,
    'acepta params con id:string (Next.js App Router)'
  );

  // 2. Usa requireAuth
  assertRegexMatches(
    content,
    /requireAuth\s*\(\s*\)/,
    'usa requireAuth() para autenticar al usuario'
  );

  // 3. Consulta pacientes
  assertRegexMatches(
    content,
    /\.from\(\s*['"]pacientes['"]\s*\)/,
    "consulta la tabla 'pacientes'"
  );

  // 4. Devuelve los campos requeridos en la respuesta (paciente,
  //    aseguranza, ultima_consulta, consultas_previas, cirugias_previas,
  //    expediente_id).
  const camposRequeridos = [
    'paciente',
    'aseguranza',
    'ultima_consulta',
    'consultas_previas',
    'cirugias_previas',
    'expediente_id',
  ];
  camposRequeridos.forEach(function (campo) {
    assertRegexMatches(
      content,
      new RegExp('\\b' + campo + '\\b'),
      'respuesta incluye campo "' + campo + '"'
    );
  });

  // 5. 404 cuando el paciente no existe
  assertRegexMatches(
    content,
    /status\s*:\s*404/,
    'responde 404 cuando el paciente no existe'
  );

  // 6. Si hay error en supabase del paciente responde 404 o error claro
  assertRegexMatches(
    content,
    /pacienteError|Paciente no encontrado/i,
    'maneja error de paciente inexistente con mensaje claro'
  );
}

// ---------------------------------------------------------------------------
// [6/6] Script npm test:b9 + integridad de test:b1..b8
// ---------------------------------------------------------------------------

function checkPackageJson() {
  console.log('\n[6/6] Script npm test:b9 e integridad de test:b1..b8');

  const pkgContent = fileExistsOrFail(PACKAGE_JSON_FILE, 'package.json existe');
  if (pkgContent === null) return;

  let pkg = null;
  try {
    pkg = JSON.parse(pkgContent);
  } catch (e) {
    fail('package.json es JSON válido', e.message);
    return;
  }
  ok('package.json es JSON válido');

  const scripts = (pkg && pkg.scripts) || {};

  if (
    typeof scripts['test:b9'] === 'string' &&
    scripts['test:b9'].length > 0
  ) {
    ok(
      'script npm "test:b9" definido (' +
        JSON.stringify(scripts['test:b9']) +
        ')'
    );
  } else {
    fail('script npm "test:b9" definido', 'ausente o vacío en package.json');
  }

  [
    'test:b1',
    'test:b2',
    'test:b3',
    'test:b4',
    'test:b5',
    'test:b6',
    'test:b7',
    'test:b8',
  ].forEach(function (key) {
    if (typeof scripts[key] === 'string' && scripts[key].length > 0) {
      ok(
        'script npm "' + key + '" intacto (' +
          JSON.stringify(scripts[key]) +
          ')'
      );
    } else {
      fail(
        'script npm "' + key + '" intacto',
        'ausente o vacío en package.json'
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log(' Pruebas B9 - UI formulario de creación (Fase 1)');
  console.log('========================================================');
  console.log('Repo root: ' + REPO_ROOT);

  checkNuevaPage();
  checkAgendaContentLink();
  checkRolesEndpoint();
  checkRecursosEndpoint();
  checkResumenEndpoint();
  checkPackageJson();

  console.log('\n--------------------------------------------------------');
  console.log(' Resumen: ' + passes + ' OK, ' + failures + ' FAIL');
  console.log('--------------------------------------------------------');

  if (failures > 0) {
    console.error('\nFallos detectados:');
    failuresDetail.forEach(function (f, i) {
      console.error('  ' + (i + 1) + '. ' + f);
    });
    console.error(
      '\nLa prueba B9 FALLÓ. Corrige los elementos marcados arriba.'
    );
    process.exit(1);
  }

  console.log(
    '\nLa prueba B9 PASÓ. Todos los elementos obligatorios están presentes.'
  );
  process.exit(0);
}

main();