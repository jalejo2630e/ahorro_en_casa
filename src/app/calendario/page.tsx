import Link from "next/link";
import { Suspense } from "react";
import { PaymentRow } from "@/components/payment-row";
import { DOT } from "@/components/status-badge";
import { cop, monthLabel, shiftMonth } from "@/lib/format";
import { daysInMonth, getPayments, monthOf, toISO } from "@/lib/finance";

export const metadata = { title: "Calendario de pagos · Ahorro en casa" };

export default function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando calendario…</p>}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/calendario">["searchParams"] }) {
  const sp = await searchParams;
  const today = toISO(new Date());
  const raw = Array.isArray(sp.mes) ? sp.mes[0] : sp.mes;
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : monthOf(today);

  const payments = getPayments(month, today);
  const totals = {
    total: payments.reduce((a, p) => a + p.amount, 0),
    paid: payments.filter((p) => p.status === "pagado").reduce((a, p) => a + p.amount, 0),
  };

  // Rejilla: semana empieza en lunes
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => i + 1)];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{monthLabel(month)}</h1>
          <p className="text-sm text-slate-500">
            Pagado {cop(totals.paid)} de {cop(totals.total)}
          </p>
        </div>
        <div className="flex gap-1 text-sm font-medium">
          <Link href={`/calendario?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">←</Link>
          <Link href="/calendario" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Hoy</Link>
          <Link href={`/calendario?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">→</Link>
        </div>
      </header>

      <section aria-label="Vista mensual" className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={`e${i}`} />;
            const iso = `${month}-${String(day).padStart(2, "0")}`;
            const items = payments.filter((p) => p.due === iso);
            return (
              <div
                key={iso}
                className={`flex min-h-12 flex-col items-center rounded-lg p-1 text-sm ${iso === today ? "bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950" : ""}`}
              >
                <span className={iso === today ? "font-bold" : ""}>{day}</span>
                <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {items.map((p) => (
                    <span key={p.id} title={`${p.name}: ${p.status}`} className={`size-2 rounded-full ${DOT[p.status]}`} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Lista de pagos" className="rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No hay obligaciones configuradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((p) => <PaymentRow key={p.id} p={p} month={month} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
