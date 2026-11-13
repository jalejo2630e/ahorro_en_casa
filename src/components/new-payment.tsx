"use client";

import { useActionState, useRef } from "react";
import { addPaymentAction } from "@/app/actions";
import { monthLabel } from "@/lib/format";
import { input, label, Message, Submit } from "./forms";

/** Crea una obligación nueva; aparece desde el mes que estás viendo. */
export function NewPaymentForm({ month, categories }: { month: string; categories: string[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof addPaymentAction>[0], fd: FormData) => {
      const r = await addPaymentAction(prev, fd);
      if (r?.ok) ref.current?.reset();
      return r;
    },
    null,
  );
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      <div>
        <label className={label} htmlFor="np-name">Nombre</label>
        <input id="np-name" name="name" required maxLength={120} className={input} placeholder="Internet, gimnasio, cuota…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="np-amount">Monto (COP)</label>
          <input id="np-amount" name="amount" required inputMode="numeric" className={input} placeholder="80.000" />
        </div>
        <div>
          <label className={label} htmlFor="np-day">Día de pago (1–31)</label>
          <input id="np-day" name="day" type="number" min={1} max={31} required inputMode="numeric" className={input} placeholder="15" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="np-cat">Categoría</label>
        <select id="np-cat" name="category" defaultValue="" className={input}>
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">Se repite cada mes, desde {monthLabel(month)}.</p>
      <Message state={state} />
      <Submit pending={pending}>Agregar pago</Submit>
    </form>
  );
}
