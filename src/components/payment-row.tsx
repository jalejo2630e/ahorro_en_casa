import { markPaidAction } from "@/app/actions";
import { cop } from "@/lib/format";
import type { getPayments } from "@/lib/finance";
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
        <p className="truncate font-medium">{p.name}</p>
        <p className="text-xs text-slate-500">
          {p.category ?? "Sin categoría"} · {when(p)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className="font-semibold tabular-nums">{cop(p.amount)}</p>
        {p.status === "pagado" ? (
          <StatusBadge status="pagado" />
        ) : (
          <form action={markPaidAction} className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            <input type="hidden" name="scheduleId" value={p.id} />
            <input type="hidden" name="month" value={month} />
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
