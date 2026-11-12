"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addExpense, addExtraIncome, addIncome, addIncomePlan, deactivateIncomePlan, deleteExpense, markIncomeReceived,
  markPaid, monthOf, toISO, deleteIncomeEntry, unmarkIncomeReceived, unmarkPaid,
} from "@/lib/finance";
import { cop } from "@/lib/format";
import { FREQUENCY_LABEL, incomeOccurrences, type Frequency } from "@/lib/income";

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
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), month: monthSchema, amount: optAmount })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  markPaid(parsed.data.scheduleId, parsed.data.month, toISO(new Date()), "web", parsed.data.amount);
  refresh();
}

export async function addExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
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
  });
  refresh();
  return { ok: true, message: "Gasto registrado" };
}

/** Dinero extra (regalo, devolución…): suma al presupuesto de gastos diarios. */
export async function addExtraAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      concept: z.string().trim().min(1, "Escribe de dónde viene").max(120),
      amount: amountSchema,
      date: dateSchema.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  addExtraIncome({ concept: d.concept, amount: d.amount, date: d.date || toISO(new Date()) });
  refresh();
  return { ok: true, message: `Sumaste ${cop(d.amount)} a tu disponible` };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
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
    const r = addIncome({ concept: d.concept, amount: d.amount, savePercent: d.savePercent, date: d.date || today });
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
  const parsed = z
    .object({
      scheduleId: z.coerce.number().int().positive(),
      key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: optAmount,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  markIncomeReceived(parsed.data.scheduleId, parsed.data.key, toISO(new Date()), "web", parsed.data.amount);
  refresh();
}

export async function unmarkPaidAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), month: monthSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  unmarkPaid(parsed.data.scheduleId, parsed.data.month);
  refresh();
}

export async function unmarkIncomeReceivedAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  unmarkIncomeReceived(parsed.data.scheduleId, parsed.data.key);
  refresh();
}

/** Quita un ingreso registrado a mano. Los marcados desde "Pagos esperados" se deshacen con su propio botón. */
export async function deleteIncomeEntryAction(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deleteIncomeEntry(parsed.data.id);
  refresh();
}

export async function deactivateIncomeAction(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  deactivateIncomePlan(parsed.data.id);
  refresh();
}

