import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  contarMetricasConceptos,
  mergeMetricas,
  metricasVacias,
  resolverFuenteHonorario,
  type MetricasLigados,
} from '@/lib/productividad/resolver-fuente';
import { inEnLotes, leerTodo, leerTodoEnLotes } from '@/lib/productividad/lotes';

type OrigenTipo = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO' | 'CITA' | 'OPERACION';
type RolDoctor = 'PRINCIPAL' | 'AYUDANTE' | 'ANESTESIOLOGO' | 'INTERPRETACION' | 'REFERIDOR' | 'CIRUJANO_PRINCIPAL' | 'INSTRUMENTISTA' | 'CIRCULANTE';
type RolEvento = 'PRINCIPAL' | 'AYUDANTE' | 'ANESTESIOLOGO' | 'INTERPRETACION' | 'REFERIDOR';

interface EventoDevengoInput {
  origen_tipo: OrigenTipo;
  origen_id: string;
  doctor_id: string;
  rol: RolDoctor;
  paciente_id: string | null;
  fecha_servicio: string;
  monto_base: number;
  tarifa_snapshot: Record<string, unknown>;
  moneda?: string;
  cantidad?: number;
  metricas_ligados?: MetricasLigados;
}

function normalizarMoneda(valor?: string | null): string {
  const v = (valor || '').trim().toUpperCase();
  if (v === 'USD' || v === 'DOLAR' || v === 'DOLARES') return 'USD';
  if (v === 'MXN' || v === 'PESO' || v === 'PESOS' || v === '') return 'MXN';
  if (v.length <= 3) return v;
  return 'MXN';
}

const ROLES_EVENTO: ReadonlySet<string> = new Set([
  'PRINCIPAL',
  'AYUDANTE',
  'ANESTESIOLOGO',
  'INTERPRETACION',
  'REFERIDOR',
]);

function normalizarRolEvento(rol: RolDoctor | string): RolEvento {
  const v = (rol || '').trim().toUpperCase();
  if (ROLES_EVENTO.has(v)) return v as RolEvento;
  if (v === 'CIRUJANO_PRINCIPAL') return 'PRINCIPAL';
  if (v === 'INSTRUMENTISTA' || v === 'CIRCULANTE') return 'AYUDANTE';
  return 'PRINCIPAL';
}

export interface ResultadoDevengo {
  eventos_creados: number;
  eventos_existentes: number;
  ligados_sin_linea: number;
  reportar_doctor_distinto: string[];
  deployed?: boolean;
}

function resultadoVacio(): ResultadoDevengo {
  return {
    eventos_creados: 0,
    eventos_existentes: 0,
    ligados_sin_linea: 0,
    reportar_doctor_distinto: [],
    deployed: false,
  };
}

const ESTATUS_DEVENGABLES = ['AGENDADA', 'PROCESADA', 'COMPLETADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA'];

export class MotorDevengoService {
  private supabase = getSupabaseAdmin();
  /**
   * Periodo de pago por fecha de servicio, memorizado durante la vida de la
   * instancia (un request): en un sync muchas filas comparten fecha y antes
   * se hacía 1 viaje por evento creado.
   */
  private periodoPorFecha = new Map<string, Promise<string | null>>();

  async marcarDeployed(tabla: 'consultas' | 'agenda_cirugias', id: string): Promise<void> {
    await this.supabase
      .from(tabla)
      .update({ deployed_to_performance: true, deployed_at: new Date().toISOString() })
      .eq('id', id);
  }

  async listarPendientesDespliegue(
    fechaDesde?: string | null,
    fechaHasta?: string | null
  ): Promise<{
    consultas_pendientes: number;
    cirugias_pendientes: number;
    doctores_sin_evento: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string }>;
    doctores_en_modulo: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string; eventos: number }>;
    doctores_total: number;
  }> {
    const supabase = this.supabase;
    const gte = fechaDesde || '1970-01-01';
    const lte = fechaHasta || '2999-12-31';

    // Paginado: antes un rango con >1000 filas se truncaba en silencio
    // (límite por defecto de PostgREST) y los conteos salían cortos.
    const [consultas, cirugias] = await Promise.all([
      leerTodo<{ id: string; doctor_id: string | null; fecha: string; estatus: string; deployed_to_performance: boolean | null }>(
        (a, b) =>
          supabase
            .from('consultas')
            .select('id, doctor_id, fecha, estatus, deployed_to_performance')
            .gte('fecha', gte)
            .lte('fecha', lte)
            .in('estatus', ESTATUS_DEVENGABLES)
            .order('id', { ascending: true })
            .range(a, b)
      ),
      leerTodo<{ id: string; doctor_id: string | null; fecha: string; estado: string; deployed_to_performance: boolean | null; consulta_id: string | null }>(
        (a, b) =>
          supabase
            .from('agenda_cirugias')
            .select('id, doctor_id, fecha, estado, deployed_to_performance, consulta_id')
            .gte('fecha', gte)
            .lte('fecha', lte)
            .neq('estado', 'cancelada')
            .order('id', { ascending: true })
            .range(a, b)
      ),
    ]);

    const doctoresSinEvento: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string }> = [];
    const doctoresEnModulo: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string; eventos: number }> = [];
    const doctorIds = new Set<string>();

    // ── Precarga batch (evita N+1): conceptos, doctores de cirugía y eventos ──
    const consultaIds = consultas.map((c) => c.id);
    const cirugiaIds = cirugias.map((c) => c.id);

    // Las 4 lecturas son independientes: en paralelo, cada una por lotes de ids
    // y paginada (un lote de 150 consultas puede tener >1000 conceptos).
    const [ccRows, agdRows, partRows, evs] = await Promise.all([
      leerTodoEnLotes<{ id: string; consulta_id: string; doctor_id: string | null }>(consultaIds, (l, a, b) =>
        supabase
          .from('consulta_conceptos')
          .select('id, consulta_id, doctor_id')
          .in('consulta_id', l)
          .order('id', { ascending: true })
          .range(a, b)
      ),
      leerTodoEnLotes<{ id: string; cirugia_id: string; doctor_id: string | null }>(cirugiaIds, (l, a, b) =>
        supabase
          .from('agenda_cirugia_doctores')
          .select('id, cirugia_id, doctor_id')
          .in('cirugia_id', l)
          .order('id', { ascending: true })
          .range(a, b)
      ),
      leerTodoEnLotes<{ id: string; cirugia_id: string; medico_id: string | null }>(cirugiaIds, (l, a, b) =>
        supabase
          .from('cirugia_participantes')
          .select('id, cirugia_id, medico_id')
          .in('cirugia_id', l)
          .order('id', { ascending: true })
          .range(a, b)
      ),
      // Eventos existentes por (origen_tipo, origen_id, doctor_id)
      leerTodoEnLotes<{ id: string; origen_tipo: string; origen_id: string; doctor_id: string | null }>(
        [...consultaIds, ...cirugiaIds],
        (l, a, b) =>
          supabase
            .from('eventos_honorario')
            .select('id, origen_tipo, origen_id, doctor_id')
            .in('origen_tipo', ['CONSULTA', 'OPERACION'])
            .in('origen_id', l)
            .neq('estado', 'CANCELADO')
            .order('id', { ascending: true })
            .range(a, b)
      ),
    ]);

    const conceptosPorConsulta = new Map<string, Array<{ doctor_id: string | null }>>();
    for (const cc of ccRows) {
      const arr = conceptosPorConsulta.get(cc.consulta_id) || [];
      arr.push({ doctor_id: cc.doctor_id });
      conceptosPorConsulta.set(cc.consulta_id, arr);
    }

    const agdPorCirugia = new Map<string, Set<string>>();
    const partPorCirugia = new Map<string, Set<string>>();
    for (const r of agdRows) {
      if (!r.doctor_id) continue;
      if (!agdPorCirugia.has(r.cirugia_id)) agdPorCirugia.set(r.cirugia_id, new Set());
      agdPorCirugia.get(r.cirugia_id)!.add(r.doctor_id);
    }
    for (const r of partRows) {
      if (!r.medico_id) continue;
      if (!partPorCirugia.has(r.cirugia_id)) partPorCirugia.set(r.cirugia_id, new Set());
      partPorCirugia.get(r.cirugia_id)!.add(r.medico_id);
    }

    const eventosConsultaPorDoctor = new Map<string, number>(); // `${origen_id}|${doctor_id}` → n
    const eventosCirugiaPorDoctor = new Map<string, Set<string>>();
    for (const e of evs) {
      if (!e.doctor_id) continue;
      const key = `${e.origen_id}|${e.doctor_id}`;
      if (e.origen_tipo === 'CONSULTA') {
        eventosConsultaPorDoctor.set(key, (eventosConsultaPorDoctor.get(key) || 0) + 1);
      } else {
        if (!eventosCirugiaPorDoctor.has(e.origen_id)) eventosCirugiaPorDoctor.set(e.origen_id, new Set());
        eventosCirugiaPorDoctor.get(e.origen_id)!.add(e.doctor_id);
      }
    }

    for (const c of consultas) {
      if (c.doctor_id) doctorIds.add(c.doctor_id);
      for (const cc of conceptosPorConsulta.get(c.id) || []) {
        if (cc.doctor_id) doctorIds.add(cc.doctor_id);
      }
    }

    for (const cir of cirugias) {
      if (cir.doctor_id) doctorIds.add(cir.doctor_id);
      for (const r of agdPorCirugia.get(cir.id) || []) doctorIds.add(r);
      for (const r of partPorCirugia.get(cir.id) || []) doctorIds.add(r);
    }

    const nombres = new Map<string, string>();
    const docs = await inEnLotes<{ id: string; alias: string }>(doctorIds, (l) =>
      supabase.from('doctores').select('id, alias').in('id', l)
    );
    for (const d of docs) nombres.set(d.id, d.alias);

    for (const c of consultas) {
      if (!c.doctor_id) continue;
      const n = eventosConsultaPorDoctor.get(`${c.id}|${c.doctor_id}`) || 0;
      if (n === 0 && !c.deployed_to_performance) {
        doctoresSinEvento.push({
          doctor_id: c.doctor_id,
          doctor_nombre: nombres.get(c.doctor_id) || '—',
          origen: 'CONSULTA',
          ref: c.id,
        });
      } else if (n > 0) {
        doctoresEnModulo.push({
          doctor_id: c.doctor_id,
          doctor_nombre: nombres.get(c.doctor_id) || '—',
          origen: 'CONSULTA',
          ref: c.id,
          eventos: n,
        });
      }
    }

    for (const cir of cirugias) {
      const esperados = new Set<string>();
      if (cir.doctor_id) esperados.add(cir.doctor_id);
      for (const r of agdPorCirugia.get(cir.id) || []) esperados.add(r);
      for (const r of partPorCirugia.get(cir.id) || []) esperados.add(r);

      const conEvento = eventosCirugiaPorDoctor.get(cir.id) || new Set<string>();

      for (const docId of esperados) {
        if (conEvento.has(docId)) {
          doctoresEnModulo.push({
            doctor_id: docId,
            doctor_nombre: nombres.get(docId) || '—',
            origen: 'CIRUGIA',
            ref: cir.id,
            eventos: 1,
          });
        } else if (!cir.deployed_to_performance) {
          doctoresSinEvento.push({
            doctor_id: docId,
            doctor_nombre: nombres.get(docId) || '—',
            origen: 'CIRUGIA',
            ref: cir.id,
          });
        }
      }
    }

    return {
      consultas_pendientes: consultas.filter((c) => !c.deployed_to_performance).length,
      cirugias_pendientes: cirugias.filter((c) => !c.deployed_to_performance).length,
      doctores_sin_evento: doctoresSinEvento.slice(0, 200),
      doctores_en_modulo: doctoresEnModulo.slice(0, 200),
      doctores_total: doctorIds.size,
    };
  }

  async generarDesdeConsulta(consultaId: string): Promise<ResultadoDevengo> {
    const resultado = resultadoVacio();

    // consulta (+ nombre del paciente embebido) ‖ conceptos: antes 4 viajes en
    // serie (config sin usar → consulta → conceptos → paciente), ahora 1 ronda.
    const [{ data: consulta, error: e1 }, { data: conceptos }] = await Promise.all([
      this.supabase
        .from('consultas')
        .select('id, paciente_id, doctor_id, fecha, estatus, pacientes:paciente_id(nombre_completo)')
        .eq('id', consultaId)
        .single(),
      this.supabase
        .from('consulta_conceptos')
        .select('id, tipo_concepto, doctor_id, cantidad')
        .eq('consulta_id', consultaId),
    ]);

    if (e1 || !consulta) throw new Error(`Consulta ${consultaId} no encontrada`);

    if (consulta.estatus === 'CANCELADA') {
      resultado.ligados_sin_linea += 1;
      return resultado;
    }

    const metricas = contarMetricasConceptos(conceptos || []);

    const fuente = resolverFuenteHonorario({
      tipo: 'CONSULTA',
      tieneConsultaRaiz: true,
      consultaId: consulta.id,
      doctorId: consulta.doctor_id,
    });

    if (!fuente.crearLinea || !fuente.origenId || !fuente.doctorId) {
      if (consulta.doctor_id) resultado.deployed = false;
      return resultado;
    }

    const pacienteEmb = consulta.pacientes as
      | { nombre_completo?: string | null }
      | Array<{ nombre_completo?: string | null }>
      | null;
    const paciente = Array.isArray(pacienteEmb) ? pacienteEmb[0] ?? null : pacienteEmb;
    const pacienteNombre = consulta.paciente_id ? paciente?.nombre_completo ?? null : null;

    const inserciones: Array<Promise<'creado' | 'existe' | 'omitido'>> = [
      this.crearEvento({
        origen_tipo: 'CONSULTA',
        origen_id: fuente.origenId,
        doctor_id: fuente.doctorId,
        rol: 'PRINCIPAL',
        paciente_id: consulta.paciente_id,
        fecha_servicio: consulta.fecha,
        monto_base: 0,
        cantidad: 1,
        tarifa_snapshot: {
          sin_tarifa: true,
          paciente_nombre: pacienteNombre,
          metricas_ligados: metricas,
        },
        metricas_ligados: metricas,
      }),
    ];

    const doctorConsulta = consulta.doctor_id;
    const vistos = new Set<string>();
    if (doctorConsulta) vistos.add(doctorConsulta);

    // La decisión por concepto es síncrona (mismo orden que antes); solo los
    // INSERT, independientes entre sí (dedupe_key distinto), van en paralelo.
    for (const cc of conceptos || []) {
      if (!cc.doctor_id || vistos.has(cc.doctor_id)) continue;
      vistos.add(cc.doctor_id);

      const fConcepto = resolverFuenteHonorario({
        tipo: cc.tipo_concepto === 'ESTUDIO' ? 'ESTUDIO' : cc.tipo_concepto === 'PROCEDIMIENTO' ? 'PROCEDIMIENTO' : 'CONSULTA',
        tieneConsultaRaiz: true,
        consultaId: consulta.id,
        doctorId: cc.doctor_id,
        doctorConsultaId: doctorConsulta,
      });

      if (fConcepto.crearLinea && fConcepto.origenId && fConcepto.doctorId) {
        inserciones.push(
          this.crearEvento({
            origen_tipo: cc.tipo_concepto === 'ESTUDIO' ? 'ESTUDIO' : 'PROCEDIMIENTO',
            origen_id: cc.id,
            doctor_id: fConcepto.doctorId,
            rol: 'PRINCIPAL',
            paciente_id: consulta.paciente_id,
            fecha_servicio: consulta.fecha,
            monto_base: 0,
            cantidad: Math.max(1, cc.cantidad || 1),
            tarifa_snapshot: { sin_tarifa: true, paciente_nombre: pacienteNombre },
            metricas_ligados: metricasVacias(),
          })
        );
      }

      if (fConcepto.reportarDoctorDistinto) {
        resultado.reportar_doctor_distinto.push(cc.doctor_id);
      }
    }

    for (const creado of await Promise.all(inserciones)) {
      if (creado === 'creado') resultado.eventos_creados += 1;
      else if (creado === 'existe') resultado.eventos_existentes += 1;
    }

    resultado.ligados_sin_linea =
      metricas.estudios_ligados +
      metricas.procedimientos_ligados;
    resultado.deployed = resultado.eventos_creados + resultado.eventos_existentes > 0;

    if (resultado.deployed) {
      await this.marcarDeployed('consultas', consulta.id);
    }

    return resultado;
  }

  /**
   * Aseguranza (origen) de una cirugía con la misma prioridad que antes:
   * `agenda_cirugias.origen_id` → aseguranza de la consulta raíz → del paciente.
   * Antes hasta 6 viajes en serie; ahora ≤ 2 rondas (consulta ‖ paciente, luego nombre).
   */
  private async resolverAseguranzaCirugia(
    origenId: string | null,
    consultaRaiz: string | null,
    pacienteId: string | null
  ): Promise<{ origenAsegId: string | null; origenNombre: string | null }> {
    let origenAsegId = origenId;
    if (!origenAsegId) {
      const [consultaRes, pacienteRes] = await Promise.all([
        consultaRaiz
          ? this.supabase.from('consultas').select('aseguranza_id').eq('id', consultaRaiz).maybeSingle()
          : Promise.resolve({ data: null as { aseguranza_id: string | null } | null }),
        pacienteId
          ? this.supabase.from('pacientes').select('aseguranza_id').eq('id', pacienteId).maybeSingle()
          : Promise.resolve({ data: null as { aseguranza_id: string | null } | null }),
      ]);
      origenAsegId = consultaRes.data?.aseguranza_id || pacienteRes.data?.aseguranza_id || null;
    }
    if (!origenAsegId) return { origenAsegId: null, origenNombre: null };

    const { data: aseg } = await this.supabase
      .from('aseguranzas')
      .select('nombre')
      .eq('id', origenAsegId)
      .maybeSingle();
    return { origenAsegId, origenNombre: aseg?.nombre ?? null };
  }

  async generarDesdeCirugia(cirugiaId: string): Promise<ResultadoDevengo> {
    const resultado = resultadoVacio();

    // cirugía ‖ participantes (ambos solo dependen del id): 1 ronda en vez de 2.
    const [{ data: cirugia, error: e1 }, { data: participantesAgenda }, { data: participantesCirugia }] =
      await Promise.all([
        this.supabase
          .from('agenda_cirugias')
          .select('id, paciente_id, doctor_id, fecha, procedimiento, servicio_id, origen_id, consulta_id, estado')
          .eq('id', cirugiaId)
          .single(),
        this.supabase
          .from('agenda_cirugia_doctores')
          .select('doctor_id, rol, porcentaje_participacion')
          .eq('cirugia_id', cirugiaId),
        this.supabase
          .from('cirugia_participantes')
          .select('medico_id, rol_id, rol:rol_id (clave)')
          .eq('cirugia_id', cirugiaId),
      ]);

    if (e1 || !cirugia) throw new Error(`Cirugía ${cirugiaId} no encontrada`);

    if (cirugia.estado === 'cancelada') {
      await this.cancelarPorCirugia(cirugiaId);
      return resultado;
    }

    const consultaRaiz = cirugia.consulta_id ?? null;
    let metricaP: Promise<void> = Promise.resolve();

    if (consultaRaiz) {
      const fuente = resolverFuenteHonorario({
        tipo: 'CIRUGIA',
        tieneConsultaRaiz: true,
        consultaId: consultaRaiz,
        cirugiaConsultaId: consultaRaiz,
        doctorId: cirugia.doctor_id,
        doctorConsultaId: cirugia.doctor_id,
      });

      if (!fuente.crearLinea) {
        resultado.ligados_sin_linea += 1;
        metricaP = this.incrementarMetricaConsulta(consultaRaiz, { cirugias_ligadas: 1 });
      }
    }

    const doctoresMap = new Map<string, RolDoctor>();

    for (const p of participantesAgenda || []) {
      if (p.doctor_id) {
        doctoresMap.set(p.doctor_id, (p.rol as RolDoctor) || 'CIRUJANO_PRINCIPAL');
      }
    }

    // Anestesiólogo: su propio rol (el monto se liquida en Productividad, como los demás).
    for (const p of participantesCirugia || []) {
      if (!p.medico_id) continue;
      const rolRel = (p as { rol?: { clave?: string } | { clave?: string }[] | null }).rol;
      const clave = Array.isArray(rolRel) ? rolRel[0]?.clave : rolRel?.clave;
      if (clave === 'anestesiologo') {
        doctoresMap.set(p.medico_id, 'ANESTESIOLOGO');
      } else if (!doctoresMap.has(p.medico_id)) {
        doctoresMap.set(p.medico_id, 'CIRUJANO_PRINCIPAL');
      }
    }

    if (doctoresMap.size === 0 && cirugia.doctor_id) {
      doctoresMap.set(cirugia.doctor_id, 'CIRUJANO_PRINCIPAL');
    }

    // Métrica de la consulta raíz ‖ aseguranza (independientes).
    const [, { origenAsegId, origenNombre }] = await Promise.all([
      metricaP,
      this.resolverAseguranzaCirugia(
        (cirugia.origen_id as string | null) ?? null,
        consultaRaiz,
        cirugia.paciente_id ?? null
      ),
    ]);

    // Un INSERT por doctor, en paralelo (dedupe_key distinto por doctor).
    const creados = await Promise.all(
      [...doctoresMap].map(([doctorId, rol]) =>
        this.crearEvento({
          origen_tipo: 'OPERACION',
          origen_id: cirugiaId,
          doctor_id: doctorId,
          rol,
          paciente_id: cirugia.paciente_id,
          fecha_servicio: cirugia.fecha,
          monto_base: 0,
          cantidad: 1,
          tarifa_snapshot: {
            sin_tarifa: true,
            origen_nombre: origenNombre,
            origen_id: origenAsegId,
            procedimiento: cirugia.procedimiento ?? null,
            servicio_id: cirugia.servicio_id ?? null,
            ...(rol === 'ANESTESIOLOGO' ? { concepto: 'Anestesia' } : {}),
          },
          metricas_ligados: metricasVacias(),
        })
      )
    );

    for (const creado of creados) {
      if (creado === 'creado') resultado.eventos_creados += 1;
      else if (creado === 'existe') resultado.eventos_existentes += 1;
    }

    resultado.deployed = doctoresMap.size > 0;
    if (resultado.deployed) {
      await this.marcarDeployed('agenda_cirugias', cirugiaId);
    }

    return resultado;
  }

  async cancelarPorConsulta(consultaId: string): Promise<{ cancelados: number }> {
    const { data: conceptos } = await this.supabase
      .from('consulta_conceptos')
      .select('id')
      .eq('consulta_id', consultaId);

    const origenIds = [consultaId, ...(conceptos || []).map((c) => c.id)];

    const { data: vivos } = await this.supabase
      .from('eventos_honorario')
      .select('id, estado')
      .in('origen_id', origenIds)
      .neq('estado', 'PAGADO')
      .neq('estado', 'CANCELADO');

    if (!vivos || vivos.length === 0) return { cancelados: 0 };

    const { error } = await this.supabase
      .from('eventos_honorario')
      .update({ estado: 'CANCELADO' })
      .in('id', vivos.map((v) => v.id));

    if (error) throw new Error(`Error al cancelar honorarios de consulta: ${error.message}`);
    return { cancelados: vivos.length };
  }

  async cancelarPorCirugia(cirugiaId: string): Promise<{ cancelados: number }> {
    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('id, estado')
      .eq('origen_tipo', 'OPERACION')
      .eq('origen_id', cirugiaId)
      .neq('estado', 'PAGADO')
      .neq('estado', 'CANCELADO');

    let cancelados = 0;

    if (eventos && eventos.length > 0) {
      const { error } = await this.supabase
        .from('eventos_honorario')
        .update({ estado: 'CANCELADO' })
        .in('id', eventos.map((e) => e.id));
      if (error) throw new Error(`Error al cancelar honorarios de cirugía: ${error.message}`);
      cancelados = eventos.length;
    }

    await this.supabase
      .from('cirugia_productividad')
      .update({ estado: 'ANULADO' })
      .eq('cirugia_id', cirugiaId)
      .neq('estado', 'ANULADO')
      .neq('estado', 'PAGADO');

    return { cancelados };
  }

  private async incrementarMetricaConsulta(
    consultaId: string,
    delta: Partial<MetricasLigados>
  ): Promise<void> {
    const { data: evento } = await this.supabase
      .from('eventos_honorario')
      .select('id, metricas_ligados, estado')
      .eq('origen_tipo', 'CONSULTA')
      .eq('origen_id', consultaId)
      .neq('estado', 'CANCELADO')
      .neq('estado', 'REVERSADO')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!evento) return;

    const actual = (evento.metricas_ligados || metricasVacias()) as MetricasLigados;
    const siguiente = mergeMetricas(
      {
        estudios_ligados: actual.estudios_ligados || 0,
        procedimientos_ligados: actual.procedimientos_ligados || 0,
        cirugias_ligadas: actual.cirugias_ligadas || 0,
      },
      delta
    );

    await this.supabase
      .from('eventos_honorario')
      .update({ metricas_ligados: siguiente })
      .eq('id', evento.id);
  }

  private async crearEvento(
    input: EventoDevengoInput
  ): Promise<'creado' | 'existe' | 'omitido'> {
    const cantidad = Math.max(1, input.cantidad ?? 1);
    const periodoId = await this.resolverPeriodo(input.fecha_servicio);
    const dedupeKey = `${input.origen_tipo}:${input.origen_id}:${input.doctor_id}`;

    const { error } = await this.supabase.from('eventos_honorario').insert({
      origen_tipo: input.origen_tipo,
      origen_id: input.origen_id,
      doctor_id: input.doctor_id,
      rol: normalizarRolEvento(input.rol),
      paciente_id: input.paciente_id,
      fecha_servicio: input.fecha_servicio,
      monto_base: input.monto_base,
      tarifa_snapshot: input.tarifa_snapshot,
      monto_devengado: 0,
      moneda: normalizarMoneda(input.moneda),
      estado: 'DEVENGADO',
      periodo_id: periodoId,
      dedupe_key: dedupeKey,
      metricas_ligados: input.metricas_ligados || metricasVacias(),
    });

    if (error) {
      if (error.code === '23505') return 'existe';
      throw new Error(`Error al crear evento de honorario: ${error.message}`);
    }

    return 'creado';
  }

  private resolverPeriodo(fecha: string): Promise<string | null> {
    const cache = this.periodoPorFecha.get(fecha);
    if (cache) return cache;
    const p = (async () => {
      const { data } = await this.supabase
        .from('periodos_pago')
        .select('id')
        .lte('fecha_desde', fecha)
        .gte('fecha_hasta', fecha)
        .in('estado', ['ABIERTO', 'EN_REVISION'])
        .maybeSingle();
      return data?.id ?? null;
    })();
    // Un fallo de red no debe quedar memorizado.
    p.catch(() => this.periodoPorFecha.delete(fecha));
    this.periodoPorFecha.set(fecha, p);
    return p;
  }
}
