import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { validarId } from '@/lib/api/validar';
import { verificarPermisoArchivo } from '@/lib/permisos-archivo';
import { leerTelefonos } from '@/lib/telefonos-paciente-db';
import { ruta } from '@/lib/api/ruta';

async function manejarGET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const rolP = requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);

  const supabase = getSupabaseAdmin();

  const BASE_COLUMNS = `
    id,
    codigo,
    paciente_id,
    nombre_paciente,
    fecha,
    hora,
    estado,
    ojo,
    duracion_min,
    notas,
    origen_id,
    servicio_id,
    recurso_id,
    inventario_item_id,
    consulta_id,
    created_by,
    created_at,
    pacientes:paciente_id (nombre_completo, telefono, email, sexo, fecha_nacimiento, edad, numero_expediente),
    origen:origen_id (nombre),
    servicio:servicio_id (nombre),
    recurso:recurso_id (nombre, ubicacion)
  `;

  const r = await leerConRol(rolP, async () => {
    // Las relaciones solo dependen del id: se piden en paralelo con la cirugía
    // (antes: después de la lectura principal, 1 viaje extra en serie).
    const relacionadasP = Promise.all([
      supabase
        .from('cirugia_participantes')
        .select('id, medico_id, rol_id, doctores:medico_id(alias), roles:rol_id(nombre, clave)')
        .eq('cirugia_id', id),
      supabase
        .from('cirugia_archivos')
        .select('id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at')
        .eq('cirugia_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('cirugia_productividad')
        .select('id, participante_id, rol_id, estado, monto, regla_id, roles:rol_id(nombre)')
        .eq('cirugia_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('cirugia_historial')
        .select('id, accion, detalle, usuario_id, created_at')
        .eq('cirugia_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      // Metadatos de archivos solo si el rol puede 'ver' archivos (PER-002).
      verificarPermisoArchivo(auth.user.id, 'ver'),
      // Modificaciones agenda (punto I): consultas aparte y tolerantes a error,
      // para que el detalle siga funcionando aunque falten las migraciones 340/350.
      supabase
        .from('agenda_cirugias')
        .select('diagnostico, anestesia, procedencia, motivo_consulta, lio_diseno, lio_torico, especialidad:especialidad_id (nombre), modelo_lio:modelo_lio_id (fabricante, modelo, torico)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('cirugia_procedimientos')
        .select('id, servicio_id, nombre, orden')
        .eq('cirugia_id', id)
        .order('orden'),
      supabase
        .from('cirugia_personal')
        .select('id, rol, nombre')
        .eq('cirugia_id', id),
      // Horarios del equipo (mig. 370), tolerantes a que aún no existan las columnas
      supabase.from('cirugia_personal').select('id, hora_inicio, hora_fin').eq('cirugia_id', id),
      supabase.from('cirugia_participantes').select('id, hora_inicio, hora_fin').eq('cirugia_id', id),
    ]);

    // 1er intento: con embed de LIO; si el esquema de inventario no tiene esas
    // columnas, se reintenta sin él y el LIO se resuelve aparte (best-effort).
    let cirugia: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;

    const primero = await supabase
      .from('agenda_cirugias')
      .select(
        `${BASE_COLUMNS},
        lio:inventario_item_id (marca, modelo, tipo_lio, lote, fecha_caducidad)
      `
      )
      .eq('id', id)
      .maybeSingle();
    cirugia = (primero.data as Record<string, unknown> | null) ?? null;
    error = primero.error;

    if (error) {
      const retry = await supabase
        .from('agenda_cirugias')
        .select(BASE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      cirugia = (retry.data as Record<string, unknown> | null) ?? null;
      error = retry.error;

      if (!error && cirugia) {
        const itemId = cirugia.inventario_item_id as string | null;
        if (itemId) {
          let lioQuery = await supabase
            .from('inventario_items')
            .select('marca, modelo, tipo_lio, lote, fecha_caducidad')
            .eq('id', itemId)
            .maybeSingle();
          if (lioQuery.error) {
            lioQuery = await supabase
              .from('inventario_items')
              .select('manufacturer AS marca, model AS modelo, lote, expiration_date AS fecha_caducidad')
              .eq('id', itemId)
              .maybeSingle();
          }
          cirugia.lio = lioQuery.data ?? null;
        }
      }
    }

    if (error) {
      void relacionadasP.catch(() => undefined);
      return { error } as const;
    }
    if (!cirugia) {
      void relacionadasP.catch(() => undefined);
      return { noEncontrada: true } as const;
    }
    const [participantesBase, archivos, productividad, historial, permisoVer, clinicos, procedimientosAdic, personalBase, horariosPersonal, horariosParticipantes] = await relacionadasP;
    type Horario = { id: string; hora_inicio: string | null; hora_fin: string | null };
    const conHorario = <T extends { id: string }>(filas: T[] | null, horarios: Horario[] | null) =>
      (filas || []).map((f) => {
        const h = (horarios || []).find((x) => x.id === f.id);
        return { ...f, hora_inicio: h?.hora_inicio ?? null, hora_fin: h?.hora_fin ?? null };
      });
    const participantes = { data: conHorario(participantesBase.data as { id: string }[] | null, horariosParticipantes.data as Horario[] | null) };
    const personal = { data: conHorario(personalBase.data as { id: string }[] | null, horariosPersonal.data as Horario[] | null) };
    if (clinicos.data) Object.assign(cirugia, clinicos.data);
    // Teléfonos del paciente para WhatsApp (varios números, mig. 1800000000470).
    const pacienteId = cirugia.paciente_id as string | null;
    if (pacienteId && cirugia.pacientes && typeof cirugia.pacientes === 'object') {
      (cirugia.pacientes as Record<string, unknown>).telefonos = (await leerTelefonos([pacienteId])).get(pacienteId) ?? [];
    }
    return {
      cirugia,
      participantes,
      archivos: permisoVer.permitido ? archivos : { data: [] },
      productividad,
      historial,
      procedimientos_adicionales: procedimientosAdic.data || [],
      personal: personal.data || [],
    } as const;
  });
  if ('denegado' in r) return r.denegado;
  const resultado = r.datos;

  if ('error' in resultado) {
    return NextResponse.json({ error: handleSupabaseError(resultado.error, 'cirugias/[id]').mensaje }, { status: 500 });
  }
  if ('noEncontrada' in resultado) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }
  const { cirugia, participantes, archivos, productividad, historial, procedimientos_adicionales, personal } = resultado;

  return NextResponse.json({
    cirugia,
    participantes: participantes.data || [],
    archivos: archivos.data || [],
    productividad: productividad.data || [],
    historial: historial.data || [],
    procedimientos_adicionales,
    personal,
  });
}

export const GET = ruta('cirugias/[id]#GET', manejarGET);
