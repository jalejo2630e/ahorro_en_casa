import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleConfig, newOAuthTransaction, OAUTH_COOKIE } from "@/lib/google";

/** Paso 1: manda a la persona a Google. */
export async function GET(request: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?error=google_off", request.url));

  // Las cookies pertenecen a un solo host: si abrieron la app por otra dirección, se vuelve a empezar en APP_URL.
  const host = request.headers.get("host") ?? "";
  if (host !== cfg.appUrl.host) return NextResponse.redirect(new URL("/api/auth/google", cfg.appUrl));

  const { state, verifier, challenge } = newOAuthTransaction();
  (await cookies()).set(OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    sameSite: "lax", // debe poder viajar en la redirección de vuelta desde Google
    secure: cfg.appUrl.protocol === "https:",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(authUrl(cfg, state, challenge));
}
