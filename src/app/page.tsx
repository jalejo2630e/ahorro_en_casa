import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BeforeStartNotice } from "@/components/before-start";
import { MonthTabs } from "@/components/month-tabs";
import { PaymentRow } from "@/components/payment-row";
import { cop, MEDAL_LABEL, monthLabel, pct } from "@/lib/format";
import {
  getBudget, getExpensesByCategory, getPayments, getSavingsGoal, getStartMonth, getSummary, monthOf, parseMonth,
  toISO,
  upcomingPayments,
} from "@/lib/finance";
import { requireUser } from "@/lib/auth";

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<p className="text-slate-500">Cargando tu resumen…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  await connection(); // datos del día: se calculan en cada visita
  await requireUser();
  const today = toISO(new Date());
  const month = parseMonth(sp.mes, today);
  const start = getStartMonth(today);
  if (month < start) {
    return (
      <>
        <header><h1 className="text-2xl font-bold">Resumen de {monthLabel(month)}</h1></header>
        <MonthTabs path="/" month={month} todayMonth={monthOf(today)} />
        <BeforeStartNotice month={month} start={start} />
      </>
    );
  }
  const isCurrent = month === monthOf(today);
  const s = getSummary(month, today);
  const goal = getSavingsGoal(month);
  const cats = getExpensesByCategory(month);
  const next = isCurrent
    ? upcomingPayments(7, today)
    : getPayments(month, today).filter((p) => p.status !== "pagado").slice(0, 8);

  const b = getBudget(month, today);
  const stats = [
    { label: "Ingresos", value: cop(s.incomeBase), hint: `recibido ${cop(s.income)}`, href: `/ingresos?mes=${month}` },
    { label: "Pagos obligatorios", value: cop(s.paidObligations), hint: `de ${cop(s.obligationsTotal)}`, href: `/pagos?mes=${month}` },
    {
      label: "Gastos diarios", value: cop(s.dailyExpenses), href: `/gastos?mes=${month}`,
      hint: b.budget <= 0
        ? "sin presupuesto"
        : isCurrent
          ? `hoy puedes gastar ${cop(b.availableToday)}`
          : `${pct(b.usedPct)} del presupuesto`,
    },
    { label: "Margen disponible", value: cop(s.margin), hint: `tasa de ahorro ${pct(s.savingsRate)}`, negative: s.margin < 0 },
  ];

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">Resumen de {monthLabel(month)}</h1>
        <p className="text-sm text-slate-500">Hoy es {today}</p>
      </header>

      <MonthTabs path="/" month={month} todayMonth={monthOf(today)} />

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((x) => {
          const body = (
            <>
              <p className="text-xs font-medium text-slate-500">{x.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums md:text-xl ${x.negative ? "text-red-600" : ""}`}>{x.value}</p>
              {x.hint && <p className="text-[11px] text-slate-500">{x.hint}</p>}
            </>
          );
          return x.href ? (
            <Link key={x.label} href={x.href} className={`${card} block hover:border-emerald-500`}>{body}</Link>
          ) : (
            <div key={x.label} className={card}>{body}</div>
          );
        })}
      </section>

      <section className={card} aria-label="Reto de ahorro">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Reto de ahorro</h2>
          <span className="text-sm font-medium">{MEDAL_LABEL[goal.medal]}</span>
        </div>
        <Bar label="Meta mensual" value={goal.saved} target={goal.monthlyTarget} progress={goal.monthlyProgress} />
        <Bar label="Meta anual" value={goal.yearSaved} target={goal.yearlyTarget} progress={goal.yearlyProgress} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={card} aria-label="Gastos por categoría">
          <h2 className="mb-3 font-semibold">Gastos por categoría</h2>
          <Donut data={cats} />
        </section>

        <section className={card} aria-label="Próximos pagos">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{isCurrent ? "Próximos 7 días" : "Pendientes del mes"}</h2>
            <Link href={`/pagos?mes=${month}`} className="text-sm font-medium text-emerald-600">Ver pagos</Link>
          </div>
          {next.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{isCurrent ? "Nada pendiente esta semana 🎉" : "Nada pendiente este mes 🎉"}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {next.map((p) => <PaymentRow key={p.id} p={p} month={month} />)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Bar({ label, value, target, progress }: { label: string; value: number; target: number; progress: number }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">{cop(value)} / {cop(target)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function Donut({ data }: { data: { category: string; color: string; total: number }[] }) {
  const total = data.reduce((a, d) => a + d.total, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">Aún no hay gastos este mes.</p>;
  }
  const stops = data.map((d, i) => {
    const before = data.slice(0, i).reduce((a, x) => a + x.total, 0);
    return `${d.color} ${(before / total) * 100}% ${((before + d.total) / total) * 100}%`;
  });
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div
        role="img"
        aria-label={`Distribución de gastos: ${data.map((d) => `${d.category} ${pct(d.total / total)}`).join(", ")}`}
        className="size-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})`, mask: "radial-gradient(circle, transparent 52%, #000 53%)" }}
      />
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.category} className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1">{d.category}</span>
            <span className="tabular-nums text-slate-500">{cop(d.total)} · {pct(d.total / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
