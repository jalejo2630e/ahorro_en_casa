import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentRow } from "@/components/payment-row";
import { DOT } from "@/components/status-badge";
import { cop, monthLabel, shiftMonth } from "@/lib/format";
import { BeforeStartNotice } from "@/components/before-start";
import { MonthTabs } from "@/components/month-tabs";
import { daysInMonth, getPayments, getStartMonth, monthOf, parseMonth, toISO } from "@/lib/finance";

export const metadata = { title: "Pagos obligatorios · Ahorro en casa" };

export default function PagosPage({ searchParams }: PageProps<"/pagos">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando pagos…</p>}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/pagos">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const today = toISO(new Date());
  const month = parseMonth(sp.mes, today);
  const start = getStartMonth(today);
  if (month < start) {
    return (
      <div className="space-y-6">
        <header><h1 className="text-2xl font-bold">Pagos de {monthLabel(month)}</h1></header>
        <MonthTabs path="/pagos" month={month} todayMonth={monthOf(today)} />
        <BeforeStartNotice month={month} start={start} />
      </div>
    );
  }

  const payments = getPayments(month, today);
  const totals = {
    total: payments.reduce((a, p) => a + p.effectiveAmount, 0),
    paid: payments.filter((p) => p.status === "pagado").reduce((a, p) => a + p.effectiveAmount, 0),
  };

  // Rejilla: semana empieza en lunes
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => i + 1)];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Pagos de {monthLabel(month)}</h1>
          <p className="text-sm text-slate-500">
            Lo obligatorio · Pagado {cop(totals.paid)} de {cop(totals.total)}
          </p>
        </div>
        <div className="flex gap-1 text-sm font-medium">
          <Link href={`/pagos?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">←</Link>
          <Link href="/pagos" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Hoy</Link>
          <Link href={`/pagos?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">→</Link>
        </div>
      </header>

      <MonthTabs path="/pagos" month={month} todayMonth={monthOf(today)} />

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
