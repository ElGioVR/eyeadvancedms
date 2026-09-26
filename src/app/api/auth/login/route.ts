import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";
import { checkRateLimit, recordFailedAttempt, recordSuccessfulLogin } from "@/lib/rate-limit";

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request: NextRequest) {
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
  const clientIP = getClientIP(request);
  const rateKey = `${clientIP}:${email.trim().toLowerCase()}`;

  // Segundo límite solo por email: evita evadir el bloqueo rotando X-Forwarded-For
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const rateCheck = checkRateLimit(rateKey);
  const emailCheck = checkRateLimit(emailKey);
  if (!rateCheck.allowed || !emailCheck.allowed) {
    const retry = Math.max(rateCheck.retryAfter ?? 0, emailCheck.retryAfter ?? 0);
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
            ...options,
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

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    console.error("[AUTH LOGIN]", {
      message: error.message,
      status: error.status,
      code: error.code,
    });

    recordFailedAttempt(emailKey, 15);
    const result = recordFailedAttempt(rateKey);
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

  recordSuccessfulLogin(rateKey);
  recordSuccessfulLogin(emailKey);
  return response;
}
