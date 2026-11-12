"use client";

import { useActionState } from "react";
import { addExpenseAction, addIncomeAction, type FormState } from "@/app/actions";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const label = "block text-sm font-medium mb-1";

function Message({ state }: { state: FormState }) {
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

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
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

export function IncomeForm() {
  const [state, action, pending] = useActionState(addIncomeAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="i-concept">Concepto</label>
        <input id="i-concept" name="concept" required maxLength={120} className={input} placeholder="Pago del 30, domingo…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="i-amount">Monto (COP)</label>
          <input id="i-amount" name="amount" required inputMode="numeric" className={input} placeholder="3.500.000" />
        </div>
        <div>
          <label className={label} htmlFor="i-date">Fecha</label>
          <input id="i-date" name="date" type="date" className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="i-save">% a apartar al ahorro intocable</label>
        <input id="i-save" name="savePercent" type="number" min={0} max={100} defaultValue={0} className={input} />
      </div>
      <Message state={state} />
      <Submit pending={pending}>Registrar ingreso</Submit>
    </form>
  );
}
