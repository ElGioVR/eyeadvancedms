import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";
import { bloqueoCompartido, falloCompartido, reiniciarCompartido } from "@/lib/rate-limit";
import { SESION_TEMPORAL_COOKIE, opcionesCookieAuth } from "@/lib/supabase/constants";
import { decidirSesion, etiquetaDispositivo, sessionIdDeToken } from "@/lib/sesion-unica";
import { leerSesionUsuario, registrarSesion, revocarSesion } from "@/services/sesion-unica";
import { ruta } from '@/lib/api/ruta';

const loginSchema = z
  .object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1).max(128),
    recordarme: z.boolean().optional(),
  })
  .strict();

function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

async function manejarPOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Credenciales inválidas" },
      { status: 401 },
    );
  }

  const { email, password } = validation.data;
  // Sin «Recordarme» las cookies de sesión mueren al cerrar el navegador.
  const temporal = validation.data.recordarme !== true;
  const clientIP = getClientIP(request);
  const rateKey = `${clientIP}:${email.trim().toLowerCase()}`;

  // Segundo límite solo por email: evita evadir el bloqueo rotando X-Forwarded-For
  const emailKey = `email:${email.trim().toLowerCase()}`;
  // Tercer límite solo por IP (holgado: la clínica comparte IP): frena el
  // «credential stuffing» contra muchos correos desde un mismo origen.
  const ipKey = `ip:${clientIP}`;
  // Límites compartidos entre instancias (Postgres); sin la migración, en memoria.
  const retry = await bloqueoCompartido([rateKey, emailKey, ipKey]);
  if (retry > 0) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta de nuevo en ${retry} segundos.` },
      { status: 429 },
    );
  }

  let response = NextResponse.json({ success: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({
            name,
            value,
            ...opcionesCookieAuth(options, temporal),
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response.cookies.set({
            name,
            value: "",
            ...options,
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          });
        },
      },
    },
  );

  // Sesión previa de ESTE navegador (p. ej. «Ir a login» desde una ventana
  // desplazada): se revoca al entrar con la nueva y no cuenta como otro dispositivo.
  const { data: previa } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const tokenPrevio = previa.session?.access_token ?? null;
  const sesionPrevia = sessionIdDeToken(tokenPrevio);

  const { data: acceso, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    console.error("[AUTH LOGIN]", {
      message: error.message,
      status: error.status,
      code: error.code,
    });

    const [, , result] = await Promise.all([
      falloCompartido(emailKey, 15),
      falloCompartido(ipKey, 60),
      falloCompartido(rateKey, 5),
    ]);
    if (result.blocked) {
      return NextResponse.json(
        { error: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${result.retryAfter} segundos.` },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Credenciales inválidas" },
      { status: 401 },
    );
  }

  await Promise.all([reiniciarCompartido(rateKey), reiniciarCompartido(emailKey)]);

  if (temporal) {
    // Cookie de sesión (sin maxAge): el middleware y los refrescos la leen.
    response.cookies.set({
      name: SESION_TEMPORAL_COOKIE,
      value: "1",
      // Legible desde el cliente (no es un secreto): el cliente de Supabase del
      // navegador también la respeta al refrescar el token.
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  } else {
    response.cookies.set({ name: SESION_TEMPORAL_COOKIE, value: "", path: "/", maxAge: 0 });
  }

  // Sesión única: la primera sesión conserva la prioridad. Si otra sigue activa,
  // esta queda en espera hasta que el usuario confirme «Trabajar aquí»
  // (POST /api/auth/sesion/tomar) o cancele (POST /api/auth/logout).
  const userId = acceso.user?.id;
  const sessionId = sessionIdDeToken(acceso.session?.access_token);
  if (tokenPrevio && sesionPrevia && sesionPrevia !== sessionId) await revocarSesion(tokenPrevio);
  if (userId && sessionId) {
    const actual = await leerSesionUsuario(userId);
    if (actual) {
      const mismoNavegador = !!sesionPrevia && actual.activaId === sesionPrevia;
      const decision = mismoNavegador
        ? "libre"
        : decidirSesion({ activaId: actual.activaId, vistaAt: actual.vistaAt, nuevaId: sessionId, ahoraMs: Date.now() });
      if (decision === "ocupada") {
        const espera = NextResponse.json(
          {
            requiereConfirmacion: true,
            dispositivo: actual.dispositivo || "otro dispositivo",
            desde: actual.desde,
          },
          { status: 409 },
        );
        // Mismas cookies de auth: «Trabajar aquí» usa esta sesión recién creada.
        response.cookies.getAll().forEach((c) => espera.cookies.set(c));
        return espera;
      }
      await registrarSesion(userId, sessionId, etiquetaDispositivo(request.headers.get("user-agent")));
    }
  }
  return response;
}

export const POST = ruta('auth/login#POST', manejarPOST);
