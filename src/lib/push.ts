// Avisos al celular (Web Push). Cada día, a partir de las 8 a. m., si hay pagos que vencen hoy, mañana o ya
// vencidos y sin pagar, el servidor manda UN aviso a los celulares suscritos. Funciona con la app cerrada;
// el aviso lo entrega Google/Apple al teléfono, y al tocarlo se abre la app (para entrar hace falta Tailscale).
import { eq } from "drizzle-orm";
import * as webpushModule from "web-push";
import { db } from "@/db";
import { pushSubscriptions, settings } from "@/db/schema";
import { daysBetween } from "./dates";
import { cop } from "./format";
import { getPayments, monthOf, toISO } from "./finance";

// web-push es CommonJS: según el empaquetador, sus funciones llegan en `default` o directamente.
const webpush: typeof webpushModule = (webpushModule as unknown as { default?: typeof webpushModule }).default ?? webpushModule;

export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Sub = { endpoint: string; p256dh: string; auth: string };
export type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

const SEND_FROM_HOUR = 8; // hora local a partir de la cual se manda el aviso del día
const CHECK_EVERY_MS = 15 * 60 * 1000;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const app = process.env.APP_URL ?? "";
  // El "subject" solo identifica al servidor ante Google/Apple; se usa la dirección de la app, sin datos personales.
  webpush.setVapidDetails(app.startsWith("https://") ? app : "mailto:avisos@ahorro-en-casa.invalid", pub, priv);
  configured = true;
  return true;
}

const realSender: Sender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 12 * 60 * 60, urgency: "high" });

// ---------- Suscripciones ----------
export function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userId: number) {
  db.insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId },
    })
    .run();
}
export function removeSubscription(endpoint: string) {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}
export function listSubscriptions(): Sub[] {
  return db.select().from(pushSubscriptions).all();
}
export function hasSubscription(endpoint: string): boolean {
  return !!db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
}

// ---------- Envío ----------
/** Manda el aviso a todos los celulares suscritos. Los que ya no existen (404/410) se borran solos. */
export async function sendToAll(payload: PushPayload, send: Sender = realSender, onlyEndpoint?: string) {
  if (send === realSender && !configure()) return { sent: 0, removed: 0, failed: 0, configured: false };
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0, failed = 0;
  for (const s of listSubscriptions().filter((x) => !onlyEndpoint || x.endpoint === onlyEndpoint)) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        removeSubscription(s.endpoint);
        removed++;
      } else {
        failed++;
        console.error("[avisos] no se pudo enviar:", code ?? (e instanceof Error ? e.message : e));
      }
    }
  }
  return { sent, removed, failed, configured: true };
}

// ---------- Qué se avisa ----------
export type DueItem = { name: string; amount: number; daysLeft: number };

/** Arma el texto del aviso con los pagos sin pagar que vencen hoy, mañana o ya vencieron. Sin pagos, null. */
export function composeReminder(items: DueItem[]): PushPayload | null {
  const due = items.filter((i) => i.daysLeft <= 1).sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, "es"));
  if (due.length === 0) return null;
  const when = (d: number) => (d < 0 ? `vencido hace ${-d} día${-d === 1 ? "" : "s"}` : d === 0 ? "hoy" : "mañana");
  const shown = due.slice(0, 4).map((i) => `${i.name} ${cop(i.amount)} (${when(i.daysLeft)})`);
  const rest = due.length - shown.length;
  const overdue = due.filter((i) => i.daysLeft < 0).length;
  return {
    title: overdue > 0 ? `${due.length} pago(s) por atender, ${overdue} vencido(s)` : `${due.length} pago(s) por vencer`,
    body: shown.join("\n") + (rest > 0 ? `\ny ${rest} más` : ""),
    url: "/pagos",
    tag: "pagos-del-dia",
  };
}

export function dueItems(today: string): DueItem[] {
  // El último día del mes también cuenta lo que vence "mañana", que es del mes siguiente.
  const tomorrow = toISO(new Date(Date.parse(today + "T12:00:00Z") + 86_400_000));
  const months = [...new Set([monthOf(today), monthOf(tomorrow)])];
  return months.flatMap((m) =>
    getPayments(m, today)
      .filter((p) => !p.paidAt)
      .map((p) => ({ name: p.name, amount: p.effectiveAmount, daysLeft: daysBetween(today, p.due) })),
  );
}

// ---------- Una vez al día ----------
const LAST_KEY = "push_last_sent";

/** Manda el aviso del día si ya es hora, hay celulares suscritos y hoy no se había mandado. */
export async function runDailyReminder(now: Date = new Date(), send?: Sender) {
  const today = toISO(now);
  if (now.getHours() < SEND_FROM_HOUR) return null;
  if (listSubscriptions().length === 0) return null;
  const last = db.select().from(settings).where(eq(settings.key, LAST_KEY)).get()?.value;
  if (last === today) return null;

  const msg = composeReminder(dueItems(today));
  // Se anota ANTES de enviar: si algo falla no se repite en bucle cada 15 minutos.
  db.insert(settings).values({ key: LAST_KEY, value: today }).onConflictDoUpdate({ target: settings.key, set: { value: today } }).run();
  if (!msg) return { sent: 0, removed: 0, failed: 0, configured: true, skipped: "sin pagos por vencer" };
  return sendToAll(msg, send);
}

const g = globalThis as unknown as { pushSchedulerStarted?: boolean };

export function startPushScheduler() {
  if (g.pushSchedulerStarted) return;
  g.pushSchedulerStarted = true;
  if (!configure()) return; // sin claves no hay avisos
  const run = () =>
    runDailyReminder()
      .then((r) => r && console.log("[avisos]", JSON.stringify(r)))
      .catch((e) => console.error("[avisos] falló:", e instanceof Error ? e.message : e));
  setTimeout(run, 30_000).unref();
  setInterval(run, CHECK_EVERY_MS).unref();
}
