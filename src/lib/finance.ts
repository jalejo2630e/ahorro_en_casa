import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories, paymentSchedule, paymentStatus, pockets, savingsGoals, transactions,
} from "@/db/schema";

export type Semaphore = "pagado" | "pendiente" | "urgente";
export type Medal = "oro" | "plata" | "bronce" | "ninguna";

const URGENT_DAYS = 3;

// ---------- Fechas (sin zona horaria: todo en YYYY-MM-DD local) ----------
export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const monthOf = (iso: string) => iso.slice(0, 7);
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
/** Un día 30 en febrero cae el último día del mes. */
export function dueDate(month: string, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}
export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISOStr + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

// ---------- Reglas puras (fáciles de probar) ----------
export function semaphore(paid: boolean, due: string, today: string): Semaphore {
  if (paid) return "pagado";
  return daysBetween(today, due) <= URGENT_DAYS ? "urgente" : "pendiente"; // incluye vencidos
}
export function medalFor(saved: number, target: number): Medal {
  if (target <= 0) return "ninguna";
  const r = saved / target;
  if (r >= 1) return "oro";
  if (r >= 0.75) return "plata";
  if (r >= 0.5) return "bronce";
  return "ninguna";
}

// ---------- Calendario de pagos ----------
export function getPayments(month: string, today: string) {
  const rows = db
    .select({
      id: paymentSchedule.id,
      name: paymentSchedule.name,
      amount: paymentSchedule.amount,
      dayOfMonth: paymentSchedule.dayOfMonth,
      category: categories.name,
      paidAt: paymentStatus.paidAt,
    })
    .from(paymentSchedule)
    .leftJoin(categories, eq(categories.id, paymentSchedule.categoryId))
    .leftJoin(
      paymentStatus,
      and(eq(paymentStatus.scheduleId, paymentSchedule.id), eq(paymentStatus.month, month)),
    )
    .where(eq(paymentSchedule.active, true))
    .all();

  return rows
    .map((r) => {
      const due = dueDate(month, r.dayOfMonth);
      return {
        ...r,
        due,
        status: semaphore(!!r.paidAt, due, today),
        daysLeft: daysBetween(today, due),
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

export function upcomingPayments(days: number, today: string) {
  return getPayments(monthOf(today), today).filter(
    (p) => p.status !== "pagado" && p.daysLeft <= days,
  );
}

// ---------- Movimientos ----------
function pocketId(name: string): number | null {
  return db.select().from(pockets).where(eq(pockets.name, name)).get()?.id ?? null;
}
function adjustPocket(id: number | null, delta: number) {
  if (id == null) return;
  db.update(pockets).set({ balance: sql`${pockets.balance} + ${delta}` }).where(eq(pockets.id, id)).run();
}

/** Marca una obligación como pagada: crea el gasto y descuenta del bolsillo. Idempotente. */
export function markPaid(scheduleId: number, month: string, paidOn: string, source: "web" | "mcp" = "web") {
  return db.transaction((tx) => {
    const item = tx.select().from(paymentSchedule).where(eq(paymentSchedule.id, scheduleId)).get();
    if (!item) throw new Error("Obligación no encontrada");
    const existing = tx
      .select().from(paymentStatus)
      .where(and(eq(paymentStatus.scheduleId, scheduleId), eq(paymentStatus.month, month))).get();
    if (existing?.paidAt) return { alreadyPaid: true as const };

    const pid = pocketId("Gastos del mes");
    const t = tx.insert(transactions).values({
      type: "gasto", concept: item.name, amount: item.amount, categoryId: item.categoryId,
      pocketId: pid, date: paidOn, scheduleId, source,
    }).returning().get();
    adjustPocket(pid, -item.amount);
    if (existing) {
      tx.update(paymentStatus).set({ paidAt: paidOn, transactionId: t.id }).where(eq(paymentStatus.id, existing.id)).run();
    } else {
      tx.insert(paymentStatus).values({ scheduleId, month, paidAt: paidOn, transactionId: t.id }).run();
    }
    return { alreadyPaid: false as const, transactionId: t.id };
  });
}

export function addExpense(
  input: { concept: string; amount: number; category?: string; date: string },
  source: "web" | "mcp" = "web",
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Monto inválido");
  return db.transaction((tx) => {
    const cat = input.category
      ? tx.select().from(categories).where(eq(categories.name, input.category)).get()
      : undefined;
    const pid = pocketId("Gastos del mes");
    const t = tx.insert(transactions).values({
      type: "gasto", concept: input.concept, amount: input.amount,
      categoryId: cat?.id ?? null, pocketId: pid, date: input.date, source,
    }).returning().get();
    adjustPocket(pid, -input.amount);
    return t;
  });
}

/** Registra un ingreso y aparta automáticamente savePercent % al ahorro intocable. */
export function addIncome(
  input: { concept: string; amount: number; date: string; savePercent?: number },
  source: "web" | "mcp" = "web",
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Monto inválido");
  const pct = Math.min(Math.max(input.savePercent ?? 0, 0), 100);
  return db.transaction((tx) => {
    const saved = Math.round((input.amount * pct) / 100);
    const spendable = input.amount - saved;
    const t = tx.insert(transactions).values({
      type: "ingreso", concept: input.concept, amount: input.amount,
      pocketId: pocketId("Gastos del mes"), date: input.date, source,
    }).returning().get();
    adjustPocket(pocketId("Gastos del mes"), spendable);
    adjustPocket(pocketId("Ahorro intocable"), saved);
    return { transaction: t, saved, spendable };
  });
}

// ---------- Resumen y meta ----------
export function getSummary(month: string, today: string) {
  const sums = db
    .select({ type: transactions.type, total: sql<number>`coalesce(sum(${transactions.amount}),0)` })
    .from(transactions).where(like(transactions.date, `${month}-%`)).groupBy(transactions.type).all();
  const income = sums.find((s) => s.type === "ingreso")?.total ?? 0;
  const expenses = sums.find((s) => s.type === "gasto")?.total ?? 0;
  const pendingObligations = getPayments(month, today)
    .filter((p) => p.status !== "pagado").reduce((a, p) => a + p.amount, 0);

  return {
    month, income, expenses, pendingObligations,
    savingsRate: income > 0 ? (income - expenses) / income : 0,
    margin: income - expenses - pendingObligations, // lo realmente libre
  };
}

export function getExpensesByCategory(month: string) {
  return db
    .select({
      category: sql<string>`coalesce(${categories.name}, 'Sin categoría')`,
      color: sql<string>`coalesce(${categories.color}, '#94a3b8')`,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.type, "gasto"), like(transactions.date, `${month}-%`)))
    .groupBy(categories.id).all();
}

export function getSavingsGoal(month: string) {
  const year = Number(month.slice(0, 4));
  const goal = db.select().from(savingsGoals).where(eq(savingsGoals.year, year)).get();
  const pocket = db.select().from(pockets).where(eq(pockets.name, "Ahorro intocable")).get();
  const saved = pocket?.balance ?? 0;
  const monthly = goal?.monthlyTarget ?? 0;
  const yearly = goal?.yearlyTarget ?? 0;
  return {
    saved, monthlyTarget: monthly, yearlyTarget: yearly,
    monthlyProgress: monthly ? Math.min(saved / monthly, 1) : 0,
    yearlyProgress: yearly ? Math.min(saved / yearly, 1) : 0,
    medal: medalFor(saved, monthly),
  };
}

export function listCategories() {
  return db.select().from(categories).all();
}
