import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { fechaISO, leerQuery, uuid } from '@/lib/api/validar';
import { detectarConflictosAgenda } from '@/lib/agenda-conflictos';
import { ruta } from '@/lib/api/ruta';

const querySchema = z.object({
  medico_id: uuid,
  fecha: fechaISO,
  /** Entidad a ignorar (p. ej. la propia consulta al reagendarla). */
  excluir_id: uuid.optional(),
});

/**
 * GET /api/agenda/disponibilidad?medico_id=&fecha=[&excluir_id=]
 *
 * Devuelve los rangos ocupados del médico en el día (consultas, estudios,
 * procedimientos y cirugías no canceladas) para que la UI deshabilite los
 * slots de 15 min ya tomados. Reutiliza detectarConflictosAgenda con un
 * intervalo de día completo, así la regla es idéntica a la del POST/PATCH.
 * Solo devuelve horarios (sin datos del paciente).
 */
async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;

  const t0 = Date.now();
  const conflictos = await detectarConflictosAgenda({
    fecha: q.fecha,
    hora: '00:00',
    duracion_min: 24 * 60,
    medicos: [q.medico_id],
  });

  // Una misma consulta puede aparecer como consulta y como concepto: se deduplica.
  const vistos = new Set<string>();
  const ocupados = conflictos
    .filter((c) => c.entidad_id !== q.excluir_id)
    .filter((c) => {
      const k = `${c.entidad_id}|${c.hora_inicio}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map((c) => ({
      tipo: c.tipo,
      entidad_id: c.entidad_id,
      hora_inicio: c.hora_inicio.slice(0, 5),
      hora_fin: c.hora_fin.slice(0, 5),
    }))
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  return NextResponse.json(
    { fecha: q.fecha, medico_id: q.medico_id, ocupados },
    { headers: { 'Cache-Control': 'private, no-store', 'Server-Timing': `db;dur=${Date.now() - t0}` } }
  );
}

export const GET = ruta('agenda/disponibilidad#GET', manejarGET);
