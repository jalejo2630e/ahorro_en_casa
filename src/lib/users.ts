// Usuarios, PIN y sesiones. Solo lógica + base de datos: nada de cookies ni de Next (eso vive en auth.ts),
// así se puede probar con un script.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export type Role = "admin" | "member";
export type SessionUser = { id: number; username: string; name: string; role: Role };

export const PIN_RE = /^\d{6}$/;
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 30;

// ---------- Hash del PIN (scrypt) ----------
function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Formato: scrypt:<sal en hex>:<hash en hex>. Cada PIN lleva su propia sal. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [kind, saltHex, keyHex] = stored.split(":");
  if (kind !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Hash de relleno: con un usuario inexistente igual se calcula un scrypt, para que el tiempo de
// respuesta no revele si el usuario existe.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPin("000000"));

// ---------- Validación ----------
export const normalizeUsername = (s: string) => s.trim().toLowerCase();

function assertNewCredentials(username: string, name: string, pin: string) {
  if (!USERNAME_RE.test(username)) throw new Error("El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion o guion bajo.");
  if (!name.trim() || name.trim().length > 60) throw new Error("Escribe un nombre (hasta 60 caracteres).");
  if (!PIN_RE.test(pin)) throw new Error("El PIN debe tener exactamente 6 dígitos.");
}

// ---------- Usuarios ----------
export const countUsers = () =>
  db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;

export function listUsers(now = Date.now()) {
  return db
    .select({
      id: users.id, username: users.username, name: users.name, role: users.role, active: users.active,
      lockedUntil: users.lockedUntil, createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.id)
    .all()
    .map(({ lockedUntil, ...u }) => ({ ...u, locked: lockedUntil != null && lockedUntil > now }));
}

export async function createUser(input: { username: string; name: string; pin: string; role?: Role }) {
  const username = normalizeUsername(input.username);
  assertNewCredentials(username, input.name, input.pin);
  if (db.select().from(users).where(eq(users.username, username)).get()) {
    throw new Error("Ese usuario ya existe.");
  }
  const pinHash = await hashPin(input.pin);
  return db.insert(users)
    .values({ username, name: input.name.trim(), pinHash, role: input.role ?? "member" })
    .returning({ id: users.id, username: users.username, name: users.name, role: users.role })
    .get();
}

const activeAdmins = () =>
  db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true))).get()?.n ?? 0;

/** Activa o desactiva un usuario (no se borra: conserva el historial de quién registró qué). */
export function setUserActive(userId: number, active: boolean) {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u) throw new Error("Usuario no encontrado.");
  if (!active && u.role === "admin" && u.active && activeAdmins() <= 1) {
    throw new Error("No puedes desactivar al único administrador.");
  }
  db.update(users).set({ active }).where(eq(users.id, userId)).run();
  if (!active) deleteUserSessions(userId); // cierra sus sesiones de inmediato
}

/** El administrador define un PIN nuevo: también desbloquea la cuenta y cierra sus sesiones. */
export async function resetPin(userId: number, newPin: string) {
  if (!PIN_RE.test(newPin)) throw new Error("El PIN debe tener exactamente 6 dígitos.");
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u) throw new Error("Usuario no encontrado.");
  const pinHash = await hashPin(newPin);
  db.update(users).set({ pinHash, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId)).run();
  deleteUserSessions(userId);
}

/** Cambio de PIN por el propio usuario: exige el PIN actual y deja abierta solo la sesión actual. */
export async function changeOwnPin(userId: number, currentPin: string, newPin: string, keepToken?: string) {
  if (!PIN_RE.test(newPin)) throw new Error("El PIN nuevo debe tener exactamente 6 dígitos.");
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || !(await verifyPinHash(currentPin, u.pinHash))) throw new Error("El PIN actual no es correcto.");
  const pinHash = await hashPin(newPin);
  db.update(users).set({ pinHash }).where(eq(users.id, userId)).run();
  deleteUserSessions(userId, keepToken);
}

// ---------- Inicio de sesión ----------
export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryInMinutes: number };

/** Mensaje igual para usuario inexistente, desactivado o PIN malo: no se revela cuál fue. */
export async function authenticate(usernameRaw: string, pin: string, now = Date.now()): Promise<AuthResult> {
  const username = normalizeUsername(usernameRaw);
  const u = USERNAME_RE.test(username) ? db.select().from(users).where(eq(users.username, username)).get() : undefined;

  if (!u || !u.active) {
    await verifyPinHash(pin, await getDummyHash()); // igualar tiempos
    return { ok: false, reason: "invalid" };
  }
  if (u.lockedUntil && u.lockedUntil > now) {
    return { ok: false, reason: "locked", retryInMinutes: Math.ceil((u.lockedUntil - now) / 60_000) };
  }

  const good = PIN_RE.test(pin) && (await verifyPinHash(pin, u.pinHash));
  if (!good) {
    const failed = u.failedAttempts + 1;
    if (failed >= MAX_FAILED_ATTEMPTS) {
      db.update(users).set({ failedAttempts: 0, lockedUntil: now + LOCK_MINUTES * 60_000 }).where(eq(users.id, u.id)).run();
      return { ok: false, reason: "locked", retryInMinutes: LOCK_MINUTES };
    }
    db.update(users).set({ failedAttempts: failed }).where(eq(users.id, u.id)).run();
    return { ok: false, reason: "invalid" };
  }

  db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id)).run();
  return { ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } };
}

// ---------- Sesiones ----------
const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(userId: number, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run(); // limpieza de vencidas
  db.insert(sessions).values({ id: tokenId(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export function userFromToken(token: string | undefined, now = Date.now()): SessionUser | null {
  if (!token) return null;
  const row = db
    .select({ id: users.id, username: users.username, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenId(token)), gt(sessions.expiresAt, now), eq(users.active, true)))
    .get();
  return row ?? null;
}

export function deleteSession(token: string) {
  db.delete(sessions).where(eq(sessions.id, tokenId(token))).run();
}

export function deleteUserSessions(userId: number, exceptToken?: string) {
  db.delete(sessions)
    .where(exceptToken ? and(eq(sessions.userId, userId), ne(sessions.id, tokenId(exceptToken))) : eq(sessions.userId, userId))
    .run();
}
