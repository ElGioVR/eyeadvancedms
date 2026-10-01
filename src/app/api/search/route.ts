import { NextResponse, type NextRequest } from 'next/server';
import { sanitizarBusqueda } from '@/lib/text';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { resolveDoctorId } from '@/lib/auth-helpers';
import { enfermeroCobraHonorarios } from '@/lib/acceso-enfermeria';

interface SearchResult {
  tipo: string;
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
  ojo_operado?: OjoOperado;
  cirugias_previas?: number;
}

type OjoOperado = 'sin_cirugias' | 'OD' | 'OI' | 'ambos' | 'desconocido';

interface HistorialOjo {
  total: number;
  od: boolean;
  oi: boolean;
  desconocido: boolean;
}

const MAX_RESULTS_PER_TYPE = 5;
const MIN_QUERY = 2;
const MAX_QUERY = 60;
const MAX_PACIENTES_CON_FILTRO = 50;

function resumirOjo(h: HistorialOjo | undefined): OjoOperado {
  if (!h || h.total === 0) return 'sin_cirugias';
  if (h.desconocido) return 'desconocido';
  if (h.od && h.oi) return 'ambos';
  if (h.od) return 'OD';
  if (h.oi) return 'OI';
  return 'desconocido';
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.trim() ?? '';
  const cirugia = params.get('cirugia');
  // Valor desconocido de `cirugia` → sin filtro (como antes)
  const filtroOjo = cirugia === 'primer' || cirugia === 'segundo' || cirugia === 'todos' ? cirugia : null;

  // Longitud: mínimo 2, máximo 60 caracteres (fuera de rango → sin resultados)
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
    return NextResponse.json({ results: [] });
  }

  // Escapa wildcards de ILIKE para que el usuario no liste todo con '%' o '_'
  // y quita sintaxis de filtros PostgREST para que no inyecte condiciones en .or()
  const qSanitizada = sanitizarBusqueda(q, MAX_QUERY);
  if (qSanitizada.length < MIN_QUERY) {
    return NextResponse.json({ results: [] });
  }
  const pattern = `%${qSanitizada}%`;
  const supabase = getSupabaseAdmin();

  // Con filtro de ojo solo interesan pacientes (evita 5 consultas por tecla).
  const limitePacientes =
    filtroOjo && filtroOjo !== 'todos' ? MAX_PACIENTES_CON_FILTRO : MAX_RESULTS_PER_TYPE;

  const pacientesQuery = supabase
    .from('pacientes')
    .select('id,nombre_completo,telefono,email')
    .or(`nombre_completo.ilike.${pattern},telefono.ilike.${pattern},email.ilike.${pattern}`)
    .limit(limitePacientes);

  const historial = new Map<string, HistorialOjo>();
  const results: SearchResult[] = [];

  const agregarPacientes = (lista: Array<{ id: string; nombre_completo: string; telefono: string | null; email: string | null }>) => {
    for (const p of lista) {
      const item: SearchResult = {
        tipo: 'paciente',
        id: p.id,
        titulo: p.nombre_completo,
        subtitulo: [p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto',
        href: `/pacientes/${p.id}/historial`,
      };
      if (filtroOjo) {
        item.ojo_operado = resumirOjo(historial.get(p.id));
        item.cirugias_previas = historial.get(p.id)?.total || 0;
      }
      results.push(item);
    }
  };

  if (filtroOjo) {
    // Con filtro de ojo solo interesan pacientes (evita 5 consultas por tecla).
    const pacientes = await pacientesQuery;
    let listaPacientes = pacientes.data || [];

    if (listaPacientes.length > 0) {
      const ids = listaPacientes.map((p) => p.id);
      const { data: cirugias } = await supabase
        .from('agenda_cirugias')
        .select('paciente_id, ojo, estado')
        .in('paciente_id', ids.slice(0, MAX_PACIENTES_CON_FILTRO))
        .neq('estado', 'cancelada')
        .limit(1000);

      for (const c of cirugias || []) {
        if (!c.paciente_id) continue;
        const h = historial.get(c.paciente_id) || { total: 0, od: false, oi: false, desconocido: false };
        h.total += 1;
        if (c.ojo === 'OD') h.od = true;
        else if (c.ojo === 'OI') h.oi = true;
        else if (c.ojo === 'OU') {
          h.od = true;
          h.oi = true;
        } else h.desconocido = true;
        historial.set(c.paciente_id, h);
      }

      if (filtroOjo === 'primer') {
        listaPacientes = listaPacientes.filter((p) => (historial.get(p.id)?.total || 0) === 0);
      } else if (filtroOjo === 'segundo') {
        listaPacientes = listaPacientes.filter((p) => (historial.get(p.id)?.total || 0) > 0);
      }
      listaPacientes = listaPacientes.slice(0, MAX_RESULTS_PER_TYPE);
    }

    agregarPacientes(listaPacientes);
    return NextResponse.json({ results });
  }

  // Sin filtro: las 5 entidades en paralelo (antes pacientes iba en serie antes del resto).
  // RBAC: un doctor solo ve sus propias consultas (misma regla que /api/consultas).
  const consultasQuery = async () => {
    let q = supabase
      .from('consultas')
      .select('id,folio,diagnostico,paciente:pacientes(nombre_completo),doctor:doctores(alias)')
      .or(`folio.ilike.${pattern},diagnostico.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE);
    if (auth.perfil?.rol === 'doctor') {
      const doctorId = await resolveDoctorId(auth.user.id);
      if (!doctorId) return { data: [] as never[] };
      q = q.eq('doctor_id', doctorId);
    }
    return q;
  };

  // Enfermería (rol restringido): solo pacientes, y lentes si tiene honorarios
  // activos. Sin consultas, personal ni cobros.
  const esEnfermero = auth.perfil?.rol === 'enfermero';
  const verLentes = !esEnfermero || (await enfermeroCobraHonorarios(auth.user.id));
  const vacio = Promise.resolve({ data: null });

  const [pacientes, consultas, lentes, doctores, cobros] = await Promise.all([
    pacientesQuery,
    esEnfermero ? vacio : consultasQuery(),

    verLentes
      ? supabase
          .from('inventario_items')
          .select('id,marca,modelo,codigo_barras,categoria:categorias_lentes(nombre)')
          .or(`marca.ilike.${pattern},modelo.ilike.${pattern},codigo_barras.ilike.${pattern}`)
          .limit(MAX_RESULTS_PER_TYPE)
      : vacio,

    esEnfermero
      ? vacio
      : supabase
          .from('doctores')
          .select('id,alias,especialidad')
          .or(`alias.ilike.${pattern},especialidad.ilike.${pattern}`)
          .eq('activo', true)
          .limit(MAX_RESULTS_PER_TYPE),

    esEnfermero
      ? vacio
      : supabase
          .from('cobros')
          .select('id,folio,paciente:pacientes(nombre_completo),monto,pagado')
          .ilike('folio', pattern)
          .limit(MAX_RESULTS_PER_TYPE),
  ]);

  agregarPacientes(pacientes.data || []);

  if (consultas.data) {
    for (const c of consultas.data) {
      const paciente = Array.isArray(c.paciente) ? c.paciente[0] : c.paciente;
      const doctor = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
      results.push({
        tipo: 'consulta',
        id: c.id,
        titulo: `${c.folio} — ${paciente?.nombre_completo ?? 'Sin paciente'}`,
        subtitulo: c.diagnostico ?? 'Sin diagnóstico',
        href: `/consultas/${c.id}`,
      });
    }
  }

  if (lentes.data) {
    for (const l of lentes.data) {
      const categoria = Array.isArray(l.categoria) ? l.categoria[0] : l.categoria;
      results.push({
        tipo: 'lente',
        id: l.id,
        titulo: `${l.marca} ${l.modelo}`,
        subtitulo: [l.codigo_barras, categoria?.nombre].filter(Boolean).join(' · ') || 'Sin categoría',
        href: `/inventario/${l.id}/editar`,
      });
    }
  }

  if (doctores.data) {
    for (const d of doctores.data) {
      results.push({
        tipo: 'doctor',
        id: d.id,
        titulo: d.alias,
        subtitulo: d.especialidad ?? 'Sin especialidad',
        href: '/configuracion/doctores',
      });
    }
  }

  if (cobros.data) {
    for (const co of cobros.data) {
      const paciente = Array.isArray(co.paciente) ? co.paciente[0] : co.paciente;
      results.push({
        tipo: 'cobro',
        id: co.id,
        titulo: `${co.folio ?? 'Sin folio'} — ${paciente?.nombre_completo ?? 'Sin paciente'}`,
        subtitulo: `$${co.monto} ${co.pagado ? '(Pagado)' : '(Pendiente)'}`,
        href: '/cobros',
      });
    }
  }

  return NextResponse.json({ results });
}
