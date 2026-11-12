import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories, incomeReceipts, incomeSchedule, paymentSchedule, paymentStatus, pockets, savingsGoals,
  settings, transactions,
} from "@/db/schema";
import { daysBetween, daysInMonth, dueDate, monthOf } from "./dates";
import { incomeOccurrences, type IncomeRule } from "./income";

export type IncomeStatus = "recibido" | "pendiente" | "atrasado";

export type Semaphore = "pagado" | "pendiente" | "urgente";
export type Medal = "oro" | "plata" | "bronce" | "ninguna";

const URGENT_DAYS = 3;

// Fechas puras: viven en ./dates (también las usa el cliente); se re-exportan por comodidad.
export { toISO, monthOf, daysInMonth, dueDate, daysBetween, weekdayOf } from "./dates";

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

// ---------- Fecha de inicio ----------
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Primer mes que llevas en la app. Los meses anteriores no tienen pagos ni ingresos esperados
 * (así no aparecen como vencidos). Sin configurar: el mes del primer movimiento, o el mes de hoy.
 */
export function getStartMonth(today: string): string {
  const set = db.select().from(settings).where(eq(settings.key, "start_month")).get();
  if (set && MONTH_RE.test(set.value)) return set.value;
  const first = db.select({ m: sql<string | null>`min(substr(${transactions.date}, 1, 7))` }).from(transactions).get()?.m;
  return first ?? monthOf(today);
}

export function setStartMonth(month: string) {
  if (!MONTH_RE.test(month)) throw new Error("Mes inválido (usa AAAA-MM)");
  db.insert(settings).values({ key: "start_month", value: month })
    .onConflictDoUpdate({ target: settings.key, set: { value: month } }).run();
}

export function isBeforeStart(month: string, today: string): boolean {
  return month < getStartMonth(today);
}

// ---------- Calendario de pagos ----------
export function getPayments(month: string, today: string) {
  const rows = db
    .select({
      id: paymentSchedule.id,
      name: paymentSchedule.name,
      amount: paymentSchedule.amount,
      dayOfMonth: paymentSchedule.dayOfMonth,
      priority: paymentSchedule.priority,
      fundingSource: paymentSchedule.fundingSource,
      category: categories.name,
      paidAt: paymentStatus.paidAt,
      paidAmount: transactions.amount, // lo que realmente se pagó (puede diferir del programado)
    })
    .from(paymentSchedule)
    .leftJoin(categories, eq(categories.id, paymentSchedule.categoryId))
    .leftJoin(
      paymentStatus,
      and(eq(paymentStatus.scheduleId, paymentSchedule.id), eq(paymentStatus.month, month)),
    )
    .leftJoin(transactions, eq(transactions.id, paymentStatus.transactionId))
    .where(eq(paymentSchedule.active, true))
    .all();

  const result = rows
    .map((r) => {
      const due = dueDate(month, r.dayOfMonth);
      return {
        ...r,
        // Pagado: lo realmente pagado; sin pagar: lo programado
        effectiveAmount: r.paidAt && r.paidAmount != null ? r.paidAmount : r.amount,
        due,
        status: semaphore(!!r.paidAt, due, today),
        daysLeft: daysBetween(today, due),
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
  // Antes de la fecha de inicio no se llevan pagos (así no aparecen como vencidos)
  return isBeforeStart(month, today) ? result.slice(0, 0) : result;
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
export function markPaid(
  scheduleId: number, month: string, paidOn: string, source: "web" | "mcp" = "web",
  amount?: number, // monto realmente pagado; si falta, el programado
) {
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) throw new Error("Monto inválido");
  return db.transaction((tx) => {
    const item = tx.select().from(paymentSchedule).where(eq(paymentSchedule.id, scheduleId)).get();
    if (!item) throw new Error("Obligación no encontrada");
    const existing = tx
      .select().from(paymentStatus)
      .where(and(eq(paymentStatus.scheduleId, scheduleId), eq(paymentStatus.month, month))).get();
    if (existing?.paidAt) return { alreadyPaid: true as const };

    // El pago pertenece al mes que se está marcando: se fecha dentro de ese mes, no con la fecha de hoy
    const date = dateWithinMonth(month, dueDate(month, item.dayOfMonth), paidOn);
    const paid = amount ?? item.amount;
    const pid = pocketId("Gastos del mes");
    const t = tx.insert(transactions).values({
      type: "gasto", concept: item.name, amount: paid, categoryId: item.categoryId,
      pocketId: pid, date, scheduleId, source,
    }).returning().get();
    adjustPocket(pid, -paid);
    if (existing) {
      tx.update(paymentStatus).set({ paidAt: date, transactionId: t.id }).where(eq(paymentStatus.id, existing.id)).run();
    } else {
      tx.insert(paymentStatus).values({ scheduleId, month, paidAt: date, transactionId: t.id }).run();
    }
    return { alreadyPaid: false as const, transactionId: t.id };
  });
}

/** Deshace "pagado": borra el gasto de ese pago y devuelve el monto al bolsillo. */
export function unmarkPaid(scheduleId: number, month: string): boolean {
  return db.transaction((tx) => {
    const st = tx.select().from(paymentStatus)
      .where(and(eq(paymentStatus.scheduleId, scheduleId), eq(paymentStatus.month, month))).get();
    if (!st?.paidAt) return false;
    const t = st.transactionId
      ? tx.select().from(transactions).where(eq(transactions.id, st.transactionId)).get()
      : undefined;
    if (t) {
      adjustPocket(t.pocketId, t.amount);
      tx.delete(transactions).where(eq(transactions.id, t.id)).run();
    }
    tx.update(paymentStatus).set({ paidAt: null, transactionId: null }).where(eq(paymentStatus.id, st.id)).run();
    return true;
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

/**
 * Fecha con la que se registra un movimiento que pertenece a `month`: hoy si es el mes actual;
 * si es de otro mes, la fecha propia del movimiento (o el último día del mes si no tiene).
 * Así lo que marcas en un mes nunca se cuenta en otro.
 */
function dateWithinMonth(month: string, own: string | null, today: string): string {
  if (monthOf(today) === month) return today;
  return own ?? `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function applyIncome(
  tx: Tx,
  input: { concept: string; amount: number; date: string; savePercent?: number; extra?: boolean },
  source: "web" | "mcp",
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Monto inválido");
  // El dinero extra (regalos) va completo al presupuesto diario: nunca se aparta para ahorro
  const pct = input.extra ? 0 : Math.min(Math.max(input.savePercent ?? 0, 0), 100);
  const saved = Math.round((input.amount * pct) / 100);
  const spendable = input.amount - saved;
  const t = tx.insert(transactions).values({
    type: "ingreso", concept: input.concept, amount: input.amount, saved, extra: input.extra ? 1 : 0,
    pocketId: pocketId("Gastos del mes"), date: input.date, source,
  }).returning().get();
  adjustPocket(pocketId("Gastos del mes"), spendable);
  adjustPocket(pocketId("Ahorro intocable"), saved);
  return { transaction: t, saved, spendable };
}

/** Registra un ingreso recibido y aparta automáticamente savePercent % al ahorro intocable. */
export function addIncome(
  input: { concept: string; amount: number; date: string; savePercent?: number },
  source: "web" | "mcp" = "web",
) {
  return db.transaction((tx) => applyIncome(tx, input, source));
}

/** Dinero extra (regalo, devolución…): suma al presupuesto de gastos diarios, no cuenta como ingreso del mes. */
export function addExtraIncome(
  input: { concept: string; amount: number; date: string },
  source: "web" | "mcp" = "web",
) {
  return db.transaction((tx) => applyIncome(tx, { ...input, extra: true }, source).transaction);
}

// ---------- Ingresos programados (diario / semanal / quincenal / mensual) ----------
const ruleOf = (p: typeof incomeSchedule.$inferSelect): IncomeRule => ({
  frequency: p.frequency,
  dayOfMonth: p.dayOfMonth,
  secondDayOfMonth: p.secondDayOfMonth,
  weekday: p.weekday,
});

export function listIncomePlans() {
  return db.select().from(incomeSchedule).where(eq(incomeSchedule.active, true)).all()
    .map((p) => ({ ...p, rule: ruleOf(p) }));
}

export function addIncomePlan(input: {
  name: string; amount: number; frequency: IncomeRule["frequency"];
  dayOfMonth?: number; secondDayOfMonth?: number; weekday?: number; savePercent?: number;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Monto inválido");
  return db.insert(incomeSchedule).values({
    name: input.name, amount: input.amount, frequency: input.frequency,
    dayOfMonth: input.dayOfMonth ?? null, secondDayOfMonth: input.secondDayOfMonth ?? null,
    weekday: input.frequency === "semanal" ? (input.weekday ?? 0) : null,
    savePercent: Math.min(Math.max(input.savePercent ?? 0, 0), 100),
  }).returning().get();
}

/** Se desactiva en vez de borrar: conserva el historial de lo ya recibido. */
export function deactivateIncomePlan(id: number) {
  db.update(incomeSchedule).set({ active: false }).where(eq(incomeSchedule.id, id)).run();
}

/** Total esperado del mes: monto por pago × cantidad de pagos que caen en ese mes. */
export function expectedIncome(month: string, today: string): number {
  if (isBeforeStart(month, today)) return 0; // antes de la fecha de inicio no se espera nada
  return listIncomePlans().reduce((a, p) => a + p.amount * incomeOccurrences(p.rule, month).length, 0);
}

export function getIncomePlan(month: string, today: string) {
  const plans = isBeforeStart(month, today) ? [] : listIncomePlans();
  const got = new Set(
    db.select().from(incomeReceipts).where(like(incomeReceipts.occurrence, `${month}-%`)).all()
      .map((r) => `${r.scheduleId}|${r.occurrence}`),
  );
  return plans
    .flatMap((p) =>
      incomeOccurrences(p.rule, month).map((o) => {
        const received = got.has(`${p.id}|${o.key}`);
        const late = !received && (o.date ? o.date < today : month < monthOf(today));
        const status: IncomeStatus = received ? "recibido" : late ? "atrasado" : "pendiente";
        return { scheduleId: p.id, name: p.name, amount: p.amount, savePercent: p.savePercent, key: o.key, date: o.date, status };
      }),
    )
    .sort((a, b) => (a.date ?? `${month}-99`).localeCompare(b.date ?? `${month}-99`) || a.name.localeCompare(b.name));
}

/** Marca una ocurrencia esperada como recibida: crea el ingreso y aparta el % de ahorro. Idempotente. */
export function markIncomeReceived(
  scheduleId: number, key: string, receivedOn: string, source: "web" | "mcp" = "web",
  amount?: number, // monto realmente recibido; si falta, el programado
) {
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) throw new Error("Monto inválido");
  return db.transaction((tx) => {
    const plan = tx.select().from(incomeSchedule).where(eq(incomeSchedule.id, scheduleId)).get();
    if (!plan) throw new Error("Ingreso no encontrado");
    if (!incomeOccurrences(ruleOf(plan), key.slice(0, 7)).some((o) => o.key === key)) {
      throw new Error("Esa fecha no corresponde a este ingreso");
    }
    const existing = tx.select().from(incomeReceipts)
      .where(and(eq(incomeReceipts.scheduleId, scheduleId), eq(incomeReceipts.occurrence, key))).get();
    if (existing) return { alreadyReceived: true as const };

    // El ingreso pertenece al mes de la ocurrencia que se marca, aunque se marque en otro momento
    const date = dateWithinMonth(key.slice(0, 7), key.endsWith("-00") ? null : key, receivedOn);
    const r = applyIncome(tx, { concept: plan.name, amount: amount ?? plan.amount, date, savePercent: plan.savePercent }, source);
    tx.insert(incomeReceipts).values({ scheduleId, occurrence: key, transactionId: r.transaction.id }).run();
    return { alreadyReceived: false as const, saved: r.saved };
  });
}

/** Revierte un ingreso: quita del bolsillo lo gastable y lo apartado al ahorro. */
function reverseIncome(t: typeof transactions.$inferSelect) {
  adjustPocket(pocketId("Gastos del mes"), -(t.amount - t.saved));
  adjustPocket(pocketId("Ahorro intocable"), -t.saved);
}

/** Deshace "recibido": borra el ingreso de esa ocurrencia y revierte bolsillos y ahorro. */
export function unmarkIncomeReceived(scheduleId: number, key: string): boolean {
  return db.transaction((tx) => {
    const r = tx.select().from(incomeReceipts)
      .where(and(eq(incomeReceipts.scheduleId, scheduleId), eq(incomeReceipts.occurrence, key))).get();
    if (!r) return false;
    const t = r.transactionId
      ? tx.select().from(transactions).where(eq(transactions.id, r.transactionId)).get()
      : undefined;
    if (t) {
      reverseIncome(t);
      tx.delete(transactions).where(eq(transactions.id, t.id)).run();
    }
    tx.delete(incomeReceipts).where(eq(incomeReceipts.id, r.id)).run();
    return true;
  });
}

/** Ingresos recibidos del mes (sin dinero extra). `linked` = vienen de marcar un pago esperado. */
export function getIncomeEntries(month: string) {
  return db
    .select({
      id: transactions.id, concept: transactions.concept, amount: transactions.amount,
      saved: transactions.saved, date: transactions.date, receiptId: incomeReceipts.id,
    })
    .from(transactions)
    .leftJoin(incomeReceipts, eq(incomeReceipts.transactionId, transactions.id))
    .where(and(eq(transactions.type, "ingreso"), eq(transactions.extra, 0), like(transactions.date, `${month}-%`)))
    .orderBy(sql`${transactions.date} asc`, sql`${transactions.id} asc`)
    .all()
    .map(({ receiptId, ...r }) => ({ ...r, linked: receiptId != null }));
}

/** Borra un ingreso registrado a mano (nunca uno marcado desde Pagos esperados: ese se deshace). */
export function deleteIncomeEntry(id: number): boolean {
  return db.transaction((tx) => {
    const t = tx.select().from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.type, "ingreso"), eq(transactions.extra, 0))).get();
    if (!t) return false;
    if (tx.select().from(incomeReceipts).where(eq(incomeReceipts.transactionId, id)).get()) return false;
    reverseIncome(t);
    tx.delete(transactions).where(eq(transactions.id, id)).run();
    return true;
  });
}

// ---------- Gastos diarios (los que NO son pagos obligatorios) ----------
export function getDailyExpenses(month: string) {
  return db
    .select({
      id: transactions.id, concept: transactions.concept, amount: transactions.amount,
      date: transactions.date, category: categories.name, color: categories.color, source: transactions.source,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.type, "gasto"), isNull(transactions.scheduleId), like(transactions.date, `${month}-%`)))
    .orderBy(sql`${transactions.date} desc`, sql`${transactions.id} desc`)
    .all();
}

export type DailyEntry = {
  id: number; kind: "gasto" | "extra"; concept: string; amount: number; date: string;
  category: string | null; color: string | null;
};

/** Movimientos del día a día: gastos diarios y dinero extra recibido (más recientes primero). */
export function getDailyEntries(month: string): DailyEntry[] {
  return db
    .select({
      id: transactions.id, type: transactions.type, concept: transactions.concept, amount: transactions.amount,
      date: transactions.date, category: categories.name, color: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      like(transactions.date, `${month}-%`),
      or(
        and(eq(transactions.type, "gasto"), isNull(transactions.scheduleId)),
        and(eq(transactions.type, "ingreso"), eq(transactions.extra, 1)),
      ),
    ))
    .orderBy(sql`${transactions.date} desc`, sql`${transactions.id} desc`)
    .all()
    .map(({ type, ...r }) => ({ ...r, kind: type === "gasto" ? ("gasto" as const) : ("extra" as const) }));
}

/** Borra un gasto diario o un dinero extra (nunca un pago obligatorio ni un ingreso planeado) y ajusta el bolsillo. */
export function deleteExpense(id: number): boolean {
  return db.transaction((tx) => {
    const t = tx.select().from(transactions)
      .where(and(
        eq(transactions.id, id),
        or(
          and(eq(transactions.type, "gasto"), isNull(transactions.scheduleId)),
          and(eq(transactions.type, "ingreso"), eq(transactions.extra, 1)),
        ),
      )).get();
    if (!t) return false;
    adjustPocket(t.pocketId, t.type === "gasto" ? t.amount : -t.amount);
    tx.delete(transactions).where(eq(transactions.id, id)).run();
    return true;
  });
}

/** Lo asignado hasta el día `day` (1..dim). Se redondea sobre el acumulado, así no se pierde ni sobra un peso. */
export function cumulativeAllowance(budget: number, day: number, dim: number): number {
  return budget > 0 ? Math.round((budget * day) / dim) : 0;
}

export type LedgerDay = {
  date: string;
  allowance: number; // lo que el presupuesto asigna a este día
  carried: number; // lo que venía de los días anteriores (negativo si te pasaste)
  spent: number;
  received: number; // dinero extra recibido
  balance: number; // lo que puedes gastar al cierre del día = carried + allowance + received − spent
  entries: DailyEntry[];
};

/**
 * Libro diario con acumulación: cada día se asigna presupuesto/días del mes; lo que no gastas pasa al
 * día siguiente, lo que te pasas se descuenta del siguiente, y el dinero extra suma. Solo hay filas
 * hasta hoy (mes actual), todos los días (mes pasado) o ninguna (mes futuro).
 */
function buildLedger(month: string, today: string, budget: number): LedgerDay[] {
  const dim = daysInMonth(month);
  const cur = monthOf(today);
  const lastDay = month < cur ? dim : month === cur ? Number(today.slice(8)) : 0;
  const entries = getDailyEntries(month);

  const days: LedgerDay[] = [];
  let balance = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const dayEntries = entries.filter((e) => e.date === date);
    const spent = dayEntries.filter((e) => e.kind === "gasto").reduce((a, e) => a + e.amount, 0);
    const received = dayEntries.filter((e) => e.kind === "extra").reduce((a, e) => a + e.amount, 0);
    const allowance = cumulativeAllowance(budget, d, dim) - cumulativeAllowance(budget, d - 1, dim);
    const carried = balance;
    balance = carried + allowance + received - spent;
    days.push({ date, allowance, carried, spent, received, balance, entries: dayEntries });
  }
  return days;
}

export function getDailyLedger(month: string, today: string): LedgerDay[] {
  const s = getSummary(month, today);
  return buildLedger(month, today, s.incomeBase - s.obligationsTotal - getSavingsGoal(month).monthlyTarget);
}

/**
 * Presupuesto para gastos diarios = ingresos − pagos obligatorios − meta de ahorro (+ dinero extra recibido).
 * `availableToday` es lo que puedes gastar hoy sin tocar el ahorro: asignación acumulada − lo gastado + extras.
 */
export function getBudget(month: string, today: string) {
  const s = getSummary(month, today);
  const goal = getSavingsGoal(month);
  const beforeStart = isBeforeStart(month, today);
  const budget = beforeStart ? 0 : s.incomeBase - s.obligationsTotal - goal.monthlyTarget;
  const ledger = buildLedger(month, today, budget);
  const last = ledger.at(-1);

  const cur = monthOf(today);
  const dim = daysInMonth(month);
  const elapsed = ledger.length;
  const daysLeft = month < cur ? 0 : month === cur ? dim - elapsed + 1 : dim; // hoy cuenta
  const spent = s.dailyExpenses;
  const extra = s.extraReceived;
  const pool = budget + extra; // todo lo que puedes gastar en el mes sin tocar el ahorro

  return {
    month, beforeStart, budget, extra, pool, spent,
    remaining: pool - spent,
    usedPct: pool > 0 ? spent / pool : spent > 0 ? 1 : 0,
    elapsedPct: elapsed / dim,
    daysLeft,
    dailyAllowance: budget > 0 ? Math.round(budget / dim) : 0, // referencia: asignación diaria base
    availableToday: last?.balance ?? 0,
    carried: last?.carried ?? 0, // lo que venía de ayer
    todayAllowance: last?.allowance ?? 0,
    averagePerDay: elapsed > 0 ? Math.round(spent / elapsed) : 0,
    eatingIntoSavings: spent > pool, // ya gastaste más de lo que el mes permitía
    // Insumos del cálculo, para mostrarlos
    incomeBase: s.incomeBase, obligationsTotal: s.obligationsTotal, savingsTarget: goal.monthlyTarget,
  };
}

// ---------- Resumen y meta ----------
export function getSummary(month: string, today: string) {
  const sums = db
    .select({ type: transactions.type, total: sql<number>`coalesce(sum(${transactions.amount}),0)` })
    // El dinero extra (regalos) queda fuera: no es ingreso del mes, solo suma al presupuesto diario
    .from(transactions).where(and(like(transactions.date, `${month}-%`), eq(transactions.extra, 0)))
    .groupBy(transactions.type).all();
  const extraReceived =
    db.select({ t: sql<number>`coalesce(sum(${transactions.amount}),0)` }).from(transactions)
      .where(and(eq(transactions.type, "ingreso"), eq(transactions.extra, 1), like(transactions.date, `${month}-%`)))
      .get()?.t ?? 0;
  const income = sums.find((s) => s.type === "ingreso")?.total ?? 0; // recibido
  const expenses = sums.find((s) => s.type === "gasto")?.total ?? 0; // pagos + gastos diarios
  const dailyExpenses =
    db.select({ t: sql<number>`coalesce(sum(${transactions.amount}),0)` }).from(transactions)
      .where(and(eq(transactions.type, "gasto"), isNull(transactions.scheduleId), like(transactions.date, `${month}-%`)))
      .get()?.t ?? 0;
  const payments = getPayments(month, today);
  const pendingObligations = payments.filter((p) => p.status !== "pagado").reduce((a, p) => a + p.amount, 0);
  const obligationsTotal = payments.reduce((a, p) => a + p.effectiveAmount, 0); // pagado real + pendiente programado

  // Si hay ingresos programados se usa lo esperado; si lo recibido es mayor, manda lo recibido.
  const expected = expectedIncome(month, today);
  const incomeBase = Math.max(income, expected);
  const margin = incomeBase + extraReceived - expenses - pendingObligations; // lo realmente libre

  return {
    month, income, extraReceived, expectedIncome: expected, incomeBase,
    expenses, dailyExpenses, paidObligations: expenses - dailyExpenses,
    obligationsTotal, pendingObligations,
    savingsRate: incomeBase > 0 ? margin / incomeBase : 0,
    margin,
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

function savedIn(prefix: string): number {
  return (
    db.select({ t: sql<number>`coalesce(sum(${transactions.saved}),0)` })
      .from(transactions).where(like(transactions.date, `${prefix}-%`)).get()?.t ?? 0
  );
}

/** Meta de ahorro: `saved` es lo apartado en el mes; `yearSaved` lo apartado en el año. */
export function getSavingsGoal(month: string) {
  const year = Number(month.slice(0, 4));
  const goal = db.select().from(savingsGoals).where(eq(savingsGoals.year, year)).get();
  const saved = savedIn(month);
  const yearSaved = savedIn(String(year));
  const monthly = goal?.monthlyTarget ?? 0;
  const yearly = goal?.yearlyTarget ?? 0;
  return {
    saved, yearSaved, monthlyTarget: monthly, yearlyTarget: yearly,
    monthlyProgress: monthly ? Math.min(saved / monthly, 1) : 0,
    yearlyProgress: yearly ? Math.min(yearSaved / yearly, 1) : 0,
    medal: medalFor(saved, monthly),
  };
}

/** Acepta "YYYY-MM"; cualquier otra cosa cae en el mes de hoy. */
export function parseMonth(raw: string | string[] | undefined, today: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : monthOf(today);
}

/** Resumen de los 12 meses de un año. */
export function getYearOverview(year: number, today: string) {
  const start = getStartMonth(today);
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const payments = getPayments(month, today);
    const sum = (f: (p: (typeof payments)[number]) => boolean) =>
      payments.filter(f).reduce((a, p) => a + p.effectiveAmount, 0);
    const s = getSummary(month, today);
    const g = getSavingsGoal(month);
    return {
      month,
      beforeStart: month < start,
      obligations: sum(() => true),
      paid: sum((p) => p.status === "pagado"),
      urgentCount: payments.filter((p) => p.status === "urgente").length,
      income: s.income, expenses: s.expenses,
      saved: g.saved, target: g.monthlyTarget, medal: g.medal,
    };
  });
}

export function listCategories() {
  return db.select().from(categories).all();
}
