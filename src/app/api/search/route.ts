import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

interface SearchResult {
  tipo: string;
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
}

const MAX_RESULTS_PER_TYPE = 5;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${q}%`;
  const supabase = getSupabaseAdmin();

  const [pacientes, consultas, lentes, doctores, cobros] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id,nombre_completo,telefono,email')
      .or(`nombre_completo.ilike.${pattern},telefono.ilike.${pattern},email.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE),

    supabase
      .from('consultas')
      .select('id,folio,diagnostico,paciente:pacientes(nombre_completo),doctor:doctores(nombre_completo)')
      .or(`folio.ilike.${pattern},diagnostico.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE),

    supabase
      .from('lentes')
      .select('id,marca,modelo,codigo_barras,categoria:categorias_lentes(nombre)')
      .or(`marca.ilike.${pattern},modelo.ilike.${pattern},codigo_barras.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE),

    supabase
      .from('doctores')
      .select('id,nombre_completo,especialidad')
      .or(`nombre_completo.ilike.${pattern},especialidad.ilike.${pattern}`)
      .eq('activo', true)
      .limit(MAX_RESULTS_PER_TYPE),

    supabase
      .from('cobros')
      .select('id,folio,paciente:pacientes(nombre_completo),monto,pagado')
      .or(`folio.ilike.${pattern}`)
      .limit(MAX_RESULTS_PER_TYPE),
  ]);

  const results: SearchResult[] = [];

  if (pacientes.data) {
    for (const p of pacientes.data) {
      results.push({
        tipo: 'paciente',
        id: p.id,
        titulo: p.nombre_completo,
        subtitulo: [p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto',
        href: `/pacientes/${p.id}/historial`,
      });
    }
  }

  if (consultas.data) {
    for (const c of consultas.data) {
      const paciente = Array.isArray(c.paciente) ? c.paciente[0] : c.paciente;
      const doctor = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
      results.push({
        tipo: 'consulta',
        id: c.id,
        titulo: `${c.folio} — ${paciente?.nombre_completo ?? 'Sin paciente'}`,
        subtitulo: c.diagnostico ?? 'Sin diagnóstico',
        href: '/consultas',
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
        titulo: d.nombre_completo,
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
