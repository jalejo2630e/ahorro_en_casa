// Inicio de sesión con Google (OAuth 2.0, flujo "authorization code" + PKCE + state), sin librerías.
// Google solo identifica a la persona: entra únicamente si su correo (verificado por Google) fue
// autorizado por el administrador en la pestaña Cuenta. No se crea ninguna cuenta automáticamente.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_COOKIE = "ahorro_oauth";

export type GoogleConfig = { clientId: string; clientSecret: string; appUrl: URL };

/** Variables en .env.local: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y APP_URL (dirección pública de la app). */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const raw = process.env.APP_URL?.trim();
  if (!clientId || !clientSecret || !raw) return null;
  try {
    return { clientId, clientSecret, appUrl: new URL(raw) };
  } catch {
    return null;
  }
}

export const callbackUrl = (cfg: GoogleConfig) => new URL("/api/auth/google/callback", cfg.appUrl).toString();

const b64url = (b: Buffer) => b.toString("base64url");

export function newOAuthTransaction() {
  const state = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge };
}

export function authUrl(cfg: GoogleConfig, state: string, challenge: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callbackUrl(cfg),
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function sameValue(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cambia el código por un token y consulta a Google (por TLS, directo) qué correo es y si está verificado. */
export async function fetchGoogleEmail(cfg: GoogleConfig, code: string, verifier: string): Promise<string | null> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: callbackUrl(cfg),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) return null;
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
  return info.email && info.email_verified === true ? info.email : null;
}
