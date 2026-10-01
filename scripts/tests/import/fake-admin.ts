import { randomUUID } from 'node:crypto';
type Row = Record<string, any>;
export const db: Record<string, Row[]> = {};
export const opciones = { sinColumnaPendiente: false };
const tabla = (n: string) => (db[n] ||= []);
class Q {
  private filtros: Array<(r: Row) => boolean> = [];
  private rango: [number, number] | null = null;
  private lim: number | null = null;
  private modo: 'select' | 'insert' | 'update' = 'select';
  private filas: Row[] = [];
  private cambios: Row = {};
  private cols = '*';
  private head = false;
  private contar = false;
  private unico: 'maybe' | 'single' | null = null;
  constructor(private t: string) {}
  select(cols = '*', o?: { count?: string; head?: boolean }) { this.cols = cols; this.head = !!o?.head; this.contar = !!o?.count; return this; }
  insert(f: Row | Row[]) { this.modo = 'insert'; this.filas = Array.isArray(f) ? f : [f]; return this; }
  update(c: Row) { this.modo = 'update'; this.cambios = c; return this; }
  eq(k: string, v: any) { this.filtros.push((r) => r[k] === v); return this; }
  neq(k: string, v: any) { this.filtros.push((r) => r[k] !== v); return this; }
  in(k: string, v: any[]) { this.filtros.push((r) => v.includes(r[k])); return this; }
  is(k: string, v: any) { this.filtros.push((r) => (r[k] ?? null) === v); return this; }
  order() { return this; }
  range(a: number, b: number) { this.rango = [a, b]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  single() { this.unico = 'single'; return this; }
  private proyectar(r: Row) {
    const out: Row = { ...r };
    if (this.cols.includes('pacientes:paciente_id')) out.pacientes = tabla('pacientes').find((p) => p.id === r.paciente_id) || null;
    return out;
  }
  private ejecutar(): { data: any; error: any; count?: number } {
    const usaPendiente = (o: Row) => 'pendiente_completar' in o;
    if (opciones.sinColumnaPendiente && (this.t === 'pacientes' || this.t === 'doctores')) {
      if (this.modo === 'insert' && this.filas.some(usaPendiente)) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'pendiente_completar' column" } };
      if (this.cols.includes('pendiente_completar')) return { data: null, error: { code: '42703', message: 'column pendiente_completar does not exist' } };
    }
    if (this.modo === 'insert') {
      const nuevas: Row[] = [];
      for (const f of this.filas) {
        if (this.t === 'agenda_cirugias' && !f.nombre_paciente) return { data: null, error: { message: 'null value in column nombre_paciente' } };
        if (this.t === 'agenda_cirugias' && f.ojo && !['OD', 'OI', 'OU'].includes(f.ojo)) return { data: null, error: { message: 'ojo check' } };
        nuevas.push({ id: randomUUID(), created_at: new Date().toISOString(), ...f });
      }
      tabla(this.t).push(...nuevas);
      const data = nuevas.map((r) => this.proyectar(r));
      return { data: this.unico ? data[0] ?? null : data, error: null };
    }
    let rows = tabla(this.t).filter((r) => this.filtros.every((f) => f(r)));
    if (this.modo === 'update') { rows.forEach((r) => Object.assign(r, this.cambios)); return { data: null, error: null }; }
    const count = rows.length;
    if (this.rango) rows = rows.slice(this.rango[0], this.rango[1] + 1);
    if (this.lim !== null) rows = rows.slice(0, this.lim);
    const data = rows.map((r) => this.proyectar(r));
    if (this.head) return { data: null, error: null, count };
    if (this.unico) return { data: data[0] ?? null, error: null };
    return { data, error: null, ...(this.contar ? { count } : {}) };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve(this.ejecutar()).then(res, rej); }
}
export function getSupabaseAdmin(): any { return { from: (t: string) => new Q(t) }; }
