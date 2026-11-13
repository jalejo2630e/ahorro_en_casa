"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  currentToken, endSession, isLocalRequest, requireAdmin, requireUser, startSession,
} from "@/lib/auth";
import {
  authenticate, changeOwnPin, countUsers, createUser, resetPin, setUserActive, setUserEmail,
} from "@/lib/users";

export type AuthState = { ok: boolean; message: string } | null;

const GENERIC_ERROR = "Usuario o PIN incorrecto.";

/** Inicio de sesión: el mismo mensaje para usuario inexistente, desactivado o PIN malo. */
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ username: z.string().max(60), pin: z.string().max(20) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: GENERIC_ERROR };

  const result = await authenticate(parsed.data.username, parsed.data.pin);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "locked"
          ? `Demasiados intentos. Espera ${result.retryInMinutes} minuto(s) e inténtalo de nuevo.`
          : GENERIC_ERROR,
    };
  }
  await startSession(result.user.id);
  redirect("/"); // fuera de try/catch: redirect funciona lanzando una excepción interna
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * Primer administrador. Solo funciona si NO hay ningún usuario y la petición viene de esta misma PC:
 * así nadie de tu red puede adueñarse de la app antes que tú.
 */
export async function setupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (countUsers() > 0) redirect("/login");
  if (!(await isLocalRequest())) {
    return { ok: false, message: "El primer administrador se crea desde la PC donde corre la app (http://localhost:3000)." };
  }
  const parsed = z
    .object({ username: z.string(), name: z.string(), pin: z.string(), pin2: z.string(), email: z.string().max(120).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Completa todos los campos." };
  if (parsed.data.pin !== parsed.data.pin2) return { ok: false, message: "Los dos PIN no coinciden." };

  let userId: number;
  try {
    const user = await createUser({
      username: parsed.data.username, name: parsed.data.name, pin: parsed.data.pin, role: "admin",
      email: parsed.data.email,
    });
    userId = user.id;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo crear el usuario." };
  }
  await startSession(userId);
  redirect("/");
}

// ---------- Cuenta propia ----------
export async function changeOwnPinAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await requireUser();
  const parsed = z
    .object({ current: z.string(), next: z.string(), next2: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Completa todos los campos." };
  if (parsed.data.next !== parsed.data.next2) return { ok: false, message: "Los dos PIN nuevos no coinciden." };
  try {
    await changeOwnPin(user.id, parsed.data.current, parsed.data.next, await currentToken());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo cambiar el PIN." };
  }
  return { ok: true, message: "PIN actualizado. Se cerraron tus otras sesiones." };
}

// ---------- Administración (solo administrador) ----------
export async function createUserAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await requireAdmin();
  const parsed = z
    .object({
      username: z.string(), name: z.string(), pin: z.string(),
      role: z.enum(["member", "admin"]).default("member"),
      email: z.string().max(120).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Completa todos los campos." };
  try {
    const u = await createUser(parsed.data);
    revalidatePath("/cuenta");
    return { ok: true, message: `Usuario "${u.username}" creado. Entrégale su PIN en persona.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo crear el usuario." };
  }
}

export async function resetPinAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await requireAdmin();
  const parsed = z
    .object({ userId: z.coerce.number().int().positive(), pin: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  try {
    await resetPin(parsed.data.userId, parsed.data.pin);
    revalidatePath("/cuenta");
    return { ok: true, message: "PIN restablecido y cuenta desbloqueada." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo restablecer." };
  }
}

export async function setEmailAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await requireAdmin();
  const parsed = z
    .object({ userId: z.coerce.number().int().positive(), email: z.string().max(120) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  try {
    setUserEmail(parsed.data.userId, parsed.data.email);
    revalidatePath("/cuenta");
    return { ok: true, message: parsed.data.email.trim() ? "Correo guardado." : "Correo quitado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar el correo." };
  }
}

export async function setActiveAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ userId: z.coerce.number().int().positive(), active: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  if (parsed.data.userId === admin.id && parsed.data.active === "false") {
    return { ok: false, message: "No puedes desactivar tu propia cuenta." };
  }
  try {
    setUserActive(parsed.data.userId, parsed.data.active === "true");
    revalidatePath("/cuenta");
    return { ok: true, message: parsed.data.active === "true" ? "Usuario activado." : "Usuario desactivado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo actualizar." };
  }
}
