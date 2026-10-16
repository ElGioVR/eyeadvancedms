// BD en memoria para las pruebas DoD (sin Supabase). Extiende la de scripts/tests/import.
import { randomUUID } from 'node:crypto';
type Row = Record<string, any>;
export const db: Record<string, Row[]> = {};
export const rpcLlamadas: Array<{ nombre: string; args: Row }> = [];
const tabla = (n: string) => (db[n] ||= []);
const UNICOS: Record<string, (r: Row) => string | null> = {
  pacientes: (r) => (r.numero_expediente ? String(r.numero_expediente).trim().toUpperCase() : null),
  cat_modelos_lio: (r) => `${String(r.fabricante).toLowerCase()}|${String(r.modelo).toLowerCase()}|${r.torico}`,
  catalogo_quirurgico: (r) => `${String(r.nombre).trim().toLowerCase()}|${r.ojo ?? ''}`,
};
const choca = (t: string, fila: Row, excluirId?: string) => {
  const k = UNICOS[t]?.(fila);
  return !!k && tabla(t).some((r) => r.id !== excluirId && UNICOS[t]!(r) === k);
};
const ilikeRe = (p: string) =>
  new RegExp('^' + p.replace(/\\([\\%_])|([.*+?^${}()|[\]\\])|(%)|(_)/g, (_m, esc, meta, pct, und) =>
    esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : meta ? '\\' + meta : pct ? '.*' : und ? '.' : '') + '$', 'i');

class Q {
  private filtros: Array<(r: Row) => boolean> = [];
  private rango: [number, number] | null = null;
  private lim: number | null = null;
  private modo: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private filas: Row[] = [];
  private cambios: Row = {};
  private onConflict: string[] = [];
  private devolver = false;
  private unico: 'maybe' | 'single' | null = null;
  constructor(private t: string) {}
  select(_c = '*', _o?: unknown) { if (this.modo !== 'select') this.devolver = true; return this; }
  insert(f: Row | Row[]) { this.modo = 'insert'; this.filas = Array.isArray(f) ? f : [f]; return this; }
  upsert(f: Row | Row[], o?: { onConflict?: string }) { this.modo = 'upsert'; this.filas = Array.isArray(f) ? f : [f]; this.onConflict = (o?.onConflict ?? 'id').split(','); return this; }
  update(c: Row) { this.modo = 'update'; this.cambios = c; return this; }
  delete() { this.modo = 'delete'; return this; }
  eq(k: string, v: any) { this.filtros.push((r) => r[k] === v); return this; }
  neq(k: string, v: any) { this.filtros.push((r) => r[k] !== v); return this; }
  in(k: string, v: any[]) { this.filtros.push((r) => v.includes(r[k])); return this; }
  is(k: string, v: any) { this.filtros.push((r) => (r[k] ?? null) === v); return this; }
  ilike(k: string, p: string) { const re = ilikeRe(p); this.filtros.push((r) => re.test(String(r[k] ?? ''))); return this; }
  not(k: string, op: string, v: any) {
    if (op === 'is') this.filtros.push((r) => (r[k] ?? null) !== v);
    else if (op === 'in') { const l = String(v).replace(/[()]/g, '').split(','); this.filtros.push((r) => !l.includes(String(r[k]))); }
    return this;
  }
  or() { return this; }
  order() { return this; }
  range(a: number, b: number) { this.rango = [a, b]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  single() { this.unico = 'single'; return this; }
  private salida(rows: Row[]) {
    const data = rows.map((r) => ({ ...r }));
    if (this.unico) return { data: data[0] ?? null, error: this.unico === 'single' && !data[0] ? { code: 'PGRST116', message: 'no rows' } : null };
    return { data, error: null };
  }
  private ejecutar(): { data: any; error: any } {
    const t = tabla(this.t);
    if (this.modo === 'insert') {
      const nuevas: Row[] = [];
      for (const f of this.filas) {
        const fila = { id: randomUUID(), created_at: new Date().toISOString(), ...f };
        if (choca(this.t, fila) || nuevas.some((n) => UNICOS[this.t]?.(n) && UNICOS[this.t]!(n) === UNICOS[this.t]!(fila))) {
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint (${this.t})` } };
        }
        nuevas.push(fila);
      }
      t.push(...nuevas);
      return this.salida(nuevas);
    }
    if (this.modo === 'upsert') {
      const out: Row[] = [];
      for (const f of this.filas) {
        const ex = t.find((r) => this.onConflict.every((c) => r[c] === f[c]));
        if (ex) { Object.assign(ex, f); out.push(ex); } else { const n = { id: randomUUID(), ...f }; t.push(n); out.push(n); }
      }
      return this.devolver ? this.salida(out) : { data: null, error: null };
    }
    let rows = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.modo === 'update') {
      for (const r of rows) if (choca(this.t, { ...r, ...this.cambios }, r.id)) return { data: null, error: { code: '23505', message: `duplicate key (${this.t}_numero_expediente)` } };
      rows.forEach((r) => Object.assign(r, this.cambios));
      return this.devolver ? this.salida(rows) : { data: null, error: null };
    }
    if (this.modo === 'delete') { db[this.t] = t.filter((r) => !rows.includes(r)); return { data: null, error: null }; }
    if (this.rango) rows = rows.slice(this.rango[0], this.rango[1] + 1);
    if (this.lim !== null) rows = rows.slice(0, this.lim);
    return this.salida(rows);
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve(this.ejecutar()).then(res, rej); }
}
export function getSupabaseAdmin(): any {
  return {
    from: (t: string) => new Q(t),
    rpc: async (nombre: string, args: Row) => {
      rpcLlamadas.push({ nombre, args });
      if (nombre === 'liberar_lentes_cirugia') return { data: 0, error: null };
      if (nombre === 'reservar_lente_cirugia') {
        const fila = { id: randomUUID(), cirugia_id: args.p_cirugia_id, orden: args.p_orden, origen: args.p_origen, inventario_item_id: args.p_item_id, estado: 'RESERVADO' };
        tabla('cirugia_lentes').push(fila);
        return { data: [fila], error: null };
      }
      return { data: null, error: null };
    },
  };
}
