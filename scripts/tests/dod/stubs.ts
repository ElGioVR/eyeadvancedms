// Dependencias externas que no se prueban aquí (notificaciones, devengo, empalmes).
export const registro: { conflictos: any[]; devengos: string[] } = { conflictos: [], devengos: [] };
export async function detectarConflictosAgenda() { return registro.conflictos; }
export async function detectarConflictosPersonal() { return []; }
export async function notificarAsignacion() {}
export async function notificarCancelacion() {}
export async function notificarReagendado() {}
export class MotorDevengoService {
  async devengoAutomaticoActivo() { return true; }
  async generarDesdeCirugia(id: string) { registro.devengos.push(`generar:${id}`); return {}; }
  async cancelarPorCirugia(id: string) { registro.devengos.push(`cancelar:${id}`); return { cancelados: 0 }; }
}
export async function calcularProductividadCirugia() { return null; }
export function enSegundoPlano(p: Promise<unknown>) { void p; }
