"use client";

import { useActionState, useState } from "react";
import { renamePaymentAction } from "@/app/actions";

/** Nombre del pago con un botón ✎ para corregirlo. El cambio vale para todos los meses. */
export function PaymentName({ id, name }: { id: number; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof renamePaymentAction>[0], fd: FormData) => {
      const r = await renamePaymentAction(prev, fd);
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
          aria-label={`Editar el nombre de ${name}`}
          title="Editar nombre"
          className="shrink-0 rounded px-1 text-slate-400 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          ✎
        </button>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="scheduleId" value={id} />
      <div className="flex items-center gap-1.5">
        <input
          name="name" defaultValue={name} required maxLength={120} autoFocus aria-label={`Nuevo nombre de ${name}`}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit" disabled={pending}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Guardar
        </button>
        <button
          type="button" onClick={() => setEditing(false)}
          className="rounded-md px-2 py-1 text-xs text-slate-500 underline"
        >
          Cancelar
        </button>
      </div>
      {state && !state.ok && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
