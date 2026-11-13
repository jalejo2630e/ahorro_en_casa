"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addExpense, addExtraIncome, addIncome, addIncomePlan, addSavingsDeposit, deactivateIncomePlan, deleteExpense,
  deleteSavingsDeposit, getSavingsGoal, markIncomeReceived,
  markPaid, monthOf, renamePayment, toISO, deleteIncomeEntry, setStartMonth, unmarkIncomeReceived, unmarkPaid,
} from "@/lib/finance";
import { cop } from "@/lib/format";
import { FREQUENCY_LABEL, incomeOccurrences, type Frequency } from "@/lib/income";
import { requireUser } from "@/lib/auth";

export type FormState = { ok: boolean; message: string } | null;

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Acepta "50.000", "$ 50,000" o "50000"
const amountSchema = z
  .string()
  .transform((s) => Number(s.replace(/\D/g, "")))
  .pipe(z.number().int().positive("El monto debe ser mayor a cero"));

// Monto opcional al marcar: vacío = el programado; si lo escribes, es lo realmente pagado/recibido
const optAmount = z
  .string()
  .optional()
  .transform((s) => (s && s.trim() !== "" ? Number(s.replace(/\D/g, "")) : undefined))
  .pipe(z.number().int().positive().optional());

const refresh = () => revalidatePath("/", "layout");

export async function markPaidAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), month: monthSchema, amount: optAmount })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  markPaid(parsed.data.scheduleId, parsed.data.month, toISO(new Date()), "web", parsed.data.amount, user.id);
  refresh();
}

export async function renamePaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), name: z.string().trim().min(1, "Escribe un nombre").max(120) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    renamePayment(parsed.data.scheduleId, parsed.data.name);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo renombrar" };
  }
  refresh();
  return { ok: true, message: "Nombre actualizado" };
}

/** Registra un ahorro guardado: monto (o "la meta que falta") y la fecha en que se guardó. */
export async function addSavingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      amount: z.string().optional(),
      date: dateSchema,
      note: z.string().trim().max(120).optional(),
      full: z.string().optional(), // botón "Guardé la meta completa"
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Indica la fecha en que lo guardaste." };
  const d = parsed.data;
  const today = toISO(new Date());

  let amount: number;
  if (d.full) {
    const left = getSavingsGoal(monthOf(d.date)).remaining;
    if (left <= 0) return { ok: false, message: "Ese mes ya cumpliste la meta (o no hay meta definida)." };
    amount = left;
  } else {
    const n = Number((d.amount ?? "").replace(/\D/g, ""));
    if (!Number.isInteger(n) || n <= 0) return { ok: false, message: "Escribe cuánto ahorraste." };
    amount = n;
  }
  try {
    addSavingsDeposit({ amount, date: d.date, note: d.note, userId: user.id }, today);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo registrar el ahorro" };
  }
  refresh();
  return { ok: true, message: `Ahorro de ${cop(amount)} registrado el ${d.date}.` };
}

export async function deleteSavingsAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deleteSavingsDeposit(parsed.data.id);
  refresh();
}

export async function addExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      concept: z.string().trim().min(1, "Escribe un concepto").max(120),
      amount: amountSchema,
      category: z.string().max(60).optional(),
      date: dateSchema.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  addExpense({
    concept: d.concept,
    amount: d.amount,
    category: d.category || undefined,
    date: d.date || toISO(new Date()),
    userId: user.id,
  });
  refresh();
  return { ok: true, message: "Gasto registrado" };
}

/** Dinero extra (regalo, devolución…): suma al presupuesto de gastos diarios. */
export async function addExtraAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      concept: z.string().trim().min(1, "Escribe de dónde viene").max(120),
      amount: amountSchema,
      date: dateSchema.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  addExtraIncome({ concept: d.concept, amount: d.amount, date: d.date || toISO(new Date()), userId: user.id });
  refresh();
  return { ok: true, message: `Sumaste ${cop(d.amount)} a tu disponible` };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deleteExpense(parsed.data.id); // solo gastos diarios y dinero extra; nunca pagos obligatorios ni sueldos
  refresh();
}

// Campo opcional: vacío = sin valor; si viene, debe ser un entero en el rango
const optInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s && s.trim() !== "" ? Number(s) : undefined))
    .pipe(z.number().int().min(min).max(max).optional());

export async function addIncomeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      concept: z.string().trim().min(1, "Escribe un concepto").max(120),
      amount: amountSchema,
      frequency: z.enum(["unica", "diario", "semanal", "quincenal", "mensual"]),
      savePercent: z.coerce.number().min(0, "El % de ahorro va de 0 a 100").max(100, "El % de ahorro va de 0 a 100").default(0),
      date: dateSchema.optional().or(z.literal("")),
      weekday: optInt(0, 6),
      day1: optInt(1, 31),
      day2: optInt(1, 31),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const today = toISO(new Date());

  // Una sola vez: es plata ya recibida
  if (d.frequency === "unica") {
    const r = addIncome({ concept: d.concept, amount: d.amount, savePercent: d.savePercent, date: d.date || today, userId: user.id });
    refresh();
    return {
      ok: true,
      message: r.saved > 0 ? `Ingreso registrado. Se apartaron ${cop(r.saved)} al ahorro.` : "Ingreso registrado",
    };
  }

  // Recurrente: se programa; cada pago se marca como recibido cuando llega
  const plan = addIncomePlan({
    name: d.concept, amount: d.amount, frequency: d.frequency, savePercent: d.savePercent,
    dayOfMonth: d.frequency === "mensual" || d.frequency === "quincenal" ? d.day1 : undefined,
    secondDayOfMonth: d.frequency === "quincenal" ? d.day2 : undefined,
    weekday: d.weekday,
  });
  const n = incomeOccurrences(
    { frequency: plan.frequency as Frequency, dayOfMonth: plan.dayOfMonth, secondDayOfMonth: plan.secondDayOfMonth, weekday: plan.weekday },
    monthOf(today),
  ).length;
  refresh();
  return {
    ok: true,
    message: `Ingreso ${FREQUENCY_LABEL[d.frequency].toLowerCase()} programado: ${n} pago(s) este mes, ${cop(plan.amount * n)} en total.`,
  };
}

export async function markIncomeReceivedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z
    .object({
      scheduleId: z.coerce.number().int().positive(),
      key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: optAmount,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  markIncomeReceived(parsed.data.scheduleId, parsed.data.key, toISO(new Date()), "web", parsed.data.amount, user.id);
  refresh();
}

/** Primer mes que llevas en la app; los anteriores no cuentan pagos ni ingresos. */
export async function setStartMonthAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z.object({ month: monthSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Mes inválido (usa AAAA-MM)");
  setStartMonth(parsed.data.month);
  refresh();
}

export async function unmarkPaidAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), month: monthSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  unmarkPaid(parsed.data.scheduleId, parsed.data.month);
  refresh();
}

export async function unmarkIncomeReceivedAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  unmarkIncomeReceived(parsed.data.scheduleId, parsed.data.key);
  refresh();
}

/** Quita un ingreso registrado a mano. Los marcados desde "Pagos esperados" se deshacen con su propio botón. */
export async function deleteIncomeEntryAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deleteIncomeEntry(parsed.data.id);
  refresh();
}

export async function deactivateIncomeAction(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deactivateIncomePlan(parsed.data.id);
  refresh();
}

