#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B25 — Personal unificado (médicos + enfermería) y rol «enfermero».
 * Aserciones textuales; no conecta a BD.
 */
'use strict';
const fs = require('fs');
require('./_modulos-divididos');
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

console.log('BD (migración 390)');
const mig = 'src/migrations/1800000000390-PersonalUnificado.ts';
check('migración 390 existe', existe(mig));
const m = existe(mig) ? leer(mig) : '';
check('doctores.tipo_personal (MEDICO | ENFERMERO) y cobra_honorarios', /tipo_personal TEXT NOT NULL DEFAULT 'MEDICO'/.test(m) && /cobra_honorarios BOOLEAN NOT NULL DEFAULT true/.test(m) && /'MEDICO', 'ENFERMERO'/.test(m));
check('rol de participante «enfermero»', /INSERT INTO cat_roles_participante[\s\S]*'enfermero'/.test(m));
check('rol de usuario «enfermero» (enum o CHECK)', /ADD VALUE/.test(m) && /recepcionista/.test(m) && /enfermero/.test(m));
check('migra personal_clinico → doctores ENFERMERO sin honorarios', /INSERT INTO doctores[\s\S]*'ENFERMERO', false/.test(m));
check('migra cirugia_personal → cirugia_participantes', /INSERT INTO cirugia_participantes[\s\S]*FROM cirugia_personal/.test(m));
check('guardia en BD: sin honorarios no se insertan eventos ni productividad', /trg_eventos_honorario_sin_cobro/.test(m) && /trg_cirugia_productividad_sin_cobro/.test(m));
check('SQL espejo sql/patch-personal-unificado.sql', existe('sql/patch-personal-unificado.sql'));

console.log('Servidor');
check('UserRole incluye enfermero', /'enfermero'/.test(leer('src/lib/supabase/server.ts')));
check('doctorRequerido acota a lo propio también a enfermería', /perfil\?\.rol === 'enfermero'/.test(leer('src/lib/consultas-acceso.ts')));
const ag = leer('src/app/api/agenda/route.ts');
check('agenda: enfermería entra y ve solo lo propio', /ROLES_AGENDA = \['admin', 'doctor', 'recepcionista', 'enfermero'\]/.test(ag) && /const propia = userRole === 'doctor' \|\| userRole === 'enfermero'/.test(ag));
check('agenda: ocupación incluye participaciones en cirugías', /from\('cirugia_participantes'\)[\s\S]{0,200}eq\('medico_id', doctorFiltro\)/.test(ag));
check('agenda: consultas incluyen estudios asignados a la persona', /estudio_1_doctor_id\.eq\.\$\{doctorFiltro\}/.test(ag));
const me = leer('src/app/api/usuarios/me/route.ts');
check('/api/usuarios/me devuelve tipo_personal y cobra_honorarios', /tipo_personal:/.test(me) && /cobra_honorarios:/.test(me));
check('mis-honorarios: 403 si la ficha no cobra honorarios', /Tu perfil no tiene honorarios activos/.test(leer('src/app/api/productividad/mis-honorarios/route.ts')));
const doc = leer('src/app/api/configuracion/doctores/route.ts');
check('API de personal acepta tipo_personal y cobra_honorarios', /tipo_personal: tipoPersonal\.optional\(\)/.test(doc) && /cobra_honorarios: z\.boolean\(\)\.optional\(\)/.test(doc));
check('vínculo usuario: permite rol enfermero', /\['doctor', 'admin', 'enfermero'\]/.test(doc));
check('usuarios: rol enfermero válido', /'recepcionista', 'enfermero'\]/.test(leer('src/app/api/configuracion/usuarios/route.ts')));
const con = leer('src/app/api/consultas/route.ts');
check('consultas: enfermería solo en tipo Estudios y con honorarios', /Enfermería solo puede atender consultas de tipo Estudios/.test(con));

console.log('Pantallas');
const lay = leer('src/app/(dashboard)/configuracion/layout.tsx');
check('una sola pestaña «Personal médico» (sin «Personal clínico»)', /'Personal médico'/.test(lay) && !/'Personal clínico'/.test(lay));
check('/configuracion/personal-clinico redirige al personal unificado', /redirect\('\/configuracion\/doctores\?tipo=ENFERMERO'\)/.test(leer('src/app/(dashboard)/configuracion/personal-clinico/page.tsx')));
const pg = leer('src/app/(dashboard)/configuracion/doctores/page.tsx');
check('ficha: tipo de personal, cobra honorarios y filtro Médicos/Enfermería', /Tipo de personal/.test(pg) && /Cobra honorarios/.test(pg) && /'Enfermería'\]\] as const/.test(pg));
const wiz = leer('src/app/(dashboard)/cirugias/nueva/page.tsx');
check('cirugía: todo el equipo va como participantes', /participantes: participantes\s*\.filter\(\(m\) => m\.personaId\)/.test(wiz) && !/personal: participantes/.test(wiz));
check('cirugía: roles de apoyo listan enfermería primero', /apoyo \? \[\.\.\.enfermeria, \.\.\.medicosLista\]/.test(wiz));
check('cirugía: alta rápida crea enfermería en Personal médico', /tipo_personal: 'ENFERMERO', cobra_honorarios: false/.test(wiz));
const cn = leer('src/app/(dashboard)/consultas/nueva/page.tsx');
check('consulta: estudios pueden asignarse a enfermería con honorarios', /personalEstudios\.map/.test(cn) && /cobra_honorarios !== false/.test(cn));
check('consulta: procedimientos solo médicos', /setProcedimientoDoctor\(index, e\.target\.value\)[\s\S]{0,800}medicos\.map/.test(cn));
const nav = leer('src/components/layout/DoctorBottomNav.tsx');
check('móvil: «Honorarios» solo con honorarios activos', /item\.href === '\/mis-honorarios'\) return user\.cobra_honorarios/.test(nav));
check('móvil: enfermería ve agenda, pacientes y perfil; inventario con honorarios', /const enfermeriaItems/.test(nav) && /esEnfermero && item\.href === '\/inventario'\) return user\.cobra_honorarios === true/.test(nav));
const sb = leer('src/components/layout/Sidebar.tsx');
check('menú lateral: enfermería agenda, pacientes, configuración e inventario con honorarios', /item\.href === '\/inventario'\) return user\.cobra_honorarios === true/.test(sb) && /'\/pacientes' \|\| item\.href === '\/configuracion'/.test(sb));
check('dashboard: enfermería va a su agenda', /rol === 'enfermero'\) redirect\('\/agenda'\)/.test(leer('src/app/(dashboard)/dashboard/page.tsx')));
check('agenda: enfermería sin acciones de edición', /function esRolPropio/.test(leer('src/app/(dashboard)/agenda/AgendaContent.tsx')) && /userRol === 'enfermero'\) return \[\]/.test(leer('src/lib/agenda-acciones.ts')));

console.log('API: rol restringido');
for (const f of ['src/app/api/dashboard/route.ts', 'src/app/api/dashboard/charts/route.ts', 'src/app/api/cirugias/[id]/productividad/route.ts', 'src/app/api/catalogo-servicios/route.ts']) {
  check(`${f}: enfermería recibe 403`, /auth\.perfil\?\.rol === 'enfermero'\)[\s\S]{0,120}status: 403/.test(leer(f)));
}

console.log('Enfermería: pacientes, inventario y configuración');
const pacL = leer('src/app/api/pacientes/route.ts');
check('pacientes: GET permite enfermería, POST no', /GET[\s\S]*?'recepcionista', 'enfermero'\]/.test(pacL) && !/POST[\s\S]*'enfermero'/.test(pacL.slice(pacL.indexOf('export async function POST'))));
const pacId = leer('src/app/api/pacientes/[id]/route.ts');
check('paciente: enfermería lee sin cobros y no edita', /verCobros = auth\.perfil\?\.rol !== 'enfermero'/.test(pacId) && /PATCH[\s\S]*requireRole\(auth\.user, \['admin', 'recepcionista'\]\)/.test(pacId));
check('historial: solo lectura para enfermería', /soloLectura = user\?\.rol === 'enfermero'/.test(leer('src/app/(dashboard)/pacientes/[id]/historial/page.tsx')) && /soloLectura \? undefined/.test(leer('src/app/(dashboard)/pacientes/page.tsx')));
const acc = leer('src/lib/acceso-enfermeria.ts');
check('inventario: enfermería exige cobra_honorarios', /cobra_honorarios === true/.test(acc) && /perfil\.rol === 'enfermero'/.test(acc));
for (const f of ['src/app/api/inventario/route.ts', 'src/app/api/inventario/movimientos/route.ts', 'src/app/api/inventario/disponible/route.ts']) {
  check(`${f}: usa requireRoleInventario`, /requireRoleInventario\(auth\.user/.test(leer(f)) && !/requireRole\(auth\.user/.test(leer(f)));
}
check('inventario UI: enfermería con honorarios puede editar/eliminar', /puedeEscribir = [^;]*enfermeroConInventario/.test(leer('src/app/(dashboard)/inventario/page.tsx')));
const cfg = leer('src/app/(dashboard)/configuracion/layout.tsx');
check('configuración: enfermería solo Perfil y Sistema', /TABS_ENFERMERIA = new Set\(\['\/configuracion', '\/configuracion\/sistema'\]\)/.test(cfg) && /router\.replace\('\/configuracion'\)/.test(cfg));
check('búsqueda: enfermería sin consultas/cobros; lentes con honorarios', /verLentes = !esEnfermero \|\| \(await enfermeroCobraHonorarios/.test(leer('src/app/api/search/route.ts')));

console.log('Visor de archivos (móvil)');
const det = leer('src/app/(dashboard)/cirugias/[id]/page.tsx');
check('visor: barra con safe-area superior', /pt-\[calc\(0\.75rem\+env\(safe-area-inset-top\)\)\]/.test(det));
check('visor: botón Cerrar inferior en móvil', /sm:hidden"[\s\S]{0,200}setPreview\(null\)[\s\S]{0,200}Cerrar/.test(det));
check('visor: botón atrás del celular cierra', /addEventListener\('popstate'/.test(det) && /pushState\(\{ visorArchivo: true \}/.test(det));

console.log(`\n${total - fallos.length}/${total} verificaciones OK`);
if (fallos.length) { console.log('Fallaron:\n - ' + fallos.join('\n - ')); process.exit(1); }
