import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { SESION_TEMPORAL_COOKIE, VERIFIED_USER_HEADER, opcionesCookieAuth } from './constants';
import { CODIGO_SESION_REEMPLAZADA, LATIDO_MS, sesionVigente } from '@/lib/sesion-unica';
import { enSegundoPlano } from '@/lib/segundo-plano';

/**
 * Roles de usuario. 'enfermero' es restringido: solo su propia agenda y, si
 * su ficha de personal tiene honorarios activos, «Mis honorarios». Solo entra
 * a los endpoints que lo listan explícitamente en requireRole.
 */
export type UserRole = 'admin' | 'doctor' | 'recepcionista' | 'enfermero';

export function createClient() {
  const cookieStore = cookies();
  const temporal = cookieStore.has(SESION_TEMPORAL_COOKIE);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value,
              ...opcionesCookieAuth(options, temporal),
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            });
          } catch {
            // Server component — can't set cookies
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value: '',
              ...options,
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 0,
            });
          } catch {
            // Server component — can't set cookies
          }
        },
      },
    }
  );
}

export interface SesionUser {
  id: string;
  email: string | null;
  /** Claim `session_id` del JWT (sesión de Supabase Auth); null si no viene. */
  sessionId?: string | null;
}

export interface PerfilSesion {
  rol: UserRole;
  activo: boolean;
  nombre: string | null;
  email: string | null;
  preferencias: Record<string, unknown>;
  /** Sesión con prioridad (sesión única). null = sin registrar o sin migración 450. */
  sesionActivaId: string | null;
}

/*
 * ── Caché de sesión por instancia ──────────────────────────────────────────
 * Antes, cada request API pagaba en serie: auth.getUser() (viaje HTTP a
 * Supabase Auth) + SELECT del perfil para el rol. Ahora:
 *  1. El JWT se verifica con auth.getClaims() (firma local con JWKS cuando el
 *     proyecto usa llaves asimétricas; si no, cae a getUser()). El resultado se
 *     memoriza por token hasta 30 s (nunca más allá de su `exp`).
 *  2. El perfil (rol/activo/preferencias) se pide EN PARALELO con la
 *     verificación y se memoriza 15 s por usuario. Los cambios de rol, estado o
 *     preferencias llaman a invalidarPerfil() para verse al instante en esta
 *     instancia (otras instancias lo ven en ≤15 s).
 * El perfil especulativo se descarta si la verificación falla: nunca se usa un
 * id no verificado para autorizar.
 */
const AUTH_TTL_MS = 30_000;
const PERFIL_TTL_MS = 15_000;
const MAX_ENTRADAS = 2_000;

const tokens = new Map<string, { user: SesionUser; hasta: number }>();
const perfiles = new Map<string, { promise: Promise<PerfilSesion | null>; hasta: number }>();

function podar<V extends { hasta: number }>(mapa: Map<string, V>) {
  if (mapa.size < MAX_ENTRADAS) return;
  const ahora = Date.now();
  mapa.forEach((v, k) => {
    if (v.hasta <= ahora) mapa.delete(k);
  });
  if (mapa.size >= MAX_ENTRADAS) mapa.clear();
}

/** Lee `sub` del JWT SIN verificarlo (solo para lanzar consultas en paralelo). */
function subSinVerificar(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

const COLUMNAS_PERFIL = 'rol, activo, nombre, email, preferencias';
/** false si la BD aún no tiene las columnas de sesión única (se detecta una vez). */
let columnasSesion = true;

/** Perfil del usuario (rol, activo, preferencias) con caché corta por instancia. */
export function obtenerPerfil(userId: string): Promise<PerfilSesion | null> {
  const ahora = Date.now();
  const hit = perfiles.get(userId);
  if (hit && hit.hasta > ahora) return hit.promise;

  // Import diferido: este módulo también lo usan Server Components.
  const promise = import('./admin')
    .then(async ({ getSupabaseAdmin }) => {
      const leer = (columnas: string) =>
        getSupabaseAdmin().from('usuarios').select(columnas).eq('id', userId).maybeSingle<Record<string, unknown>>();
      if (columnasSesion) {
        const r = await leer(`${COLUMNAS_PERFIL}, sesion_activa_id`);
        // 42703 = columna inexistente: la migración 450 aún no se aplica → sin sesión única.
        if (!r.error || r.error.code !== '42703') return r;
        columnasSesion = false;
      }
      return leer(COLUMNAS_PERFIL);
    })
    .then(({ data, error }) => {
      if (error || !data) {
        perfiles.delete(userId); // no cachear fallos
        return null;
      }
      return {
        rol: data.rol as UserRole,
        activo: data.activo === true,
        nombre: (data.nombre as string | null) ?? null,
        email: (data.email as string | null) ?? null,
        preferencias:
          data.preferencias && typeof data.preferencias === 'object'
            ? (data.preferencias as Record<string, unknown>)
            : {},
        sesionActivaId: typeof data.sesion_activa_id === 'string' ? data.sesion_activa_id : null,
      } satisfies PerfilSesion;
    })
    .catch(() => {
      perfiles.delete(userId);
      return null;
    });

  podar(perfiles);
  perfiles.set(userId, { promise, hasta: ahora + PERFIL_TTL_MS });
  return promise;
}

/** Olvida el perfil memorizado (llamar tras cambiar rol, activo o preferencias). */
export function invalidarPerfil(userId: string): void {
  perfiles.delete(userId);
}

async function verificarToken(
  supabase: ReturnType<typeof createClient>,
  token: string,
): Promise<SesionUser | null> {
  const ahora = Date.now();
  const hit = tokens.get(token);
  if (hit && hit.hasta > ahora) return hit.user;

  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== 'string') return null;

  const user: SesionUser = {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    sessionId: typeof (claims as { session_id?: unknown }).session_id === 'string' ? (claims as { session_id: string }).session_id : null,
  };
  const expMs = typeof claims.exp === 'number' ? claims.exp * 1000 : ahora;
  const hasta = Math.min(ahora + AUTH_TTL_MS, expMs);
  if (hasta > ahora) {
    podar(tokens);
    tokens.set(token, { user, hasta });
  }
  return user;
}

/**
 * Autentica la request (route handlers /api).
 * - 401 si no hay sesión válida.
 * - 403 si el usuario existe pero está desactivado.
 * Devuelve el usuario verificado y su perfil (ya memorizado para requireRole).
 */
export async function requireAuth(): Promise<{ user: SesionUser; perfil: PerfilSesion | null } | NextResponse> {
  const supabase = createClient();
  // Local: lee la cookie y, si el access token expiró, lo refresca y reescribe cookies.
  const { data: sesionData } = await supabase.auth.getSession();
  const token = sesionData.session?.access_token;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const idProbable = subSinVerificar(token);
  const perfilEspeculativo = idProbable ? obtenerPerfil(idProbable) : null;

  const user = await verificarToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let perfil = await (user.id === idProbable && perfilEspeculativo ? perfilEspeculativo : obtenerPerfil(user.id));
  // La sesión vigente pudo cambiar hace instantes (renovación en otra instancia):
  // antes de rechazar, se confirma con el perfil recién leído (caso raro).
  if (perfil && !sesionVigente(perfil.sesionActivaId, user.sessionId)) {
    invalidarPerfil(user.id);
    perfil = await obtenerPerfil(user.id);
  }
  // Sin fila en `usuarios` (cuenta de Auth ajena a la clínica) o desactivado → sin acceso
  if (!perfil) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!perfil.activo) {
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 });
  }
  // Sesión única: si otro dispositivo tomó la sesión («Trabajar aquí»), esta se cierra.
  if (!sesionVigente(perfil.sesionActivaId, user.sessionId)) {
    return NextResponse.json(
      { error: 'Tu sesión se cerró porque se inició en otro dispositivo.', code: CODIGO_SESION_REEMPLAZADA },
      { status: 401 },
    );
  }
  if (perfil.sesionActivaId && user.sessionId) registrarActividad(user.id, user.sessionId);

  return { user, perfil };
}

const ultimoLatido = new Map<string, number>();

/**
 * Marca actividad de la sesión con prioridad (como máximo 1 vez por minuto por
 * usuario e instancia). Así un login en otro dispositivo sabe si esta sesión
 * sigue en uso o puede reemplazarse sin preguntar.
 */
function registrarActividad(userId: string, sessionId: string): void {
  const ahora = Date.now();
  if ((ultimoLatido.get(userId) ?? 0) + LATIDO_MS > ahora) return;
  if (ultimoLatido.size > MAX_ENTRADAS) ultimoLatido.clear();
  ultimoLatido.set(userId, ahora);
  const tarea = import('./admin').then(({ getSupabaseAdmin }) =>
    getSupabaseAdmin()
      .from('usuarios')
      .update({ sesion_vista_at: new Date(ahora).toISOString() })
      .eq('id', userId)
      .eq('sesion_activa_id', sessionId)
      .then(({ error }) => {
        if (error) ultimoLatido.delete(userId);
      }),
  );
  enSegundoPlano(tarea, 'sesion.latido');
}

export async function requireRole(
  user: SesionUser,
  allowedRoles: readonly UserRole[]
): Promise<NextResponse | null> {
  const profile = await obtenerPerfil(user.id);

  if (!profile || profile.activo !== true || !allowedRoles.includes(profile.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  return null;
}

/**
 * Id del usuario autenticado para Server Components (páginas).
 * Usa el id que el middleware ya verificó con Supabase Auth en esta misma
 * petición; si no está (p. ej. fuera del matcher), verifica el JWT aquí.
 * NO usar en route handlers /api (el middleware no corre ahí): usar requireAuth().
 */
export async function getVerifiedUserId(): Promise<string | null> {
  const fromMiddleware = headers().get(VERIFIED_USER_HEADER);
  if (fromMiddleware) return fromMiddleware;
  const { data } = await createClient().auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === 'string' ? sub : null;
}

/**
 * Ejecuta una lectura en paralelo con la verificación de rol (ya iniciada).
 * Ahorra 1 viaje en serie por request. Si el rol se rechaza, el resultado de
 * `trabajo` se descarta sin devolverse al cliente. SOLO para lecturas sin
 * efectos secundarios; las mutaciones deben esperar a `requireRole` primero.
 */
export async function leerConRol<T>(
  rolP: Promise<NextResponse | null>,
  trabajo: () => Promise<T>
): Promise<{ denegado: NextResponse } | { datos: T }> {
  const trabajoP = trabajo();
  let denegado: NextResponse | null;
  try {
    denegado = await rolP;
  } catch (err) {
    void trabajoP.catch(() => undefined);
    throw err;
  }
  if (denegado) {
    void trabajoP.catch(() => undefined);
    return { denegado };
  }
  return { datos: await trabajoP };
}
