"use client";

import { useActionState, useState } from "react";
import { updatePaymentAction } from "@/app/actions";

const field =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900";

/**
 * Nombre del pago con un botón ✎ para editarlo: nombre, monto programado y día de pago.
 * Los cambios valen para todos los meses; lo ya pagado conserva su monto real.
 */
export function PaymentName({ id, name, amount, day }: { id: number; name: string; amount: number; day: number }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof updatePaymentAction>[0], fd: FormData) => {
      const r = await updatePaymentAction(prev, fd);
      if (r?.ok) setEditing(false);
      return r;
    },
    null,
  );

  if (!editing) {
    return (
      <p className="flex items-center gap-1.5 font-medium">
        <span className="truncate">{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Editar ${name}`}
          title="Editar nombre, monto y día"
          className="shrink-0 rounded px-1 text-slate-400 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          ✎
        </button>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
      <input type="hidden" name="scheduleId" value={id} />
      <label className="block text-xs font-medium">
        Nombre
        <input name="name" defaultValue={name} required maxLength={120} autoFocus className={`${field} mt-0.5`} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium">
          Monto programado
          <input
            name="amount" defaultValue={String(amount)} required inputMode="numeric"
            className={`${field} mt-0.5 text-right tabular-nums`}
          />
        </label>
        <label className="block text-xs font-medium">
          Día de pago (1–31)
          <input
            name="day" type="number" min={1} max={31} defaultValue={day} required inputMode="numeric"
            className={`${field} mt-0.5 text-right tabular-nums`}
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">Vale para todos los meses. Lo que ya pagaste no cambia.</p>
      <div className="flex items-center gap-2">
        <button
          type="submit" disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-1 text-xs text-slate-500 underline">
          Cancelar
        </button>
        {state && !state.ok && <span role="alert" className="text-xs text-red-600">{state.message}</span>}
      </div>
    </form>
  );
}
