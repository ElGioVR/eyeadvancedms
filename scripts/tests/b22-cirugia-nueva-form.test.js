#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B22 - Cirugía Nueva Form: Tests de carga de datos y funcionalidad.
 * Node puro: lee `src/app/(dashboard)/cirugias/nueva/page.tsx` y verifica
 * la presencia de patrones clave en el código fuente.
 * No conecta a Supabase ni ejecuta migraciones.
 *
 * IDs cubiertos:
 *   - Carga de catálogos (aseguranzas, doctores, roles, recursos)
 *   - Carga de consulta preload (paciente, procedimiento, cirujano, fecha/hora)
 *   - Auto-fill de procedimiento desde catálogo
 *   - Validaciones de formulario
 *   - Selección de paciente y historial ocular
 *   - Carga de servicios por paciente/origen
 *   - Manejo de archivos
 *   - Validación final del formulario
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
let passes = 0;
const detail = [];

function ok(label) {
  passes += 1;
  console.log('  \u2713 ' + label);
}

function fail(label, extra) {
  failures += 1;
  const msg = extra ? label + ' -> ' + extra : label;
  detail.push(msg);
  console.log('  \u2717 ' + msg);
}

function assert(cond, label) {
  if (cond) ok(label);
  else fail(label);
}

function loadPageSource() {
  const pagePath = path.join(ROOT, 'src', 'app', '(dashboard)', 'cirugias', 'nueva', 'page.tsx');
  return fs.readFileSync(pagePath, 'utf8');
}

console.log('\n[B22] Cirugía Nueva Form - Tests de carga y validación\n');

const src = loadPageSource();

// ---------------------------------------------------------------------------
// TEST 1 - Carga de catálogos
// ---------------------------------------------------------------------------
console.log(' TEST 1 - Carga de catálogos (aseguranzas, doctores, roles, recursos)');
assert(src.includes('aseguranzas') && src.includes('doctores') && src.includes('roles') && src.includes('recursos'), 'Catálogos referenciados');
assert(src.includes('Promise.all'), 'Carga paralela con Promise.all');
assert(src.includes('aseguranzas') && src.includes('fetch'), 'Fetch a aseguranzas');
assert(src.includes('doctores') && src.includes('fetch'), 'Fetch a doctores');
assert(src.includes('roles') && src.includes('fetch'), 'Fetch a roles');
assert(src.includes('recursos') && src.includes('fetch'), 'Fetch a recursos');

// ---------------------------------------------------------------------------
// TEST 2 - Estructura de tipos y estado inicial
// ---------------------------------------------------------------------------
console.log(' TEST 2 - Estado inicial del formulario');
assert(src.includes('interface Paciente'), 'Interface Paciente definida');
assert(src.includes('interface Doctor'), 'Interface Doctor definida');
assert(src.includes('interface Rol'), 'Interface Rol definida');
assert(src.includes('interface Recurso'), 'Interface Recurso definida');
assert(src.includes('interface Servicio'), 'Interface Servicio definida');
assert(src.includes('interface Participante'), 'Interface Participante definida');
assert(src.includes('interface ArchivoLocal'), 'Interface ArchivoLocal definida');
assert(src.includes('type OjoOperado'), 'Tipo OjoOperado definido');
assert(src.includes('type FiltroOjo'), 'Tipo FiltroOjo definido');
assert(src.includes('interface HistorialOjo'), 'Interface HistorialOjo definida');
assert(src.includes('interface PacienteResumen'), 'Interface PacienteResumen definida');
assert(src.includes('const [loadingInitial'), 'Estado loadingInitial');
assert(src.includes('initialLoadDone'), 'Ref initialLoadDone');

// ---------------------------------------------------------------------------
// TEST 3 - Validaciones de formulario (validarFormulario)
// ---------------------------------------------------------------------------
console.log(' TEST 3 - Lógica de validación del formulario');
assert(src.includes('const validarFormulario'), 'función validarFormulario definida');
assert(src.includes('Debe seleccionar un paciente'), 'Valida paciente');
assert(src.includes('Debe seleccionar un procedimiento'), 'Valida procedimiento');
assert(src.includes('Debe seleccionar el ojo'), 'Valida ojo');
assert(src.includes('Debe indicar la fecha'), 'Valida fecha');
assert(src.includes('Debe indicar la hora'), 'Valida hora');
assert(src.includes('duración estimada debe ser mayor a 0'), 'Valida duración');
assert(src.includes('Debe asignar al menos un participante'), 'Valida participantes');
assert(src.includes('Debe asignar al menos un cirujano'), 'Valida cirujano');
assert(src.includes('Indica el tipo de documento'), 'Valida tipo documento archivo');

// ---------------------------------------------------------------------------
// TEST 4 - Auto-fill de procedimiento pendiente
// ---------------------------------------------------------------------------
console.log(' TEST 4 - Auto-fill de procedimiento desde catálogo');
assert(src.includes('procedimientoPendiente'), 'Estado procedimientoPendiente');
assert(src.includes('setProcedimientoPendiente'), 'Setter procedimientoPendiente');
assert(src.includes('servicios.find'), 'Búsqueda en catálogo de servicios');
assert(src.includes('toLowerCase().includes'), 'Búsqueda case-insensitive');
assert(src.includes('setServicioId'), 'Asignación de servicioId al encontrar match');
assert(src.includes('setProcedimientoPendiente(null)'), 'Limpieza de pendiente tras match');

// ---------------------------------------------------------------------------
// TEST 5 - Carga de servicios por paciente/origen
// ---------------------------------------------------------------------------
console.log(' TEST 5 - Carga de servicios por paciente/origen');
assert(src.includes('Cargar servicios cuando cambia el paciente/origen'), 'Comentario descriptivo');
assert(src.includes('loadingServicios'), 'Estado loadingServicios');
assert(src.includes('origenConfigurado = origenId || pacienteSeleccionado.aseguranza_id'), 'Origen configurable');
assert(src.includes('catalogo-servicios'), 'Endpoint catálogo de servicios');
assert(src.includes('tipo=PROCEDIMIENTO'), 'Filtro por tipo PROCEDIMIENTO');
assert(src.includes('setServicios'), 'Setter de servicios');
assert(src.includes('setLoadingServicios(false)'), 'Finaliza loading');

// ---------------------------------------------------------------------------
// TEST 5b - Auto-fill de cirujano pendiente
// ---------------------------------------------------------------------------
console.log(' TEST 5b - Auto-fill de cirujano pendiente');
assert(src.includes('cirujanoPendiente'), 'Estado cirujanoPendiente');
assert(src.includes('setCirujanoPendiente'), 'Setter cirujanoPendiente');
assert(src.includes('roles.find'), 'Búsqueda rol cirujano');
assert(src.includes('clave === \'cirujano\''), 'Búsqueda por clave cirujano');
assert(src.includes('setParticipantes'), 'Asignación participante cirujano');
assert(src.includes('rol_id'), 'Asignación rol_id');

// ---------------------------------------------------------------------------
// TEST 6 - Selección de paciente y historial ocular
// ---------------------------------------------------------------------------
console.log(' TEST 6 - Selección de paciente y historial ocular');
assert(src.includes('seleccionarPaciente'), 'Función seleccionarPaciente');
assert(src.includes('historialOjo'), 'Estado historialOjo');
assert(src.includes('avisoOjo'), 'Estado avisoOjo');
assert(src.includes('filtroOjo'), 'Estado filtroOjo');
assert(src.includes('FILTROS_OJO'), 'Constante FILTROS_OJO');
assert(src.includes('primer'), 'Filtro primer ojo');
assert(src.includes('segundo'), 'Filtro segundo ojo');
assert(src.includes('OD') && src.includes('OI') && src.includes('OU'), 'Valores ojo OD/OI/OU');
assert(src.includes('total} cirug'), 'Cálculo total cirugías previas');
assert(src.includes('etiquetaOjo'), 'Función etiquetaOjo');

// ---------------------------------------------------------------------------
// TEST 7 - Estados de carga inicial y skeleton
// ---------------------------------------------------------------------------
console.log(' TEST 7 - Estados de carga inicial y skeleton');
assert(src.includes('loadingInitial'), 'Estado loadingInitial');
assert(src.includes('initialLoadDone'), 'Ref initialLoadDone');
assert(src.includes('loadingInitial ?'), 'Render condicional skeleton');
assert(src.includes('CirugiaFormSkeleton'), 'Skeleton custom');
assert(src.includes('setLoadingInitial(false)'), 'Setter loadingInitial');

// ---------------------------------------------------------------------------
// TEST 8 - Timeouts, abort y manejo de errores
// ---------------------------------------------------------------------------
console.log(' TEST 8 - Timeouts, abort y manejo de errores');
assert(src.includes('AbortController'), 'AbortController usado');
assert(src.includes('signal'), 'AbortSignal propagado');
assert(src.includes('AbortError'), 'Manejo AbortError');
assert(src.includes('cancelled'), 'Flag cancelled para cleanup');
assert(src.includes('AbortController'), 'AbortController instanciado');
assert(src.includes('abortRef.current?.abort()'), 'Abort en cleanup');
assert(src.includes('timeoutPromise') || src.includes('Timeout'), 'Timeout implementado');
assert(src.includes('safetyTimeout'), 'Timeout de seguridad');
assert(src.includes('clearTimeout(safetyTimeout)'), 'Limpieza timeout seguridad');
assert(src.includes('fetchWithTimeout'), 'Wrapper con timeout');
assert(src.includes('Promise.race'), 'Promise.race para timeout');

// ---------------------------------------------------------------------------
// TEST 9 - Manejo de archivos
// ---------------------------------------------------------------------------
console.log(' TEST 9 - Manejo de archivos adjuntos');
assert(src.includes('archivos'), 'Estado archivos');
assert(src.includes('EXTENSIONES_PERMITIDAS'), 'Extensiones permitidas');
assert(src.includes('archivos'), 'Manejador de archivos');
assert(src.includes('actualizarTipoDocumento'), 'Actualizar tipo documento');
assert(src.includes('eliminarArchivo'), 'Eliminar archivo');
assert(src.includes('tipo_documento'), 'Campo tipo documento');

// ---------------------------------------------------------------------------
// TEST 10 - Participantes y roles (cirujano, anestesista, etc.)
// ---------------------------------------------------------------------------
console.log(' TEST 10 - Participantes y roles');
assert(src.includes('participantes'), 'Estado participantes');
assert(src.includes('agregarParticipante'), 'Agregar participante');
assert(src.includes('actualizarParticipante'), 'Actualizar participante');
assert(src.includes('eliminarParticipante'), 'Eliminar participante');
assert(src.includes('rol_id'), 'Campo rol_id');
assert(src.includes('medico_id'), 'Campo medico_id');
assert(src.includes('clave === \'cirujano\''), 'Validación rol cirujano');
assert(src.includes('rolCirujano'), 'Búsqueda rol cirujano');

// ---------------------------------------------------------------------------
// TEST 11 - Precarga desde consulta (consulta_id)
// ---------------------------------------------------------------------------
console.log(' TEST 11 - Precarga desde consulta (consulta_id)');
assert(src.includes('consultaPrecargaId'), 'Parámetro consulta_id');
assert(src.includes('pacientePrecargaId'), 'Parámetro paciente_id');
assert(src.includes('pacienteNombrePrecarga'), 'Parámetro paciente_nombre');
assert(src.includes('procedimientoPrecarga'), 'Parámetro procedimiento');
assert(src.includes('cirujanoIdPrecarga'), 'Parámetro cirujano_id');
assert(src.includes('cirujanoNombrePrecarga'), 'Parámetro cirujano_nombre');
assert(src.includes('fechaPrecarga'), 'Parámetro fecha');
assert(src.includes('horaPrecarga'), 'Parámetro hora');
assert(src.includes('searchParams.get'), 'Lectura de searchParams');
assert(src.includes('consulta_id'), 'URL con consulta_id');

// ---------------------------------------------------------------------------
// TEST 12 - Filtros de ojo (primer/segundo ojo)
// ---------------------------------------------------------------------------
console.log(' TEST 12 - Filtros de ojo (primer/segundo ojo)');
assert(src.includes('ETIQUETA_OJO'), 'Etiquetas ojo');
assert(src.includes('sin_cirugias'), 'Estado sin cirugías');
assert(src.includes('OD'), 'Ojo derecho');
assert(src.includes('OI'), 'Ojo izquierdo');
assert(src.includes('ambos'), 'Ambos ojos');
assert(src.includes('desconocido'), 'Ojo desconocido');
assert(src.includes('primer'), 'Filtro primer ojo');
assert(src.includes('segundo'), 'Filtro segundo ojo');
assert(src.includes('avisoOjo'), 'Avisos de filtro ojo');
assert(src.includes('etiquetaOjo'), 'Función etiquetaOjo');

// ---------------------------------------------------------------------------
// TEST 13 - Validación final y envío
// ---------------------------------------------------------------------------
console.log(' TEST 13 - Validación final y envío');
assert(src.includes('guardando'), 'Estado guardando');
assert(src.includes('validarFormulario'), 'Validación antes de guardar');
assert(src.includes('fetch(\'/api/cirugias\''), 'POST a API cirugías');
assert(src.includes('method: \'POST\''), 'Método POST');
assert(src.includes('paciente_id'), 'Envía paciente_id');
assert(src.includes('origen_id'), 'Envía origen_id');
assert(src.includes('servicio_id'), 'Envía servicio_id');
assert(src.includes('fecha'), 'Envía fecha');
assert(src.includes('hora'), 'Envía hora');
assert(src.includes('duracion_min'), 'Envía duración');
assert(src.includes('recurso_id'), 'Envía recurso_id');
assert(src.includes('ojo'), 'Envía ojo');
assert(src.includes('inventario_item_id'), 'Envía inventario_item_id');
assert(src.includes('consulta_id'), 'Envía consulta_id');
assert(src.includes('participantes'), 'Envía participantes');
assert(src.includes('notas'), 'Envía notas');

// ---------------------------------------------------------------------------
// TEST 14 - Integración con Suspense
// ---------------------------------------------------------------------------
console.log(' TEST 14 - Integración con Suspense');
assert(src.includes('Suspense'), 'Suspense wrapper');
assert(src.includes('fallback'), 'Fallback Suspense');
assert(src.includes('NuevaCirugiaContent'), 'Componente content');
assert(src.includes('export default function NuevaCirugiaPage'), 'Export default page');

// ---------------------------------------------------------------------------
// TEST 15 - Skeleton custom (CirugiaFormSkeleton)
// ---------------------------------------------------------------------------
console.log(' TEST 15 - Skeleton custom (CirugiaFormSkeleton)');
assert(src.includes('function CirugiaFormSkeleton'), 'Función skeleton');
assert(src.includes('animate-pulse'), 'Animación pulse');
assert(src.includes('PageHeader skeleton'), 'Header skeleton');
assert(src.includes('Section 1: Paciente'), 'Paciente skeleton');
assert(src.includes('Section 2: Expediente'), 'Expediente skeleton');
assert(src.includes('Section 3: Datos de cirug'), 'Especificaciones skeleton');
assert(src.includes('Section 4: Equipo'), 'Equipo skeleton');
assert(src.includes('Section 5: Recursos'), 'Recursos skeleton');
assert(src.includes('Section 6: Archivos'), 'Archivos skeleton');
assert(src.includes('Actions skeleton') || src.includes('Acciones skeleton'), 'Acciones skeleton');

// ---------------------------------------------------------------------------
// TEST 16 - Carga de datos de consulta (background)
// ---------------------------------------------------------------------------
console.log(' TEST 16 - Carga de datos de consulta (background)');
assert(src.includes('loadConsultaData'), 'Función loadConsultaData');
assert(src.includes('consultaPrecargaId'), 'Consulta ID precarga');
assert(src.includes('pacientePrecargaId'), 'Paciente ID precarga');
assert(src.includes('procedimientoPrecarga'), 'Procedimiento precarga');
assert(src.includes('cirujanoIdPrecarga'), 'Cirujano ID precarga');
assert(src.includes('cirujanoNombrePrecarga'), 'Cirujano nombre precarga');
assert(src.includes('seleccionarPacienteRef.current'), 'Uso ref seleccionarPaciente');
assert(src.includes('setProcedimientoPendiente'), 'Set procedimiento pendiente');
assert(src.includes('setCirujanoPendiente'), 'Set cirujano pendiente');
assert(src.includes('setOrigenId'), 'Set origen ID');
assert(src.includes('setNotas'), 'Set notas diagnóstico');

// ---------------------------------------------------------------------------
// TEST 17 - Carga de servicios
// ---------------------------------------------------------------------------
console.log(' TEST 17 - Carga de servicios');
assert(src.includes('catalogo-servicios'), 'Endpoint catálogo servicios');
assert(src.includes('tipo=PROCEDIMIENTO'), 'Filtro tipo PROCEDIMIENTO');
assert(src.includes('loadingServicios'), 'Loading servicios');
assert(src.includes('setServicios'), 'Set servicios');
assert(src.includes('setLoadingServicios(false)'), 'Finaliza loading servicios');

// ---------------------------------------------------------------------------
// TEST 18 - Precarga fecha/hora desde Agenda
// ---------------------------------------------------------------------------
console.log(' TEST 18 - Precarga fecha/hora desde Agenda');
assert(src.includes('fechaPrecarga'), 'Fecha precarga');
assert(src.includes('horaPrecarga'), 'Hora precarga');
assert(src.includes('setFecha'), 'Set fecha');
assert(src.includes('setHora'), 'Set hora');

// ---------------------------------------------------------------------------
// TEST 19 - Filtros de ojo (primer/segundo)
// ---------------------------------------------------------------------------
console.log(' TEST 19 - Filtros de ojo (primer/segundo)');
assert(src.includes('etiquetaOjo'), 'Función etiquetaOjo');
assert(src.includes('Primer ojo') || src.includes('primer'), 'Texto primer ojo');
assert(src.includes('segundo'), 'Texto segundo ojo');
assert(src.includes('avisoOjo'), 'Aviso ojo');
assert(src.includes('filtroOjo'), 'Estado filtroOjo');

// ---------------------------------------------------------------------------
// TEST 20 - Manejo de errores y cleanup
// ---------------------------------------------------------------------------
console.log(' TEST 20 - Manejo de errores y cleanup');
assert(src.includes('finally'), 'Bloque finally');
assert(src.includes('setLoadingInitial(false)'), 'Set loadingInitial false en finally');
assert(src.includes('cancelled'), 'Flag cancelled');
assert(src.includes('signal.aborted'), 'Verificación signal.aborted');
assert(src.includes('clearTimeout(safetyTimeout)'), 'Limpieza safety timeout');

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
if (failures === 0) {
  console.log('RESULTADO: OK (' + passes + ' aserciones)');
  process.exit(0);
}
console.log('RESULTADO: FAIL (' + failures + ' fallas, ' + passes + ' ok)');
detail.forEach((d) => console.log('  - ' + d));
process.exit(1);