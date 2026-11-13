"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addCategory, deleteCategory, updateCategory } from "@/lib/finance";
import type { FormState } from "./actions";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Elige un color");
const refresh = () => revalidatePath("/", "layout");
const failure = (e: unknown, fallback: string): FormState => ({ ok: false, message: e instanceof Error ? e.message : fallback });

export async function addCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z.object({ name: z.string(), color: colorSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    addCategory(parsed.data.name, parsed.data.color);
  } catch (e) {
    return failure(e, "No se pudo crear la categoría");
  }
  refresh();
  return { ok: true, message: "Categoría creada" };
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z
    .object({ id: z.coerce.number().int().positive(), name: z.string(), color: colorSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    updateCategory(parsed.data.id, { name: parsed.data.name, color: parsed.data.color });
  } catch (e) {
    return failure(e, "No se pudo guardar");
  }
  refresh();
  return { ok: true, message: "Categoría guardada" };
}

export async function deleteCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  try {
    const r = deleteCategory(parsed.data.id);
    refresh();
    const n = r.expenses + r.payments;
    return { ok: true, message: n > 0 ? `Categoría borrada; ${n} movimiento(s)/pago(s) quedaron sin categoría` : "Categoría borrada" };
  } catch (e) {
    return failure(e, "No se pudo borrar");
  }
}
