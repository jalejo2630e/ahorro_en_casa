"use client";

import { useActionState, useRef, useState } from "react";
import { addCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/categoria-actions";
import { input, label, Message, Submit } from "./forms";

// Colores distinguibles entre sí; el nombre siempre acompaña al color, así que el color nunca es lo único.
export const CATEGORY_COLORS = [
  "#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04", "#ea580c",
  "#dc2626", "#db2777", "#9333ea", "#4f46e5", "#64748b", "#78350f",
];

function ColorPicker({ name, value, idPrefix }: { name: string; value?: string; idPrefix: string }) {
  const initial = (value ?? "").toLowerCase();
  return (
    <fieldset>
      <legend className={label}>Color</legend>
      <div className="flex flex-wrap gap-2">
        {CATEGORY_COLORS.map((c) => (
          <label key={c} className="cursor-pointer" title={c}>
            <input
              type="radio" name={name} value={c} required defaultChecked={c === initial} className="peer sr-only"
              id={`${idPrefix}-${c.slice(1)}`} aria-label={`Color ${c}`}
            />
            <span
              className="block size-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-white peer-checked:ring-slate-900 peer-focus-visible:ring-emerald-600 dark:ring-offset-slate-900 dark:peer-checked:ring-white"
              style={{ background: c }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NewCategoryForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof addCategoryAction>[0], fd: FormData) => {
      const r = await addCategoryAction(prev, fd);
      if (r?.ok) ref.current?.reset();
      return r;
    },
    null,
  );
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="nc-name">Nombre</label>
        <input id="nc-name" name="name" required maxLength={40} className={input} placeholder="Mascotas, regalos, salidas…" />
      </div>
      <ColorPicker name="color" idPrefix="nc" />
      <Message state={state} />
      <Submit pending={pending}>Crear categoría</Submit>
    </form>
  );
}

export function CategoryRow({
  id, name, color, expenses, payments,
}: { id: number; name: string; color: string; expenses: number; payments: number }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof updateCategoryAction>[0], fd: FormData) => {
      const r = await updateCategoryAction(prev, fd);
      if (r?.ok) setEditing(false);
      return r;
    },
    null,
  );
  const [delState, delAction, delPending] = useActionState(deleteCategoryAction, null);
  const used = expenses + payments;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{name}</p>
          <p className="text-xs text-slate-500">
            {used === 0 ? "Sin uso todavía" : `${expenses} gasto(s) · ${payments} pago(s) programado(s)`}
          </p>
        </div>
        <button
          type="button" onClick={() => { setEditing((e) => !e); setConfirming(false); }}
          aria-label={`Editar ${name}`} title="Editar"
          className="shrink-0 rounded px-2 py-1 text-slate-500 hover:text-emerald-600"
        >
          ✎
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className={label} htmlFor={`cn-${id}`}>Nombre</label>
              <input id={`cn-${id}`} name="name" defaultValue={name} required maxLength={40} className={input} />
            </div>
            <ColorPicker name="color" value={color} idPrefix={`cc-${id}`} />
            {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit" disabled={pending}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Guardar
              </button>
              <button type="button" onClick={() => setEditing(false)} className="px-2 py-1.5 text-sm text-slate-500 underline">
                Cancelar
              </button>
              {!confirming && (
                <button type="button" onClick={() => setConfirming(true)} className="ml-auto px-2 py-1.5 text-sm text-red-600 underline">
                  Borrar categoría
                </button>
              )}
            </div>
          </form>

          {confirming && (
            <form action={delAction} className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-red-800 dark:text-red-200">
                ¿Borrar «{name}»?{" "}
                {used > 0 ? `Sus ${used} movimiento(s)/pago(s) quedarán «Sin categoría».` : "No la usa nadie."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="submit" disabled={delPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Sí, borrar
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1.5 text-sm underline">
                  No
                </button>
              </div>
              {delState && !delState.ok && <p role="alert" className="text-sm text-red-700">{delState.message}</p>}
            </form>
          )}
        </div>
      )}
    </li>
  );
}
