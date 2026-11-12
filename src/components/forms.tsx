"use client";

import { useActionState } from "react";
import { addExpenseAction, addExtraAction, type FormState } from "@/app/actions";

export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
export const label = "block text-sm font-medium mb-1";

export function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`text-sm font-medium ${state.ok ? "text-emerald-600" : "text-red-600"}`}
    >
      {state.message}
    </p>
  );
}

export function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

export function ExpenseForm({ categories }: { categories: string[] }) {
  const [state, action, pending] = useActionState(addExpenseAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="e-concept">Concepto</label>
        <input id="e-concept" name="concept" required maxLength={120} className={input} placeholder="Mercado, gasolina…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="e-amount">Monto (COP)</label>
          <input id="e-amount" name="amount" required inputMode="numeric" className={input} placeholder="50.000" />
        </div>
        <div>
          <label className={label} htmlFor="e-date">Fecha</label>
          <input id="e-date" name="date" type="date" className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="e-cat">Categoría</label>
        <select id="e-cat" name="category" className={input} defaultValue="">
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Registrar gasto</Submit>
    </form>
  );
}

/** Dinero extra recibido (regalos, devoluciones…): suma al disponible del día a día. */
export function ExtraForm() {
  const [state, action, pending] = useActionState(addExtraAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="x-concept">¿De dónde viene?</label>
        <input id="x-concept" name="concept" required maxLength={120} className={input} placeholder="Regalo de mamá, devolución…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="x-amount">Monto (COP)</label>
          <input id="x-amount" name="amount" required inputMode="numeric" className={input} placeholder="50.000" />
        </div>
        <div>
          <label className={label} htmlFor="x-date">Fecha</label>
          <input id="x-date" name="date" type="date" className={input} />
        </div>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Sumar a mi disponible</Submit>
    </form>
  );
}
