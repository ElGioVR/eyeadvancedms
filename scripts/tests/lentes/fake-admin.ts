// BD en memoria con lo mínimo del cliente de Supabase que usa el flujo de lentes.
import { randomUUID } from 'node:crypto';
type Row = Record<string, any>;
export const db: Record<string, Row[]> = {};
/** Simula una BD sin sql/patch-lente-recibido-notificacion.sql. */
export const opciones = { sinColumnaCreadoPor: false };
const tabla = (n: string) => (db[n] ||= []);
const errCol = { code: '42703', message: 'column cirugia_lentes.creado_por does not exist' };
class Q {
  private filtros: Array<(r: Row) => boolean> = [];
  private lim: number | null = null;
  private modo: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private filas: Row[] = [];
  private cambios: Row = {};
  private cols: string | null = null;
  private unico: 'maybe' | 'single' | null = null;
  private conflicto: string[] = [];
  constructor(private t: string) {}
  select(cols = '*') { this.cols = cols; return this; }
  insert(f: Row | Row[]) { this.modo = 'insert'; this.filas = Array.isArray(f) ? f : [f]; return this; }
  upsert(f: Row | Row[], o?: { onConflict?: string }) { this.modo = 'upsert'; this.filas = Array.isArray(f) ? f : [f]; this.conflicto = (o?.onConflict ?? 'id').split(','); return this; }
  update(c: Row) { this.modo = 'update'; this.cambios = c; return this; }
  eq(k: string, v: any) { this.filtros.push((r) => r[k] === v); return this; }
  in(k: string, v: any[]) { this.filtros.push((r) => v.includes(r[k])); return this; }
  is(k: string, v: any) { this.filtros.push((r) => (r[k] ?? null) === v); return this; }
  like(k: string, p: string) { const pre = p.replace('%', ''); this.filtros.push((r) => String(r[k] ?? '').startsWith(pre)); return this; }
  order() { return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  single() { this.unico = 'single'; return this; }
  private proyectar(r: Row) {
    const out: Row = { ...r };
    if (this.cols?.includes('agenda_cirugias!inner')) out.agenda_cirugias = tabla('agenda_cirugias').find((c) => c.id === r.cirugia_id) ?? null;
    return out;
  }
  private ejecutar(): { data: any; error: any } {
    const tocaCreadoPor = this.t === 'cirugia_lentes' && opciones.sinColumnaCreadoPor
      && ((this.cols ?? '').includes('creado_por') || 'creado_por' in this.cambios || this.filas.some((f) => 'creado_por' in f));
    if (tocaCreadoPor) return { data: null, error: errCol };
    if (this.modo === 'insert' || this.modo === 'upsert') {
      const out: Row[] = [];
      for (const f of this.filas) {
        const previo = this.modo === 'upsert' ? tabla(this.t).find((r) => this.conflicto.every((k) => r[k] === f[k])) : null;
        if (previo) { Object.assign(previo, f); out.push(previo); }
        else { const n = { id: randomUUID(), created_at: new Date().toISOString(), ...f }; tabla(this.t).push(n); out.push(n); }
      }
      const data = out.map((r) => this.proyectar(r));
      return { data: this.unico ? data[0] ?? null : data, error: null };
    }
    let rows = tabla(this.t).filter((r) => this.filtros.every((f) => f(r)));
    if (this.modo === 'update') {
      rows.forEach((r) => Object.assign(r, this.cambios));
      return { data: this.cols ? rows.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.t === 'agenda_cirugias' && this.cols?.includes('agenda_cirugias!inner')) rows = rows.filter((r) => r.agenda_cirugias);
    if (this.cols?.includes('agenda_cirugias!inner')) rows = rows.filter((r) => tabla('agenda_cirugias').some((c) => c.id === r.cirugia_id));
    if (this.lim !== null) rows = rows.slice(0, this.lim);
    const data = rows.map((r) => this.proyectar(r));
    if (this.unico) return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve(this.ejecutar()).then(res, rej); }
}
export function getSupabaseAdmin(): any {
  return {
    from: (t: string) => new Q(t),
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'rpc no disponible en la prueba' } }),
  };
}
