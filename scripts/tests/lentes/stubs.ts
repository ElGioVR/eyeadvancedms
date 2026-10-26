// Dependencias reemplazadas: Kardex (inventario), push y log.
import { db } from './fake-admin';
export const registro: { push: Array<{ userId: string; titulo: string; url: string }>; } = { push: [] };
export async function registrarMovimiento(m: { itemId: string; delta: number; tipo: string; usuarioId: string; referenciaId?: string | null; motivo?: string }) {
  const item = (db.inventario_items ||= []).find((i) => i.id === m.itemId);
  if (!item) return { ok: false, error: 'item no existe', status: 404 };
  item.stock = (item.stock ?? 0) + m.delta;
  (db.inventario_movimientos ||= []).push({ inventario_item_id: m.itemId, tipo: m.tipo, cantidad: m.delta, usuario_id: m.usuarioId, referencia_id: m.referenciaId, motivo: m.motivo });
  return { ok: true, stock: item.stock };
}
export async function siguienteFolioLente(intento = 0) { return `LEN-26-${String((db.inventario_items?.length ?? 0) + 1 + intento).padStart(5, '0')}`; }
export async function consumirLIO() { return { ok: true }; }
export async function enviarPush(lista: Array<{ userId: string; mensaje: { titulo: string; url: string } }>) {
  for (const l of lista) registro.push.push({ userId: l.userId, titulo: l.mensaje.titulo, url: l.mensaje.url });
}
export const log = { info() {}, warn() {}, error() {} };
export function registrarError() {}
