import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/lib/auth";
import { fetchGoogleEmail, googleConfig, OAUTH_COOKIE, sameValue } from "@/lib/google";
import { userByEmail } from "@/lib/users";

/** Paso 2: Google vuelve aquí con un código. Entra solo quien tenga su correo autorizado. */
export async function GET(request: NextRequest) {
  const cfg = googleConfig();
  const to = (path: string) => NextResponse.redirect(new URL(path, cfg?.appUrl ?? request.url));
  if (!cfg) return to("/login?error=google_off");

  const store = await cookies();
  const saved = store.get(OAUTH_COOKIE)?.value ?? "";
  store.delete(OAUTH_COOKIE); // un solo uso

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const [savedState, verifier] = saved.split(".");
  if (params.get("error")) return to("/login?error=google_denied");
  if (!code || !savedState || !verifier || !sameValue(state, savedState)) return to("/login?error=google_failed");

  let email: string | null = null;
  try {
    email = await fetchGoogleEmail(cfg, code, verifier);
  } catch {
    return to("/login?error=google_failed");
  }
  if (!email) return to("/login?error=google_failed");

  const user = userByEmail(email);
  if (!user) return to("/login?error=google_unauthorized");

  await startSession(user.id);
  return to("/");
}
