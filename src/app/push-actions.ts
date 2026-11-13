"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { removeSubscription, saveSubscription, sendToAll } from "@/lib/push";

type Result = { ok: boolean; message: string };

// Solo se aceptan los servicios de avisos de los navegadores (así nadie hace que el servidor llame a una dirección cualquiera).
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const endpointSchema = z.url().refine((u) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}, "Este navegador usa un servicio de avisos no compatible");

const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export async function subscribePushAction(raw: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  saveSubscription(parsed.data, user.id);
  return { ok: true, message: "Avisos activados en este celular" };
}

export async function unsubscribePushAction(endpoint: string): Promise<Result> {
  await requireUser();
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  removeSubscription(parsed.data);
  return { ok: true, message: "Avisos desactivados en este celular" };
}

/** Manda un aviso de prueba SOLO a este celular. */
export async function testPushAction(endpoint: string): Promise<Result> {
  await requireUser();
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  const r = await sendToAll(
    { title: "Prueba de avisos", body: "Si ves esto, los avisos de pagos funcionan.", url: "/pagos", tag: "prueba" },
    undefined,
    parsed.data,
  );
  if (!r.configured) return { ok: false, message: "Faltan las claves de avisos en el servidor" };
  if (r.sent > 0) return { ok: true, message: "Enviado: debería llegarte en unos segundos" };
  if (r.removed > 0) return { ok: false, message: "Este celular ya no está registrado; vuelve a activar los avisos" };
  return { ok: false, message: "No se pudo enviar el aviso" };
}
