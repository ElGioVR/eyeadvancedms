/**
 * Reporte de trazabilidad operativa (Productividad › Trazabilidad).
 *
 * Una sola lectura del rango que alimenta todas las métricas:
 *  - canceladas (consultas / estudios / cirugías) con motivo, quién y cuándo;
 *  - por aseguradora, por tipo de consulta, por estudio, por procedimiento
 *    y por procedimiento quirúrgico (total · completadas · canceladas · pendientes).
 *
 * Solo admin (igual que el resto de Productividad).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerQuery } from '@/lib/api/validar';
import { rangoPersonalizado } from '@/lib/rangos';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { inEnLotes, leerTodo } from '@/lib/productividad/lotes';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';
import { ruta } from '@/lib/api/ruta';

export const maxDuration = 60;

const querySchema = z.object({
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  doctor_id: uuidOpcional,
});

type Estado = 'completada' | 'cancelada' | 'pendiente';
type Tipo = 'consulta' | 'estudio' | 'cirugia';

interface Evento {
  id: string;
  tipo: Tipo;
  estado: Estado;
  fecha: string | null;
  hora: string | null;
  paciente: string | null;
  doctor: string | null;
  aseguradora: string;
  monto: number;
}

interface Conteo {
  nombre: string;
  total: number;
  completadas: number;
  canceladas: number;
  pendientes: number;
}

const SIN = 'Sin registrar';

const estadoConsulta = (e: string | null): Estado => {
  const v = (e || '').toUpperCase();
  if (v === 'CANCELADA') return 'cancelada';
  if (['COMPLETADA', 'PROCESADA', 'FINALIZADA'].includes(v)) return 'completada';
  return 'pendiente';
};

const estadoCirugia = (e: string | null): Estado => {
  const v = (e || '').toLowerCase();
  if (v === 'cancelada') return 'cancelada';
  if (v === 'completada') return 'completada';
  return 'pendiente';
};

class Acum {
  private mapa = new Map<string, Conteo>();
  sumar(nombre: string | null | undefined, estado: Estado) {
    const n = (nombre || '').trim() || SIN;
    const c = this.mapa.get(n) ?? { nombre: n, total: 0, completadas: 0, canceladas: 0, pendientes: 0 };
    c.total += 1;
    if (estado === 'completada') c.completadas += 1;
    else if (estado === 'cancelada') c.canceladas += 1;
    else c.pendientes += 1;
    this.mapa.set(n, c);
  }
  lista(): Conteo[] {
    return [...this.mapa.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }
}

function contar<T>(items: T[], clave: (i: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    const k = clave(i) || SIN;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
  const rangoError = validarRango(desde, hasta);
  if (rangoError) return rangoError;

  try {
    const supabase = getSupabaseAdmin();

    const [consultas, cirugias, aseguradoras] = await Promise.all([
      leerTodo<Record<string, any>>((a, b) => {
        let qy = supabase
          .from('consultas')
          .select(
            'id, fecha, hora_inicio, estatus, tipo_consulta, tipo_visita, doctor_id, aseguranza_id, costo_total, estudio_1, estudio_2, estudio_3, procedimiento, doctores:doctor_id (alias), pacientes:paciente_id (nombre_completo)',
          )
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: true })
          .order('id', { ascending: true })
          .range(a, b);
        if (q.doctor_id) qy = qy.eq('doctor_id', q.doctor_id);
        return qy;
      }),
      leerTodo<Record<string, any>>((a, b) => {
        let qy = supabase
          .from('agenda_cirugias')
          .select('id, fecha, hora, estado, doctor_id, origen_id, servicio_id, nombre_paciente, procedimiento, doctores:doctor_id (alias)')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: true })
          .order('id', { ascending: true })
          .range(a, b);
        if (q.doctor_id) qy = qy.eq('doctor_id', q.doctor_id);
        return qy;
      }),
      supabase.from('aseguranzas').select('id, nombre').limit(2000),
    ]);

    const nombreAseg = new Map<string, string>(((aseguradoras.data as { id: string; nombre: string }[]) || []).map((a) => [a.id, a.nombre]));
    const aseg = (id: string | null | undefined) => (id ? nombreAseg.get(id) || SIN : 'Particular / sin aseguradora');

    const idsConsulta = consultas.map((c) => c.id as string);
    const idsCirugia = cirugias.map((c) => c.id as string);

    const [conceptos, histConsulta, histCirugia, proc, servicios] = await Promise.all([
      inEnLotes<Record<string, any>>(idsConsulta, (lote) =>
        supabase.from('consulta_conceptos').select('consulta_id, tipo_concepto, texto_original').in('consulta_id', lote).in('tipo_concepto', ['ESTUDIO', 'PROCEDIMIENTO']),
      ),
      inEnLotes<Record<string, any>>(
        consultas.filter((c) => estadoConsulta(c.estatus) === 'cancelada').map((c) => c.id as string),
        (lote) =>
          supabase.from('consulta_historial').select('consulta_id, usuario_id, payload, created_at').eq('tipo_evento', 'CANCELACION').in('consulta_id', lote).order('created_at', { ascending: false }),
      ),
      inEnLotes<Record<string, any>>(
        cirugias.filter((c) => estadoCirugia(c.estado) === 'cancelada').map((c) => c.id as string),
        (lote) =>
          supabase.from('cirugia_historial').select('cirugia_id, usuario_id, detalle, created_at').eq('accion', 'ESTADO_CAMBIADO').in('cirugia_id', lote).order('created_at', { ascending: false }),
      ),
      inEnLotes<Record<string, any>>(idsCirugia, (lote) => supabase.from('cirugia_procedimientos').select('cirugia_id, servicio_id').in('cirugia_id', lote)),
      inEnLotes<Record<string, any>>(
        [...new Set(cirugias.map((c) => c.servicio_id as string | null).filter(Boolean) as string[])],
        (lote) => supabase.from('aseguranza_servicios').select('id, nombre').in('id', lote),
      ),
    ]);

    // Servicios de los procedimientos adicionales (pueden no estar entre los principales)
    const idsServExtra = proc.map((p) => p.servicio_id as string | null).filter((x): x is string => !!x && !servicios.some((s) => s.id === x));
    const serviciosExtra = await inEnLotes<Record<string, any>>([...new Set(idsServExtra)], (lote) =>
      supabase.from('aseguranza_servicios').select('id, nombre').in('id', lote),
    );
    const nombreServicio = new Map<string, string>([...servicios, ...serviciosExtra].map((s) => [s.id as string, s.nombre as string]));

    // Quién canceló / motivo (el registro más reciente por cita)
    const cancelConsulta = new Map<string, { usuario_id: string | null; motivo: string | null; en: string | null }>();
    for (const h of histConsulta) {
      const id = h.consulta_id as string;
      if (!cancelConsulta.has(id)) cancelConsulta.set(id, { usuario_id: h.usuario_id || null, motivo: (h.payload as { motivo?: string } | null)?.motivo || null, en: h.created_at || null });
    }
    const cancelCirugia = new Map<string, { usuario_id: string | null; motivo: string | null; en: string | null }>();
    for (const h of histCirugia) {
      const d = (h.detalle || {}) as { a?: string; motivo?: string };
      if ((d.a || '').toLowerCase() !== 'cancelada') continue;
      const id = h.cirugia_id as string;
      if (!cancelCirugia.has(id)) cancelCirugia.set(id, { usuario_id: h.usuario_id || null, motivo: d.motivo || null, en: h.created_at || null });
    }
    const usuarioIds = [...new Set([...cancelConsulta.values(), ...cancelCirugia.values()].map((v) => v.usuario_id).filter(Boolean) as string[])];
    const usuarios = await inEnLotes<Record<string, any>>(usuarioIds, (lote) => supabase.from('usuarios').select('id, nombre').in('id', lote));
    const nombreUsuario = new Map<string, string>(usuarios.map((u) => [u.id as string, (u.nombre as string) || SIN]));

    // Conceptos por consulta
    const estudiosDe = new Map<string, string[]>();
    const procsDe = new Map<string, string[]>();
    for (const c of conceptos) {
      const mapa = c.tipo_concepto === 'ESTUDIO' ? estudiosDe : procsDe;
      const txt = (c.texto_original as string | null)?.trim();
      if (!txt) continue;
      mapa.set(c.consulta_id as string, [...(mapa.get(c.consulta_id as string) ?? []), txt]);
    }
    const adicionalesDe = new Map<string, string[]>();
    for (const p of proc) {
      const nombre = nombreServicio.get(p.servicio_id as string);
      if (nombre) adicionalesDe.set(p.cirugia_id as string, [...(adicionalesDe.get(p.cirugia_id as string) ?? []), nombre]);
    }

    const eventos: Evento[] = [];
    const porAseguradora = new Map<string, { nombre: string; consultas: number; estudios: number; cirugias: number; completadas: number; canceladas: number; pendientes: number; ingresos: number }>();
    const porTipoConsulta = new Acum();
    const porEstudio = new Acum();
    const porProcedimiento = new Acum();
    const porQx = new Acum();

    const acumAseg = (nombre: string, tipo: Tipo, estado: Estado, monto: number) => {
      const a = porAseguradora.get(nombre) ?? { nombre, consultas: 0, estudios: 0, cirugias: 0, completadas: 0, canceladas: 0, pendientes: 0, ingresos: 0 };
      if (tipo === 'consulta') a.consultas += 1;
      else if (tipo === 'estudio') a.estudios += 1;
      else a.cirugias += 1;
      if (estado === 'completada') { a.completadas += 1; a.ingresos += monto; }
      else if (estado === 'cancelada') a.canceladas += 1;
      else a.pendientes += 1;
      porAseguradora.set(nombre, a);
    };

    for (const c of consultas) {
      const estado = estadoConsulta(c.estatus);
      const esEstudio = String(c.tipo_consulta || '').toUpperCase().includes('ESTUDIO');
      const tipo: Tipo = esEstudio ? 'estudio' : 'consulta';
      const nombreAsegura = aseg(c.aseguranza_id);
      const monto = Number(c.costo_total) || 0;
      eventos.push({ id: c.id, tipo, estado, fecha: c.fecha, hora: c.hora_inicio, paciente: c.pacientes?.nombre_completo ?? null, doctor: c.doctores?.alias ?? null, aseguradora: nombreAsegura, monto });
      acumAseg(nombreAsegura, tipo, estado, monto);
      porTipoConsulta.sumar(etiquetaTipoConsulta(c.tipo_consulta, c.tipo_visita), estado);

      const estudios = estudiosDe.get(c.id) ?? [c.estudio_1, c.estudio_2, c.estudio_3].filter((x): x is string => !!x && !!String(x).trim());
      for (const e of new Set(estudios.map((x) => String(x).trim()))) porEstudio.sumar(e, estado);
      const procs = procsDe.get(c.id) ?? (c.procedimiento ? [String(c.procedimiento).trim()] : []);
      for (const p of new Set(procs)) porProcedimiento.sumar(p, estado);
    }

    for (const c of cirugias) {
      const estado = estadoCirugia(c.estado);
      const nombreAsegura = aseg(c.origen_id);
      eventos.push({ id: c.id, tipo: 'cirugia', estado, fecha: c.fecha, hora: c.hora, paciente: c.nombre_paciente ?? null, doctor: c.doctores?.alias ?? null, aseguradora: nombreAsegura, monto: 0 });
      acumAseg(nombreAsegura, 'cirugia', estado, 0);
      const principal = (c.servicio_id && nombreServicio.get(c.servicio_id)) || c.procedimiento || null;
      const nombres = new Set<string>([...(principal ? [String(principal)] : []), ...(adicionalesDe.get(c.id) ?? [])]);
      if (nombres.size === 0) porQx.sumar(null, estado);
      for (const n of nombres) porQx.sumar(n, estado);
    }

    const canceladas = eventos
      .filter((e) => e.estado === 'cancelada')
      .map((e) => {
        const info = e.tipo === 'cirugia' ? cancelCirugia.get(e.id) : cancelConsulta.get(e.id);
        return {
          id: e.id,
          tipo: e.tipo,
          fecha: e.fecha,
          hora: e.hora,
          paciente: e.paciente,
          doctor: e.doctor,
          aseguradora: e.aseguradora,
          motivo: info?.motivo ?? null,
          cancelado_por: info?.usuario_id ? nombreUsuario.get(info.usuario_id) ?? null : null,
          cancelado_en: info?.en ?? null,
        };
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (a.hora || '').localeCompare(b.hora || ''));

    const porTipoEvento = (tipo: Tipo) => {
      const l = eventos.filter((e) => e.tipo === tipo);
      return { total: l.length, canceladas: l.filter((e) => e.estado === 'cancelada').length, completadas: l.filter((e) => e.estado === 'completada').length };
    };

    return NextResponse.json({
      desde,
      hasta,
      totales: { consultas: porTipoEvento('consulta'), estudios: porTipoEvento('estudio'), cirugias: porTipoEvento('cirugia') },
      canceladas: {
        total: canceladas.length,
        por_tipo: contar(canceladas, (f) => f.tipo),
        por_motivo: contar(canceladas, (f) => f.motivo),
        por_quien: contar(canceladas, (f) => f.cancelado_por),
        por_doctor: contar(canceladas, (f) => f.doctor),
        por_aseguradora: contar(canceladas, (f) => f.aseguradora),
        filas: canceladas,
      },
      por_aseguradora: [...porAseguradora.values()].sort((a, b) => b.consultas + b.estudios + b.cirugias - (a.consultas + a.estudios + a.cirugias)),
      por_tipo_consulta: porTipoConsulta.lista(),
      por_estudio: porEstudio.lista(),
      por_procedimiento: porProcedimiento.lista(),
      por_procedimiento_quirurgico: porQx.lista(),
    });
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.trazabilidad', 'Error interno del servidor');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = ruta('productividad/reportes/trazabilidad#GET', manejarGET);
