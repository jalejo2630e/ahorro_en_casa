"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addExpense, addIncome, markPaid, toISO } from "@/lib/finance";

export type FormState = { ok: boolean; message: string } | null;

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Acepta "50.000", "$ 50,000" o "50000"
const amountSchema = z
  .string()
  .transform((s) => Number(s.replace(/\D/g, "")))
  .pipe(z.number().int().positive("El monto debe ser mayor a cero"));

const refresh = () => revalidatePath("/", "layout");

export async function markPaidAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ scheduleId: z.coerce.number().int().positive(), month: monthSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Datos inválidos");
  markPaid(parsed.data.scheduleId, parsed.data.month, toISO(new Date()));
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

export async function addIncomeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      concept: z.string().trim().min(1, "Escribe un concepto").max(120),
      amount: amountSchema,
      savePercent: z.coerce.number().min(0).max(100).default(0),
      date: dateSchema.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const r = addIncome({
    concept: d.concept,
    amount: d.amount,
    savePercent: d.savePercent,
    date: d.date || toISO(new Date()),
  });
  refresh();
  return {
    ok: true,
    message: r.saved > 0 ? `Ingreso registrado. Se apartaron ${r.saved.toLocaleString("es-CO")} al ahorro.` : "Ingreso registrado",
  };
}
