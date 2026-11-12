// Sesión con cookie + verificación en el servidor. La lógica de usuarios vive en ./users.
// Regla: el proxy solo hace una revisión rápida de la cookie; la verificación REAL se hace aquí,
// en cada página (requireUser) y en cada Server Action.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, userFromToken, type SessionUser } from "./users";

export const SESSION_COOKIE = "ahorro_session";

/** Pon COOKIE_SECURE=true en .env.local cuando la app se sirva por HTTPS (p. ej. con Tailscale). */
const cookieSecure = () => process.env.COOKIE_SECURE === "true";

export async function currentToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Usuario de la sesión actual, o null. Se memoriza durante el render de una misma petición. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return userFromToken(await currentToken());
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Solo el administrador puede hacer esto.");
  return user;
}

/** Crea la sesión y fija la cookie (solo desde una Server Action). */
export async function startSession(userId: number) {
  const { token, expiresAt } = createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // el JavaScript de la página no puede leerla
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** ¿La petición viene de esta misma PC (localhost)? El primer administrador solo se crea desde aquí. */
export async function isLocalRequest(): Promise<boolean> {
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
