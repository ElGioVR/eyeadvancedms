#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B24 — Modificaciones agenda: punto II (especialidad + tipo de consulta) y
 * punto I parcial (diagnóstico, anestesia, OS, tipos de archivo de apoyo).
 * Aserciones textuales; no conecta a BD. Lógica pura: src/lib/__tests__/catalogos-agenda.test.ts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(ROOT, p));
const fallos = [];
let total = 0;
function check(nombre, cond) {
  total++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else { console.log(`  ✗ ${nombre}`); fallos.push(nombre); }
}

console.log('Fase 0 / II. Especialidades y tipo de consulta');
const m330 = 'src/migrations/1800000000330-CreateCatEspecialidades.ts';
check('migración cat_especialidades existe', existe(m330));
if (existe(m330)) {
  const m = leer(m330);
  check('crea cat_especialidades con RLS', /CREATE TABLE IF NOT EXISTS cat_especialidades/.test(m) && /ENABLE ROW LEVEL SECURITY/.test(m));
  check('siembra Retina, Glaucoma, Córnea, Catarata', ['Retina', 'Glaucoma', 'Córnea', 'Catarata'].every((n) => m.includes(n)));
  check('agrega consultas.especialidad_id (FK)', /consultas[\s\S]*especialidad_id UUID REFERENCES cat_especialidades/.test(m));
  check('down() revierte', /DROP TABLE IF EXISTS cat_especialidades/.test(m));
}
check('SQL espejo sql/patch-cat-especialidades.sql', existe('sql/patch-cat-especialidades.sql'));
check('GET /api/catalogos/especialidades con requireAuth', existe('src/app/api/catalogos/especialidades/route.ts') && /requireAuth\(\)/.test(leer('src/app/api/catalogos/especialidades/route.ts')));

const docs = leer('src/app/(dashboard)/configuracion/doctores/page.tsx');
check('Configuración → Doctores usa el catálogo (sin lista fija)', /useEspecialidades\(\)/.test(docs) && !/<option value="Retina">/.test(docs));

const post = leer('src/app/api/consultas/route.ts');
check('POST /api/consultas acepta especialidad_id', /especialidad_id: z\.string\(\)\.uuid\(\)/.test(post));
check('PATCH /api/consultas/[id] acepta especialidad_id', /updateData\.especialidad_id = data\.especialidad_id/.test(leer('src/app/api/consultas/[id]/route.ts')));

const nueva = leer('src/app/(dashboard)/consultas/nueva/page.tsx');
check('consultas/nueva: Consulta unificada (opcional) antes de Tipo; especialidad del médico', /label="Consulta \(opcional\)"[\s\S]{0,900}label="Tipo de consulta"/.test(nueva) && !/label="Especialidad"/.test(nueva) && /updateConsultation\('especialidad', esp\?\.clave \|\| ''\)/.test(nueva));
check('consultas/nueva: selector Tipo de consulta (4 opciones)', /label="Tipo de consulta"[\s\S]{0,300}TIPOS_CONSULTA_AGENDA/.test(nueva));
check('consultas/nueva: envía especialidad_id', /especialidad_id: especialidades\.find/.test(nueva));
check('consultas/nueva: respeta ?tipo=ESTUDIO de la agenda', /searchParams\.get\('tipo'\)/.test(nueva));

const agendaApi = leer('src/app/api/agenda/route.ts');
check('GET /api/agenda devuelve especialidad y tipo_consulta_label', /especialidad:especialidad_id \(nombre\)/.test(agendaApi) && /tipo_consulta_label: etiquetaTipoConsulta/.test(agendaApi));
const agenda = leer('src/app/(dashboard)/agenda/AgendaContent.tsx');
check('agenda filtra por especialidad', /filterEspecialidad/.test(agenda) && /c\.especialidad === filterEspecialidad/.test(agenda));
check('popover muestra especialidad · tipo', /cirugia\.especialidad, cirugia\.tipo_consulta_label/.test(agenda));
check('alta rápida usa los 4 tipos y especialidad', /TIPOS_CONSULTA_AGENDA/.test(leer('src/components/agenda/AccionesRapidasAgenda.tsx')) && /especialidad_id:/.test(leer('src/components/agenda/AccionesRapidasAgenda.tsx')));

console.log('I (parcial). Formulario de cirugía');
const m340 = 'src/migrations/1800000000340-AddAnestesiaToAgendaCirugias.ts';
check('migración anestesia existe con CHECK', existe(m340) && /LOCAL_SEDACION', 'LOCAL', 'GENERAL'/.test(leer(m340)));
check('SQL espejo sql/patch-cirugia-anestesia.sql', existe('sql/patch-cirugia-anestesia.sql'));
const apiCir = leer('src/app/api/cirugias/route.ts');
check('POST /api/cirugias exige anestesia', /anestesia: z\.enum\(VALORES_ANESTESIA/.test(apiCir));
check('POST /api/cirugias guarda diagnóstico y anestesia tras el RPC', /update\(\{\s*anestesia: data\.anestesia,\s*diagnostico:/.test(apiCir));
check('no se modifica la firma del RPC crear_cirugia', !/p_anestesia|p_diagnostico/.test(apiCir));
const wiz = leer('src/app/(dashboard)/cirugias/nueva/page.tsx');
check('wizard: campo Diagnóstico propio (ya no va a Notas)', /setDiagnostico\(consultaData\.consulta\.diagnostico\)/.test(wiz) && !/Diagnóstico de consulta: /.test(wiz));
check('wizard: anestesia obligatoria', /if \(!anestesia\) return 'Selecciona el tipo de anestesia'/.test(wiz) && /ANESTESIAS\.map/.test(wiz));
check('wizard: ojos OD / OS / OU', /const OJOS = OJOS_CIRUGIA/.test(wiz) && /'OS - Ojo izquierdo'/.test(leer('src/lib/catalogos/cirugia.ts')));
check('wizard: tipos de documento predefinidos + Otro', /TIPOS_DOCUMENTO_APOYO\.map/.test(wiz) && /TIPO_DOCUMENTO_OTRO/.test(wiz));
check('wizard: aviso si falta medicina interna', /TIPO_MEDICINA_INTERNA/.test(wiz));
check('detalle de cirugía muestra Anestesia y Diagnóstico', /label="Anestesia"/.test(leer('src/app/(dashboard)/cirugias/[id]/page.tsx')));
check('agenda muestra OS en lugar de OI', /etiquetaOjo\(cirugia\.ojo\)/.test(agenda));

console.log('I (resto). Datos generales, procedimientos, LIO y personal');
const m350 = 'src/migrations/1800000000350-AddCamposClinicosCirugia.ts';
check('migración 350 existe', existe(m350));
if (existe(m350)) {
  const m = leer(m350);
  check('350: motivo_consulta + especialidad_id en agenda_cirugias', /motivo_consulta TEXT/.test(m) && /especialidad_id UUID REFERENCES cat_especialidades/.test(m));
  check('350: lio_diseno (CHECK) + lio_torico', /lio_diseno IN \('MONOFOCAL', 'TRIFOCAL'\)/.test(m) && /lio_torico BOOLEAN/.test(m));
  check('350: cirugia_procedimientos y cirugia_personal con RLS', /CREATE TABLE IF NOT EXISTS cirugia_procedimientos/.test(m) && /CREATE TABLE IF NOT EXISTS cirugia_personal/.test(m) && (m.match(/ENABLE ROW LEVEL SECURITY/g) || []).length >= 2);
  check('350: down() revierte', /DROP TABLE IF EXISTS cirugia_personal/.test(m));
}
check('SQL espejo sql/patch-cirugia-campos-clinicos.sql', existe('sql/patch-cirugia-campos-clinicos.sql'));
check('API valida procedimientos adicionales contra el catálogo', /Alguno de los procedimientos adicionales no existe/.test(apiCir));
check('API guarda tipo de LIO, procedencia, motivo y especialidad', /lio_diseno: lioDiseno/.test(apiCir) && /from\('cat_modelos_lio'\)/.test(apiCir) && /procedencia: data\.procedencia/.test(apiCir) && /motivo_consulta: data\.motivo_consulta/.test(apiCir) && /especialidad_id: data\.especialidad_id/.test(apiCir));
check('API inserta cirugia_procedimientos y cirugia_personal', /from\('cirugia_procedimientos'\)[\s\S]{0,40}\.insert/.test(apiCir) && /from\('cirugia_personal'\)[\s\S]{0,40}\.insert/.test(apiCir));
check('API: la misma persona de apoyo no puede empalmarse dentro del equipo', /La misma persona de apoyo aparece dos veces en horarios que se empalman/.test(apiCir));
check('wizard: expediente con origen, procedencia y especialidad (sin motivo de consulta)', /value=\{procedencia\}/.test(wiz) && /value=\{especialidad\}/.test(wiz) && /aria-label="Origen \/ Aseguradora"/.test(wiz) && !/motivoConsulta/.test(wiz));
check('wizard: agregar otro procedimiento', /Agregar otro procedimiento/.test(wiz));
check('wizard: LIO solo con Faco + LIO, debajo de procedimiento', /\{esCirugiaConLio && \(\s*<div className="sm:col-span-2/.test(wiz) && /<SelectorModeloLio/.test(wiz) && !/5\. Lente intraocular/.test(wiz));
check('wizard: equipo homologado con roles por defecto y horario', /equipoPorDefecto\(/.test(wiz) && /aria-label="Hora de entrada"/.test(wiz) && /validarEquipo\(/.test(wiz));
const det = leer('src/app/(dashboard)/cirugias/[id]/page.tsx');
check('detalle: muestra procedencia, motivo, tipo de LIO y personal', /label="Procedencia"/.test(det) && /label="Motivo de consulta"/.test(det) && /Tipo de LIO/.test(det) && /personalApoyo\.map/.test(det));
const detApi = leer('src/app/api/cirugias/[id]/route.ts');
check('GET detalle tolera BD sin migraciones 340/350 (consultas aparte)', /from\('cirugia_personal'\)/.test(detApi) && /if \(clinicos\.data\) Object\.assign/.test(detApi));

console.log('I.2 Catálogo de modelos de LIO');
const m360 = 'src/migrations/1800000000360-CreateCatModelosLio.ts';
check('migración 360 existe', existe(m360));
if (existe(m360)) {
  const m = leer(m360);
  check('360: cat_modelos_lio con diseño, tórico, verificado y RLS', /CREATE TABLE IF NOT EXISTS cat_modelos_lio/.test(m) && /verificado BOOLEAN/.test(m) && /ENABLE ROW LEVEL SECURITY/.test(m));
  check('360: único sin distinguir mayúsculas', /lower\(fabricante\), lower\(modelo\), torico/.test(m));
  check('360: siembra desde inventario como «por verificar»', /'INVENTARIO', false/.test(m) && /SELECT sembrar_cat_modelos_lio\(\)/.test(m));
  check('360: tolera esquema marca/modelo o manufacturer/model', /'manufacturer'/.test(m) && /'marca'/.test(m));
  check('360: semilla reutilizable sembrar_cat_modelos_lio() (cylinder/add para tórico/trifocal)', /CREATE OR REPLACE FUNCTION sembrar_cat_modelos_lio/.test(m) && /'cylinder'/.test(m) && /'add_near'/.test(m));
  check('360: agenda_cirugias.modelo_lio_id', /modelo_lio_id UUID REFERENCES cat_modelos_lio/.test(m));
}
check('SQL espejo sql/patch-cat-modelos-lio.sql', existe('sql/patch-cat-modelos-lio.sql'));
const admLio = 'src/app/api/configuracion/modelos-lio/route.ts';
check('API admin de modelos de LIO solo para admin', existe(admLio) && /requireRole\(auth\.user, \['admin'\]\)/.test(leer(admLio)));
check('API admin: importación CSV omite duplicados', existe(admLio) && /omitidas/.test(leer(admLio)));
check('botón «Traer del inventario» llama a sembrar_cat_modelos_lio', existe(admLio) && /rpc\('sembrar_cat_modelos_lio'\)/.test(leer(admLio)) && /Traer del inventario/.test(leer('src/app/(dashboard)/configuracion/marcas/page.tsx')));
check('GET /api/catalogos/modelos-lio (lectura para todos)', existe('src/app/api/catalogos/modelos-lio/route.ts'));
check('pestaña Configuración → Marcas (proveedores + modelos; rutas viejas redirigen)', /\/configuracion\/marcas/.test(leer('src/app/(dashboard)/configuracion/layout.tsx')) && !/categorias-lentes|\/configuracion\/modelos-lio|\/configuracion\/proveedores/.test(leer('src/app/(dashboard)/configuracion/layout.tsx')) && /redirect\('\/configuracion\/marcas'\)/.test(leer('src/app/(dashboard)/configuracion/modelos-lio/page.tsx')));
check('wizard: tórico como bandera → fabricante → modelo', /m\.torico === torico/.test(leer('src/components/cirugia/SelectorModeloLio.tsx')) && /Fabricante/.test(leer('src/components/cirugia/SelectorModeloLio.tsx')) && /modelo_lio_id: esCirugiaConLio \? modeloLioId/.test(wiz));
check('API cirugías guarda modelo_lio_id', /modelo_lio_id: data\.modelo_lio_id/.test(apiCir));

console.log('Huecos de la auditoría (1-oct)');
const detCon = leer('src/app/(dashboard)/consultas/[id]/page.tsx');
check('detalle de consulta muestra Especialidad y Tipo de consulta', /label="Especialidad" value=\{consulta\.especialidad/.test(detCon) && /label="Tipo de consulta" value=\{etiquetaTipoConsulta/.test(detCon));
check('detalle de consulta permite editar especialidad y tipo', /body\.especialidad_id = editEspecialidadId/.test(detCon) && /valoresBdTipoConsulta\(editTipo\)/.test(detCon));
check('ya no se muestra «Tipo de Visita» crudo', !/label="Tipo de Visita"/.test(detCon));
check('GET /api/consultas/[id] devuelve especialidad (lectura tolerante)', /select\('especialidad_id, especialidad:especialidad_id \(nombre\)'\)/.test(leer('src/app/api/consultas/[id]/route.ts')));
check('agenda: «Cirugía» en un hueco abre el asistente completo', /router\.push\(`\/cirugias\/nueva\?fecha=\$\{encodeURIComponent\(fecha\)\}/.test(agenda));
check('agenda: el panel lateral solo edita (sin alta de cirugía)', /isOpen=\{showForm && !!editingId\}/.test(agenda) && !/'Nueva Cirugía'/.test(agenda));

console.log('Equipo quirúrgico homologado (horario + personal clínico)');
const m370 = 'src/migrations/1800000000370-EquipoQuirurgicoHorarios.ts';
check('migración 370 existe', existe(m370));
if (existe(m370)) {
  const m = leer(m370);
  check('370: personal_clinico con RLS', /CREATE TABLE IF NOT EXISTS personal_clinico/.test(m) && /ENABLE ROW LEVEL SECURITY/.test(m));
  check('370: horario en cirugia_personal y cirugia_participantes', /cirugia_personal[\s\S]*hora_inicio TIME/.test(m) && /cirugia_participantes[\s\S]*hora_inicio TIME/.test(m));
  check('370: varias personas por rol (quita único por rol)', /DROP CONSTRAINT IF EXISTS cirugia_personal_cirugia_id_rol_key/.test(m));
  check('370: migra nombres capturados como texto', /INSERT INTO personal_clinico[\s\S]*FROM cirugia_personal/.test(m));
}
check('SQL espejo sql/patch-equipo-quirurgico.sql', existe('sql/patch-equipo-quirurgico.sql'));
const conf = leer('src/lib/agenda-conflictos.ts');
check('conflictos: personal de apoyo contra otras cirugías', /export async function detectarConflictosPersonal/.test(conf));
check('conflictos: médicos usan su horario propio si existe', /Horario propio del participante/.test(conf));
check('API cirugías: 409 si el personal está en otra cirugía', /conflictosPersonal\.length > 0[\s\S]{0,160}status: 409/.test(apiCir));
check('API cirugías: guarda horario de médicos y personal', /update\(\{ hora_inicio: p\.hora_inicio, hora_fin: p\.hora_fin \}\)/.test(apiCir) && /personal_id: p\.personal_id/.test(apiCir));
// Personal clínico se unificó en «Personal médico» (b25): la ruta antigua redirige.
check('Personal clínico unificado en Personal médico', existe('src/app/(dashboard)/configuracion/personal-clinico/page.tsx') && /tipo=ENFERMERO/.test(leer('src/app/(dashboard)/configuracion/personal-clinico/page.tsx')));
check('wizard: alta rápida de personal desde la fila', /Registrar persona nueva/.test(wiz));
check('wizard: «Agregar participante» deja el equipo abierto', /Agregar participante/.test(wiz));

console.log('LIO: nombres limpios, inventario ligado al modelo, ESCRS');
const m380 = 'src/migrations/1800000000380-LimpiarNombresModelosLio.ts';
check('migración 380 limpia nombres con código repetido', existe(m380) && /limpiar_nombre_modelo_lio/.test(leer(m380)) && /UPDATE cat_modelos_lio/.test(leer(m380)));
check('siembra usa limpiar_nombre_modelo_lio', existe(m380) && /limpiar_nombre_modelo_lio\(%2\$s\)/.test(leer(m380)));
const sel = leer('src/components/cirugia/LIOSelector.tsx');
check('selector de inventario agrupa por modelo elegido', /modeloPreferido/.test(sel) && /Del modelo elegido/.test(sel));
check('selector avisa si la pieza no coincide con el modelo', /no coincide con el modelo elegido/.test(sel));
check('wizard pasa el modelo elegido al selector', /modeloPreferido=\{modeloLioSel\}/.test(wiz));
check('LIO en orden: modelo → pieza del modelo', /<SelectorModeloLio[\s\S]{0,2000}Paso 3: pieza física/.test(wiz) && /soloModelo/.test(wiz));
check('sin piezas del modelo: ofrece LIO manual precargado', /No hay piezas disponibles de este modelo en inventario/.test(wiz) && /setLioManualMarca\(\(v\) => v \|\| modeloLioSel\.fabricante\)/.test(wiz));
check('cambiar tipo o modelo reinicia la pieza elegida', /reiniciarPieza\(\)/.test(wiz));
check('wizard: «Buscar en ESCRS» junto al modelo', /URL_ESCRS_IOL/.test(wiz) && /Buscar en ESCRS/.test(wiz));

console.log(`\n${total - fallos.length}/${total} verificaciones OK`);
if (fallos.length) { console.log('Fallaron:\n - ' + fallos.join('\n - ')); process.exit(1); }
