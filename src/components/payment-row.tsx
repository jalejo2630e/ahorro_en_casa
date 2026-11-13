import { markPaidAction, unmarkPaidAction } from "@/app/actions";
import { cop } from "@/lib/format";
import type { getPayments } from "@/lib/finance";
import { PaymentName } from "./rename-payment";
import { StatusBadge } from "./status-badge";

type Payment = ReturnType<typeof getPayments>[number];

function when(p: Payment) {
  if (p.status === "pagado") return `Pagado el ${p.paidAt}`;
  if (p.daysLeft < 0) return `Vencido hace ${-p.daysLeft} d`;
  if (p.daysLeft === 0) return "Vence hoy";
  return `Vence en ${p.daysLeft} d`;
}

export function PaymentRow({ p, month }: { p: Payment; month: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="w-12 shrink-0 text-center">
        <p className="text-xl font-bold leading-none">{Number(p.due.slice(8))}</p>
        <p className="text-[10px] uppercase text-slate-500">día</p>
      </div>
      <div className="min-w-0 flex-1">
        <PaymentName id={p.id} name={p.name} />
        <p className="text-xs text-slate-500">
          {p.category ?? "Sin categoría"} · {when(p)}
          {p.priority === "critica" && <span className="font-semibold text-red-600"> · crítica</span>}
        </p>
        {p.fundingSource && <p className="truncate text-xs text-slate-400">Se paga con: {p.fundingSource}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className="font-semibold tabular-nums">{cop(p.effectiveAmount)}</p>
        {p.status === "pagado" && p.effectiveAmount !== p.amount && (
          <p className="-mt-1 text-[11px] text-slate-500">programado {cop(p.amount)}</p>
        )}
        {p.status === "pagado" ? (
          <form action={unmarkPaidAction} className="flex items-center gap-2">
            <StatusBadge status="pagado" />
            <input type="hidden" name="scheduleId" value={p.id} />
            <input type="hidden" name="month" value={month} />
            <button
              type="submit"
              className="text-xs text-slate-500 underline hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              Deshacer
            </button>
          </form>
        ) : (
          <form action={markPaidAction} className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            <input type="hidden" name="scheduleId" value={p.id} />
            <input type="hidden" name="month" value={month} />
            <input
              name="amount"
              inputMode="numeric"
              placeholder={p.amount.toLocaleString("es-CO")}
              aria-label={`Monto pagado de ${p.name} (vacío = ${cop(p.amount)})`}
              className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Marcar pagado
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
