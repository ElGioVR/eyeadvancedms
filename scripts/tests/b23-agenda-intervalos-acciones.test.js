#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B23 — Modificaciones agenda (puntos III y IV).
 * Aserciones textuales sobre el repo (no conecta a BD ni ejecuta migraciones):
 *  III. Intervalos de 15 min y sin empalmes para el mismo médico.
 *  IV.  Aplazar / reagendar / cancelar / agendar desde la agenda.
 * La lógica pura se prueba en src/lib/__tests__/agenda-slots.test.ts (npm run test:unit).
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

console.log('III. Intervalos y empalmes');
const slots = leer('src/lib/agenda-slots.ts');
check('agenda-slots: DURACION_CITA_MIN = 15', /DURACION_CITA_MIN\s*=\s*15\b/.test(slots));

const post = leer('src/app/api/consultas/route.ts');
check('POST /api/consultas importa detectarConflictosAgenda', /import \{[^}]*detectarConflictosAgenda[^}]*\} from '@\/lib\/agenda-conflictos'/.test(post));
check('POST /api/consultas detecta conflictos del médico', /detectarConflictosAgenda\(\{[\s\S]*?medicos: \[data\.doctor_id\]/.test(post));
check('POST /api/consultas responde 409 ante conflicto', /conflictos\.length > 0[\s\S]{0,200}status: 409/.test(post));
check('POST /api/consultas traduce el rechazo de BD (esEmpalmeAgenda) a 409', /esEmpalmeAgenda\(consultaError\)[\s\S]{0,200}status: 409/.test(post));
check('defaultHoraFin usa DURACION_CITA_MIN (antes 30 min fijos)', /function defaultHoraFin[\s\S]{0,300}DURACION_CITA_MIN/.test(post));
check('verificación en paralelo con las demás lecturas (Promise.all)', /Promise\.all\(\[[\s\S]*?detectarConflictosAgenda\(/.test(post));

const lib = leer('src/lib/agenda-conflictos.ts');
check('consultas CANCELADAS liberan el horario', /estatus\.neq\.CANCELADA/.test(lib) && /neq\('consultas\.estatus', 'CANCELADA'\)/.test(lib));
check('lib exporta esEmpalmeAgenda (23P01)', /export function esEmpalmeAgenda[\s\S]*23P01/.test(lib));

for (const f of ['src/app/api/consultas/[id]/route.ts', 'src/app/api/consultas/[id]/acciones/route.ts']) {
  check(`${f}: mapea EMPALME_AGENDA a 409`, /esEmpalmeAgenda\([\s\S]{0,160}status: 409/.test(leer(f)));
}

const disp = 'src/app/api/agenda/disponibilidad/route.ts';
check('existe GET /api/agenda/disponibilidad', existe(disp));
if (existe(disp)) {
  const d = leer(disp);
  check('disponibilidad valida sesión y rol', /requireAuth\(\)/.test(d) && /requireRole\(/.test(d));
  check('disponibilidad reutiliza detectarConflictosAgenda', /detectarConflictosAgenda\(/.test(d));
  check('disponibilidad no expone datos del paciente', !/nombre_paciente|paciente_id/.test(d));
}

const mig = 'src/migrations/1800000000320-AgendaSinEmpalmesConsultas.ts';
check('migración anti-empalmes existe', existe(mig));
if (existe(mig)) {
  const m = leer(mig);
  check('migración: advisory lock por médico+fecha', /pg_advisory_xact_lock/.test(m));
  check('migración: ERRCODE 23P01 / EMPALME_AGENDA', /23P01/.test(m) && /EMPALME_AGENDA/.test(m));
  check('migración: columna permite_empalme', /permite_empalme BOOLEAN NOT NULL DEFAULT false/.test(m));
  check('migración: UPDATE solo revalida si cambia horario/médico', /BEFORE UPDATE ON consultas[\s\S]*WHEN \(/.test(m));
  check('migración: down() revierte', /DROP FUNCTION IF EXISTS consultas_validar_empalme/.test(m));
}
check('SQL espejo en sql/patch-agenda-sin-empalmes.sql', existe('sql/patch-agenda-sin-empalmes.sql'));
check('importación histórica marca permite_empalme', /permite_empalme: true/.test(leer('src/app/api/agenda/import/route.ts')));

const nueva = leer('src/app/(dashboard)/consultas/nueva/page.tsx');
check('consultas/nueva usa SelectorHoraSlot', /<SelectorHoraSlot[\s\S]{0,200}medicoId=\{consultationData\.doctorId\}/.test(nueva));
check('consultas/nueva ya no suma 30 min fijos', !/addMinutesToTime\([^)]*, 30\)/.test(nueva));

console.log('IV. Acciones rápidas');
const agenda = leer('src/app/(dashboard)/agenda/AgendaContent.tsx');
check('agenda importa AccionRapidaModal y AgendarRapidoModal', /AccionRapidaModal/.test(agenda) && /AgendarRapidoModal/.test(agenda));
check('clic en consulta ya NO navega al perfil', !/if \(c\.tipo === 'consulta'\) \{\s*router\.push/.test(agenda));
check('popover muestra acciones según accionesDisponibles', /accionesDisponibles\(cirugia, userRol\)/.test(agenda));
check('actualizarEvento rutea consultas a /api/consultas', /esConsulta \? `\/api\/consultas\/\$\{id\}`/.test(agenda));
check('cambio de estado de cirugía envía motivo', /estado: s, motivo:/.test(agenda));
check('hueco vacío abre alta rápida (sin salir de la agenda)', /setAgendarRapido\(\{ fecha, hora, tipo: 'PRIMERA' \}\)/.test(agenda));
check('vista móvil recibe acciones rápidas', /getAcciones=\{\(c\) => accionesDisponibles\(c, userRol\)\}/.test(agenda));

const comp = leer('src/components/agenda/AccionesRapidasAgenda.tsx');
check('consultas usan /api/consultas/[id]/acciones', /\/api\/consultas\/\$\{evento\.id\}\/acciones/.test(comp));
check('motivo obligatorio en el modal', /motivo\.trim\(\)\.length > 0/.test(comp));
check('reagendar/aplazar usan SelectorHoraSlot con excluirId', /<SelectorHoraSlot[\s\S]{0,400}excluirId=\{evento\.id\}/.test(comp));

const movil = leer('src/components/agenda/MobileCalendarView.tsx');
check('MobileCalendarView renderiza botones de acción', /onAccion\(c, a\)/.test(movil));

console.log(`\n${total - fallos.length}/${total} verificaciones OK`);
if (fallos.length) { console.log('Fallaron:\n - ' + fallos.join('\n - ')); process.exit(1); }
