"use client";

import { useActionState } from "react";
import { addSavingsAction } from "@/app/actions";
import { cop } from "@/lib/format";
import { input, label, Message } from "./forms";

/** Registrar un ahorro: cuánto y cuándo lo guardaste, o marcar la meta del mes completa de una vez. */
export function SavingsForm({ defaultDate, maxDate, remaining }: { defaultDate: string; maxDate: string; remaining: number }) {
  const [state, action, pending] = useActionState(addSavingsAction, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="a-amount">¿Cuánto ahorraste?</label>
          <input id="a-amount" name="amount" inputMode="numeric" className={input} placeholder="200.000" />
        </div>
        <div>
          <label className={label} htmlFor="a-date">¿Cuándo lo guardaste?</label>
          <input id="a-date" name="date" type="date" required defaultValue={defaultDate} max={maxDate} className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="a-note">Nota <span className="font-normal text-slate-500">(opcional)</span></label>
        <input id="a-note" name="note" maxLength={120} className={input} placeholder="Cuenta de ahorros, alcancía…" />
      </div>
      <Message state={state} />
      <button
        type="submit" disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Registrar lo que ahorré"}
      </button>
      {remaining > 0 && (
        <button
          type="submit" name="full" value="1" disabled={pending} formNoValidate
          className="w-full rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          Ya guardé la meta completa ({cop(remaining)} que faltaban)
        </button>
      )}
    </form>
  );
}
