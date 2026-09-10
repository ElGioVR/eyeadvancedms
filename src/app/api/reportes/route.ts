import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const mes = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
    edad--;
  }
  return edad;
}

function getRangoFechas(periodo: string): { inicio: string; fin: string } {
  const hoy = new Date();
  const fin = hoy.toISOString().split('T')[0];
  let inicio: string;

  switch (periodo) {
    case 'Este Mes': {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      inicio = d.toISOString().split('T')[0];
      break;
    }
    case 'Últimos 3 Meses': {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
      inicio = d.toISOString().split('T')[0];
      break;
    }
    case 'Últimos 6 Meses': {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1);
      inicio = d.toISOString().split('T')[0];
      break;
    }
    case 'Este Año': {
      const d = new Date(hoy.getFullYear(), 0, 1);
      inicio = d.toISOString().split('T')[0];
      break;
    }
    default:
      inicio = '2020-01-01';
  }

  return { inicio, fin };
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const periodo = searchParams.get('periodo') || 'Este Mes';
  const { inicio, fin } = getRangoFechas(periodo);

  const supabase = getSupabaseAdmin();

  const [
    pacientesResult,
    pacientesNuevosResult,
    consultasResult,
    consultasPorTipoResult,
    consultasPorDoctorResult,
    diagnosticosResult,
    cobrosResult,
    cobrosPorMetodoResult,
    ingresosMensualesResult,
    lentesResult,
    lentesPorCategoriaResult,
    lentesPorProveedorResult,
    aseguranzasResult,
    actividadHoyResult,
  ] = await Promise.all([
    supabase.from('pacientes').select('id, fecha_nacimiento, aseguranza_id', { count: 'exact', head: true }),

    supabase.from('pacientes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', inicio)
      .lte('created_at', fin + 'T23:59:59'),

    supabase.from('consultas')
      .select('id, tipo_consulta, doctor_id, diagnostico, fecha, created_at', { count: 'exact' })
      .gte('fecha', inicio)
      .lte('fecha', fin),

    supabase.from('consultas')
      .select('tipo_consulta')
      .gte('fecha', inicio)
      .lte('fecha', fin),

    supabase.from('consultas')
      .select('doctor_id')
      .gte('fecha', inicio)
      .lte('fecha', fin),

    supabase.from('consultas')
      .select('diagnostico')
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .not('diagnostico', 'is', null),

    supabase.from('cobros')
      .select('id, monto, pagado, metodo_pago, created_at, fecha_pago')
      .gte('created_at', inicio)
      .lte('created_at', fin + 'T23:59:59'),

    supabase.from('cobros')
      .select('metodo_pago')
      .gte('created_at', inicio)
      .lte('created_at', fin + 'T23:59:59'),

    supabase.from('cobros')
      .select('monto, created_at')
      .gte('created_at', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString())
      .lte('created_at', fin + 'T23:59:59')
      .eq('pagado', true),

    supabase.from('lentes')
      .select('id, stock, estado, categoria_id, proveedor_id', { count: 'exact' }),

    supabase.from('lentes')
      .select('categoria_id')
      .gt('stock', 0),

    supabase.from('lentes')
      .select('proveedor_id')
      .gt('stock', 0),

    supabase.from('aseguranzas')
      .select('id, nombre')
      .eq('activo', true),

    supabase.from('consultas')
      .select(`
        id, fecha, hora_inicio, tipo_consulta,
        pacientes:paciente_id (nombre_completo),
        doctores:doctor_id (nombre_completo)
      `)
      .eq('fecha', new Date().toISOString().split('T')[0])
      .order('hora_inicio', { ascending: true }),
  ]);

  const doctoresIds = [...new Set(
    (consultasPorDoctorResult.data || []).map((c) => c.doctor_id).filter(Boolean)
  )];
  const categoriasIds = [...new Set(
    (lentesPorCategoriaResult.data || []).map((l) => l.categoria_id).filter(Boolean)
  )];
  const proveedoresIds = [...new Set(
    (lentesPorProveedorResult.data || []).map((l) => l.proveedor_id).filter(Boolean)
  )];

  const [doctoresResult, categoriasResult, proveedoresResult] = await Promise.all([
    doctoresIds.length > 0
      ? supabase.from('doctores').select('id, nombre_completo').in('id', doctoresIds)
      : Promise.resolve({ data: [] as any[] }),
    categoriasIds.length > 0
      ? supabase.from('categorias_lentes').select('id, nombre').in('id', categoriasIds)
      : Promise.resolve({ data: [] as any[] }),
    proveedoresIds.length > 0
      ? supabase.from('proveedores').select('id, nombre').in('id', proveedoresIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const doctorMap = new Map((doctoresResult.data || []).map((d) => [d.id, d.nombre_completo]));
  const categoriaMap = new Map((categoriasResult.data || []).map((c) => [c.id, c.nombre]));
  const proveedorMap = new Map((proveedoresResult.data || []).map((p) => [p.id, p.nombre]));

  const allPacientes = pacientesResult.data || [];
  const pacientesConEdad = allPacientes.filter((p) => p.fecha_nacimiento);
  const pacientesPorEdad = [
    { label: '0-17', value: 0 },
    { label: '18-35', value: 0 },
    { label: '36-50', value: 0 },
    { label: '51-65', value: 0 },
    { label: '65+', value: 0 },
  ];
  pacientesConEdad.forEach((p) => {
    const edad = calcularEdad(p.fecha_nacimiento);
    if (edad < 18) pacientesPorEdad[0].value++;
    else if (edad <= 35) pacientesPorEdad[1].value++;
    else if (edad <= 50) pacientesPorEdad[2].value++;
    else if (edad <= 65) pacientesPorEdad[3].value++;
    else pacientesPorEdad[4].value++;
  });

  const pacientesConSeguro = allPacientes.filter((p) => p.aseguranza_id).length;
  const pacientesParticulares = (pacientesResult.count || 0) - pacientesConSeguro;

  const pacientesPorAseguradora = new Map<string, number>();
  allPacientes.forEach((p) => {
    if (p.aseguranza_id) {
      pacientesPorAseguradora.set(p.aseguranza_id, (pacientesPorAseguradora.get(p.aseguranza_id) || 0) + 1);
    }
  });
  const seguroData = (aseguranzasResult.data || [])
    .map((a) => ({ name: a.nombre, value: pacientesPorAseguradora.get(a.id) || 0, color: '#0ea5e9' }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (pacientesParticulares > 0) {
    seguroData.push({ name: 'Particular', value: pacientesParticulares, color: '#94a3b8' });
  }

  const consultas = consultasResult.data || [];
  const consultasPorTipoMap = new Map<string, number>();
  (consultasPorTipoResult.data || []).forEach((c) => {
    consultasPorTipoMap.set(c.tipo_consulta, (consultasPorTipoMap.get(c.tipo_consulta) || 0) + 1);
  });
  const tipoLabels: Record<string, string> = {
    CONSULTA: 'Consulta',
    ESTUDIO: 'Estudio',
    REVISION: 'Revisión',
    PROCEDIMIENTO: 'Procedimiento',
  };
  const consultasPorTipo = [...consultasPorTipoMap.entries()]
    .map(([tipo, count]) => ({ label: tipoLabels[tipo] || tipo, value: count, displayValue: `${count} consultas` }))
    .sort((a, b) => b.value - a.value);

  const consultasPorDoctorMap = new Map<string, number>();
  (consultasPorDoctorResult.data || []).forEach((c) => {
    if (c.doctor_id) {
      consultasPorDoctorMap.set(c.doctor_id, (consultasPorDoctorMap.get(c.doctor_id) || 0) + 1);
    }
  });
  const consultasPorDoctor = [...consultasPorDoctorMap.entries()]
    .map(([id, count]) => ({ label: doctorMap.get(id) || 'Desconocido', value: count, displayValue: `${count} consultas` }))
    .sort((a, b) => b.value - a.value);

  const diagnosticosMap = new Map<string, number>();
  (diagnosticosResult.data || []).forEach((c) => {
    if (c.diagnostico) {
      const key = c.diagnostico.trim();
      diagnosticosMap.set(key, (diagnosticosMap.get(key) || 0) + 1);
    }
  });
  const maxDiagnosticos = Math.max(...diagnosticosMap.values(), 1);
  const diagnosticos = [...diagnosticosMap.entries()]
    .map(([name, casos]) => ({ name, casos, pct: Math.round((casos / maxDiagnosticos) * 100) }))
    .sort((a, b) => b.casos - a.casos)
    .slice(0, 10);

  const cobros = cobrosResult.data || [];
  const totalCobros = cobros.reduce((sum, c) => sum + (c.monto || 0), 0);
  const pagados = cobros.filter((c) => c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);
  const pendientes = cobros.filter((c) => !c.pagado).reduce((sum, c) => sum + (c.monto || 0), 0);

  const cobrosPorMetodoMap = new Map<string, number>();
  (cobrosPorMetodoResult.data || []).forEach((c) => {
    cobrosPorMetodoMap.set(c.metodo_pago, (cobrosPorMetodoMap.get(c.metodo_pago) || 0) + 1);
  });
  const metodoLabels: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    TARJETA: 'Tarjeta',
    TRANSFERENCIA: 'Transferencia',
    NO_APLICA: 'Otro',
  };
  const totalMetodos = [...cobrosPorMetodoMap.values()].reduce((a, b) => a + b, 0) || 1;
  const cobrosPorMetodo = [...cobrosPorMetodoMap.entries()]
    .map(([metodo, count]) => ({
      name: metodoLabels[metodo] || metodo,
      value: Math.round((count / totalMetodos) * 100),
      color: metodo === 'TARJETA' ? '#1a3a5c' : metodo === 'EFECTIVO' ? '#00b4d8' : metodo === 'TRANSFERENCIA' ? '#2e86c1' : '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

  const ingresosPorMesMap = new Map<string, number>();
  (ingresosMensualesResult.data || []).forEach((c) => {
    const fecha = new Date(c.created_at);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    ingresosPorMesMap.set(key, (ingresosPorMesMap.get(key) || 0) + (c.monto || 0));
  });
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const ingresosMensuales = [...ingresosPorMesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([key, total]) => {
      const [, mes] = key.split('-');
      const mesIdx = parseInt(mes, 10) - 1;
      return {
        label: meses[mesIdx] || mes,
        value: Math.round(total / 1000),
        displayValue: `$${Math.round(total / 1000)}k`,
      };
    });

  const lentes = lentesResult.data || [];
  const lentesDisponibles = lentes.filter((l) => l.estado === 'DISPONIBLE' && l.stock > 0).length;
  const lentesStockBajo = lentes.filter((l) => l.stock > 0 && l.stock <= 5).length;
  const lentesSinStock = lentes.filter((l) => l.stock === 0).length;

  const lentesPorCategoriaMap = new Map<string, number>();
  (lentesPorCategoriaResult.data || []).forEach((l) => {
    if (l.categoria_id) {
      lentesPorCategoriaMap.set(l.categoria_id, (lentesPorCategoriaMap.get(l.categoria_id) || 0) + 1);
    }
  });
  const inventarioPorCategoria = [...lentesPorCategoriaMap.entries()]
    .map(([id, count]) => ({ label: categoriaMap.get(id) || 'Sin categoría', value: count, displayValue: `${count} unidades` }))
    .sort((a, b) => b.value - a.value);

  const lentesPorProveedorMap = new Map<string, number>();
  (lentesPorProveedorResult.data || []).forEach((l) => {
    if (l.proveedor_id) {
      lentesPorProveedorMap.set(l.proveedor_id, (lentesPorProveedorMap.get(l.proveedor_id) || 0) + 1);
    }
  });
  const inventarioPorProveedor = [...lentesPorProveedorMap.entries()]
    .map(([id, count]) => ({ label: proveedorMap.get(id) || 'Desconocido', value: count, displayValue: `${count} unidades` }))
    .sort((a, b) => b.value - a.value);

  const actividadHoy = (actividadHoyResult.data || []).map((c) => ({
    hora: c.hora_inicio || '',
    paciente: (c.pacientes as any)?.nombre_completo || '',
    tipo: c.tipo_consulta || '',
    doctor: (c.doctores as any)?.nombre_completo || '',
    estado: 'Pendiente',
  }));

  return NextResponse.json({
    resumen: {
      totalPacientes: pacientesResult.count || 0,
      pacientesNuevos: pacientesNuevosResult.count || 0,
      totalConsultas: consultas.length,
      totalCobros,
      pagados,
      pendientes,
      totalLentes: lentes.length,
      lentesDisponibles,
      lentesStockBajo,
      lentesSinStock,
      pacientesConSeguro,
      pacientesParticulares,
    },
    pacientes: {
      porEdad: pacientesPorEdad,
      porAseguradora: seguroData,
    },
    consultas: {
      porTipo: consultasPorTipo,
      porDoctor: consultasPorDoctor,
    },
    diagnosticos,
    financiero: {
      totalCobros,
      porMetodo: cobrosPorMetodo,
      ingresosMensuales,
    },
    inventario: {
      porCategoria: inventarioPorCategoria,
      porProveedor: inventarioPorProveedor,
    },
    actividadHoy,
  });
}
