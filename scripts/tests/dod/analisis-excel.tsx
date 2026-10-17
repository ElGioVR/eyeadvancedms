// Simula la importación del Excel real y cuenta «Por completar» con las mismas reglas de la bandeja.
import { readFileSync } from 'node:fs';
import { db } from './fake-admin';
import { POST } from '@/app/api/agenda/import/route';
import { faltantesCirugia } from '@/lib/por-completar';
async function main() {
  const conAnest = process.argv.includes('--anestesiologos');
  db.doctores = conAnest ? [
    { id: 'a-crystal', alias: 'DRA CRYSTAL', nombre: 'Crystal', activo: true, tipo_personal: 'ANESTESIOLOGO' },
    { id: 'a-cyntar', alias: 'CYNTAR', nombre: null, activo: true, tipo_personal: 'ANESTESIOLOGO' },
  ] : [];
  db.cat_roles_participante = [{ id: 'r-cir', clave: 'cirujano' }, { id: 'r-an', clave: 'anestesiologo' }];
  db.pacientes = []; db.agenda_cirugias = []; db.aseguranzas = []; db.cirugia_lentes = []; db.cirugia_participantes = [];
  const fd = new FormData();
  fd.append('file', new File([readFileSync(process.argv[2])], 'CIRUGIAS 2026 1.xlsx'));
  fd.append('tipo', 'cirugias'); fd.append('confirmar', 'true');
  const res = await POST(new Request('http://x/api/agenda/import', { method: 'POST', body: fd }));
  const j: any = await res.json();
  const cx = db.agenda_cirugias;
  const cuenta = (e: string) => cx.filter((c) => c.estado === e).length;
  console.log(`Guardadas ${cx.length}: completadas (historial) ${cuenta('completada')}, agendadas ${cuenta('agendada')}, por programar ${cuenta('aplazada')}, canceladas ${cuenta('cancelada')}`);
  const abiertas = cx.filter((c) => !['completada', 'cancelada', 'reagendada'].includes(c.estado));
  const motivos = new Map<string, number>(); let pend = 0; let soloFaltan = 0; let soloInfo = 0; const combos = new Map<string, number>();
  for (const c of abiertas) {
    const f = faltantesCirugia({ ...c, lentes: db.cirugia_lentes.filter((l) => l.cirugia_id === c.id && l.estado !== "LIBERADO") as any });
    if (f.faltan.length || f.info.length) pend++; if (f.faltan.length) soloFaltan++; else if (f.info.length) soloInfo++; if (f.faltan.length) { const k = c.estado + ":" + f.faltan.join("+"); combos.set(k, (combos.get(k) ?? 0) + 1); }
    for (const m of [...f.faltan, ...f.info]) motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }
  console.log(`Por completar: ${pend} (faltan datos ${soloFaltan}, solo logística de lente ${soloInfo})`, Object.fromEntries(motivos)); console.log(Object.fromEntries(combos));
  console.log('Anestesiólogo asignado:', db.cirugia_participantes.filter((p) => p.rol_id === 'r-an').length, '· cirujano en equipo:', db.cirugia_participantes.filter((p) => p.rol_id === 'r-cir').length);
  console.log('Lentes de historial usados:', db.cirugia_lentes.filter((l) => l.estado === 'USADO').length, '· errores:', j.errores);
  for (const a of j.avisos || []) if (/anestesi|realizad|sin hora/i.test(a)) console.log('· ' + a);
}
main().catch((e) => { console.error(e); process.exit(1); });
