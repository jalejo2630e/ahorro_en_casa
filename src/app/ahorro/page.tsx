import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { deleteSavingsAction } from "@/app/actions";
import { BeforeStartNotice } from "@/components/before-start";
import { MonthTabs } from "@/components/month-tabs";
import { SavingsForm } from "@/components/savings-form";
import { requireUser } from "@/lib/auth";
import {
  daysInMonth, getSavingsGoal, getStartMonth, listSavingsDeposits, monthOf, parseMonth, toISO,
} from "@/lib/finance";
import { cop, MEDAL_LABEL, monthLabel, pct } from "@/lib/format";

export const metadata = { title: "Ahorro · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function SavingsPage({ searchParams }: PageProps<"/ahorro">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando tu ahorro…</p>}>
      <Savings searchParams={searchParams} />
    </Suspense>
  );
}

async function Savings({ searchParams }: { searchParams: PageProps<"/ahorro">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  await requireUser();
  const today = toISO(new Date());
  const month = parseMonth(sp.mes, today);
  const start = getStartMonth(today);
  if (month < start) {
    return (
      <div className="space-y-6">
        <header><h1 className="text-2xl font-bold">Ahorro · {monthLabel(month)}</h1></header>
        <MonthTabs path="/ahorro" month={month} todayMonth={monthOf(today)} />
        <BeforeStartNotice month={month} start={start} />
      </div>
    );
  }

  const isFuture = month > monthOf(today);
  const g = getSavingsGoal(month);
  const deposits = listSavingsDeposits(month);
  const year = Number(month.slice(0, 4));
  const history = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: m, before: m < start, future: m > monthOf(today), ...getSavingsGoal(m) };
  });
  // Fecha sugerida: hoy si es el mes que miras; si es un mes pasado, su último día
  const defaultDate = monthOf(today) === month ? today : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const met = g.monthlyTarget > 0 && g.saved >= g.monthlyTarget;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Ahorro · {monthLabel(month)}</h1>
        <p className="text-sm text-slate-500">Anota cuánto ahorraste y cuándo, para ver si vas cumpliendo la meta.</p>
      </header>

      <MonthTabs path="/ahorro" month={month} todayMonth={monthOf(today)} />

      <section className={card} aria-label="Avance del mes">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Meta de {monthLabel(month)}</h2>
          <span className="text-sm font-medium">{MEDAL_LABEL[g.medal]}</span>
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-600">
          {cop(g.saved)} <span className="text-base font-medium text-slate-500">de {cop(g.monthlyTarget)}</span>
        </p>
        <div
          className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          role="progressbar" aria-valuenow={Math.round(g.monthlyProgress * 100)} aria-valuemin={0} aria-valuemax={100}
          aria-label="Progreso de la meta del mes"
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(g.monthlyProgress * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {g.monthlyTarget === 0
            ? "No hay una meta de ahorro definida."
            : met
              ? `🏅 ¡Meta cumplida!${g.saved > g.monthlyTarget ? ` Ahorraste ${cop(g.saved - g.monthlyTarget)} de más.` : ""}`
              : isFuture
                ? "Este mes todavía no empieza."
                : `Llevas ${pct(g.monthlyProgress)}. Te faltan ${cop(g.remaining)} para la meta.`}
        </p>
        {g.fromIncome > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Incluye {cop(g.fromIncome)} apartados automáticamente de tus ingresos.
          </p>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">Año {year}: </span>
          <strong className="tabular-nums">{cop(g.yearSaved)}</strong>
          <span className="text-slate-500"> de {cop(g.yearlyTarget)} ({pct(g.yearlyProgress)})</span>
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-5">
        <section className={`${card} md:col-span-2`} aria-label="Registrar ahorro">
          <h2 className="mb-3 font-semibold">Registrar ahorro</h2>
          {isFuture ? (
            <p className="text-sm text-slate-500">Todavía no puedes registrar ahorros de un mes que no empieza.</p>
          ) : (
            <SavingsForm defaultDate={defaultDate} maxDate={today} remaining={g.remaining} />
          )}
          <p className="mt-3 text-xs text-slate-500">
            Lo que registras aquí ya no cuenta como dinero libre para gastar en el día a día.
          </p>
        </section>

        <section className={`${card} md:col-span-3`} aria-label="Ahorros guardados">
          <h2 className="mb-1 font-semibold">Lo que guardaste en {monthLabel(month)}</h2>
          {deposits.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Todavía no registras ahorros este mes.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {deposits.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-8 shrink-0 text-center font-semibold tabular-nums">{Number(d.date.slice(8))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{d.note || "Ahorro"}</span>
                      <span className="text-xs text-slate-500">{d.date}{d.by && ` · ${d.by}`}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{cop(d.amount)}</span>
                    <form action={deleteSavingsAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit" aria-label={`Quitar ahorro del ${d.date}`}
                        className="rounded px-1.5 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
                      >
                        ✕
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold dark:border-slate-800">
                <span>Total guardado a mano</span>
                <span className="tabular-nums">{cop(g.deposited)}</span>
              </p>
            </>
          )}
        </section>
      </div>

      <section className={card} aria-label="Mes a mes">
        <h2 className="mb-2 font-semibold">Mes a mes · {year}</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {history.filter((h) => !h.before).map((h) => {
            const ratio = h.monthlyTarget ? Math.min(h.saved / h.monthlyTarget, 1) : 0;
            return (
              <li key={h.month} className="py-2.5">
                <Link href={`/ahorro?mes=${h.month}`} className="flex items-center gap-3 text-sm hover:underline">
                  <span className={`w-24 shrink-0 capitalize ${h.month === month ? "font-bold" : ""}`}>
                    {monthLabel(h.month).split(" ")[0]}
                  </span>
                  {h.before || h.future ? (
                    <span className="flex-1 text-xs text-slate-400">{h.before ? "antes de tu inicio" : "por venir"}</span>
                  ) : (
                    <>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </span>
                      <span className="w-40 shrink-0 text-right text-xs tabular-nums">
                        {cop(h.saved)} / {cop(h.monthlyTarget)}
                      </span>
                      <span className="w-6 shrink-0 text-center" title={MEDAL_LABEL[h.medal]}>
                        {h.medal === "oro" ? "🥇" : h.medal === "plata" ? "🥈" : h.medal === "bronce" ? "🥉" : "·"}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
