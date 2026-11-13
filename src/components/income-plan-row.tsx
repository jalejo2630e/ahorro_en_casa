"use client";

import { useActionState, useState } from "react";
import { deactivateIncomeAction, updateIncomePlanAction } from "@/app/actions";
import { cop } from "@/lib/format";

const field =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900";

type Plan = {
  id: number; name: string; amount: number; frequency: string; frequencyLabel: string; description: string;
  dayOfMonth: number | null; savePercent: number; payments: number; monthTotal: number;
};

/** Un ingreso programado con ✎ para editar nombre, monto, % de ahorro y (si es mensual) el día de cobro. */
export function IncomePlanRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof updateIncomePlanAction>[0], fd: FormData) => {
      const r = await updateIncomePlanAction(prev, fd);
      if (r?.ok) setEditing(false);
      return r;
    },
    null,
  );
  const monthly = plan.frequency === "mensual";

  if (editing) {
    return (
      <li className="py-3">
        <form action={action} className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <input type="hidden" name="id" value={plan.id} />
          <label className="block text-xs font-medium">
            Nombre
            <input name="name" defaultValue={plan.name} required maxLength={120} autoFocus className={`${field} mt-0.5`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium">
              Monto de cada pago
              <input name="amount" defaultValue={String(plan.amount)} required inputMode="numeric" className={`${field} mt-0.5 text-right tabular-nums`} />
            </label>
            <label className="block text-xs font-medium">
              % al ahorro
              <input name="savePercent" type="number" min={0} max={100} defaultValue={plan.savePercent} inputMode="numeric" className={`${field} mt-0.5 text-right tabular-nums`} />
            </label>
          </div>
          {monthly ? (
            <label className="block text-xs font-medium">
              Día de cobro (1–31, vacío = sin día fijo)
              <input name="day" type="number" min={1} max={31} defaultValue={plan.dayOfMonth ?? ""} inputMode="numeric" className={`${field} mt-0.5 text-right tabular-nums`} />
            </label>
          ) : (
            <p className="text-[11px] text-slate-500">
              Los días de un ingreso {plan.frequencyLabel.toLowerCase()} no se cambian aquí: quítalo y crea uno nuevo.
            </p>
          )}
          <p className="text-[11px] text-slate-500">Vale para todos los meses. Lo que ya recibiste no cambia.</p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-1.5 text-xs text-slate-500 underline">
              Cancelar
            </button>
          </div>
          {state && !state.ok && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          <span className="min-w-0 break-words">{plan.name}</span>
          <button
            type="button" onClick={() => setEditing(true)} aria-label={`Editar ${plan.name}`} title="Editar"
            className="shrink-0 rounded px-1 text-slate-400 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            ✎
          </button>
        </p>
        <p className="text-xs text-slate-500">
          {plan.frequencyLabel} · {plan.description} · {cop(plan.amount)} c/u
          {plan.savePercent > 0 && ` · ${plan.savePercent}% al ahorro`}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">{cop(plan.monthTotal)}</p>
        <p className="text-xs text-slate-500">{plan.payments} pago{plan.payments === 1 ? "" : "s"} este mes</p>
      </div>
      <form action={deactivateIncomeAction}>
        <input type="hidden" name="id" value={plan.id} />
        <button
          type="submit" aria-label={`Quitar ${plan.name}`}
          className="rounded px-1.5 py-1 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
        >
          ✕
        </button>
      </form>
    </li>
  );
}
