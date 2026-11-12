import { connection } from "next/server";
import { Suspense } from "react";
import { deleteExpenseAction } from "@/app/actions";
import { ExpenseForm, ExtraForm } from "@/components/forms";
import { MonthTabs } from "@/components/month-tabs";
import { cop, monthLabel, pct } from "@/lib/format";
import { weekdayOf } from "@/lib/dates";
import {
  getBudget, getDailyEntries, getDailyLedger, listCategories, monthOf, parseMonth, toISO,
  type DailyEntry, type LedgerDay,
} from "@/lib/finance";
import { WEEKDAY_NAMES } from "@/lib/income";

export const metadata = { title: "Gastos diarios · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function ExpensesPage({ searchParams }: PageProps<"/gastos">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando gastos…</p>}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

/** Lunes de la semana de `iso` (las semanas van de lunes a domingo). */
function mondayOf(iso: string): string {
  const t = Date.parse(iso + "T00:00:00Z") - ((weekdayOf(iso) + 6) % 7) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

async function Expenses({ searchParams }: { searchParams: PageProps<"/gastos">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const today = toISO(new Date());
  const month = parseMonth(sp.mes, today);
  const isCurrent = month === monthOf(today);
  const isFuture = month > monthOf(today);
  const b = getBudget(month, today);
  const ledger = getDailyLedger(month, today);
  const categories = listCategories().map((c) => c.name);

  // Historial: semanas (lunes a domingo), la más reciente primero
  const weeks = new Map<string, LedgerDay[]>();
  for (const d of ledger) weeks.set(mondayOf(d.date), [...(weeks.get(mondayOf(d.date)) ?? []), d]);
  const weekList = [...weeks.entries()].sort((a, c) => c[0].localeCompare(a[0]));
  // Movimientos con fecha posterior a hoy: no están en el libro diario, pero cuentan en el mes
  const loose: DailyEntry[] = getDailyEntries(month).filter((e) => !ledger.some((l) => l.date === e.date));

  const over = b.availableToday < 0;
  const noBudget = b.budget <= 0;
  const todayRow = ledger.at(-1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Gastos diarios · {monthLabel(month)}</h1>
        <p className="text-sm text-slate-500">
          Lo que te sobra después de pagos obligatorios y ahorro, repartido por día. Lo que no gastas se acumula.
        </p>
      </header>

      <MonthTabs path="/gastos" month={month} todayMonth={monthOf(today)} />

      {noBudget ? (
        <section className={card} aria-label="Sin presupuesto">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tus pagos obligatorios ({cop(b.obligationsTotal)}) y tu meta de ahorro ({cop(b.savingsTarget)}) igualan o superan tus
            ingresos esperados ({cop(b.incomeBase)}), así que no queda presupuesto para gastos diarios este mes. Cualquier gasto
            sale de tu ahorro. Revisa tus ingresos en la pestaña Ingresos o suma dinero extra más abajo.
          </p>
        </section>
      ) : isFuture ? (
        <section className={card} aria-label="Mes futuro">
          <p className="text-sm text-slate-500">
            {monthLabel(month)} todavía no empieza. Su presupuesto será <strong>{cop(b.budget)}</strong>, unos{" "}
            <strong>{cop(b.dailyAllowance)}</strong> por día.
          </p>
        </section>
      ) : (
        <section className={card} aria-label="Disponible para gastar">
          <p className="text-sm text-slate-500">
            {isCurrent ? (over ? "Hoy te pasaste por" : "Hoy puedes gastar") : over ? "El mes cerró pasado por" : "El mes cerró con"}
          </p>
          <p className={`text-4xl font-bold tabular-nums ${over ? "text-red-600" : "text-emerald-600"}`}>
            {cop(Math.abs(b.availableToday))}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {over
              ? "Mañana arrancas con menos: ese exceso se descuenta de tu asignación."
              : "Si no lo gastas, se suma a lo de mañana. Gastarlo no toca tu ahorro."}
          </p>

          {isCurrent && todayRow && (
            <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
              <Line label="Te venía de días anteriores" value={todayRow.carried} />
              <Line label="Asignación de hoy" value={todayRow.allowance} sign />
              {todayRow.received > 0 && <Line label="Dinero extra recibido hoy" value={todayRow.received} sign />}
              <Line label="Gastado hoy" value={-todayRow.spent} sign />
              <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold dark:border-slate-800">
                <dt>Disponible ahora</dt>
                <dd className={`tabular-nums ${over ? "text-red-600" : ""}`}>{cop(todayRow.balance)}</dd>
              </div>
            </dl>
          )}

          {b.eatingIntoSavings && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              ⚠️ Ya gastaste {cop(b.spent)}, más de los {cop(b.pool)} que el mes permitía: estás gastando de tu ahorro.
            </p>
          )}
        </section>
      )}

      {!isFuture && (
        <section aria-label="Resumen del mes" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Presupuesto del mes" value={cop(b.budget)} hint={`${cop(b.dailyAllowance)} por día`} />
          <Stat label="Dinero extra recibido" value={cop(b.extra)} hint="regalos y similares" />
          <Stat label="Gastado en el mes" value={cop(b.spent)} hint={b.pool > 0 ? `${pct(b.usedPct)} de ${cop(b.pool)}` : undefined} />
          <Stat label="Te queda en el mes" value={cop(b.remaining)} hint={isCurrent ? `${b.daysLeft} día(s), contando hoy` : undefined} negative={b.remaining < 0} />
        </section>
      )}
      <p className="-mt-3 text-xs text-slate-500">
        Presupuesto = ingresos {cop(b.incomeBase)} − pagos obligatorios {cop(b.obligationsTotal)} − meta de ahorro {cop(b.savingsTarget)}.
      </p>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-6 md:col-span-2">
          <section className={card} aria-label="Registrar gasto">
            <h2 className="mb-3 font-semibold">Registrar gasto</h2>
            <ExpenseForm categories={categories} />
          </section>
          <section className={card} aria-label="Registrar dinero extra">
            <h2 className="mb-1 font-semibold">Recibí dinero</h2>
            <p className="mb-3 text-xs text-slate-500">Un regalo, una devolución… Suma a lo que puedes gastar; no cuenta como sueldo.</p>
            <ExtraForm />
          </section>
        </div>

        <section className={`${card} md:col-span-3`} aria-label="Historial día a día">
          <h2 className="mb-1 font-semibold">Día a día</h2>
          {weekList.length === 0 && loose.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {isFuture ? "Este mes todavía no empieza." : `Aún no hay movimientos en ${monthLabel(month)}.`}
            </p>
          ) : (
            <div className="space-y-5">
              {weekList.map(([monday, days]) => {
                const spent = days.reduce((a, d) => a + d.spent, 0);
                const received = days.reduce((a, d) => a + d.received, 0);
                return (
                  <div key={monday}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 pb-1 dark:border-slate-800">
                      <h3 className="text-sm font-semibold">Semana del {Number(monday.slice(8))} al {Number(addDays(monday, 6).slice(8))}</h3>
                      <p className="text-xs text-slate-500 tabular-nums">
                        gastado {cop(spent)}{received > 0 && <> · recibido +{cop(received)}</>}
                      </p>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[...days].reverse().map((d) => <DayRow key={d.date} d={d} />)}
                    </ul>
                  </div>
                );
              })}
              {loose.length > 0 && (
                <div>
                  <h3 className="border-b border-slate-100 pb-1 text-sm font-semibold dark:border-slate-800">Con fecha posterior a hoy</h3>
                  <ul className="mt-1 space-y-1">
                    {loose.map((e) => <EntryRow key={e.id} e={e} withDate />)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DayRow({ d }: { d: LedgerDay }) {
  const wd = WEEKDAY_NAMES[weekdayOf(d.date)].slice(0, 3);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{wd} {Number(d.date.slice(8))}</h4>
        <p className="text-xs tabular-nums">
          <span className="text-slate-500">queda </span>
          <strong className={d.balance < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}>{cop(d.balance)}</strong>
        </p>
      </div>
      <p className="text-xs text-slate-500 tabular-nums">
        {d.carried !== 0 && <>venía {cop(d.carried)} · </>}asignado +{cop(d.allowance)}
        {d.received > 0 && <> · recibido +{cop(d.received)}</>}
        {d.spent > 0 && <> · gastado −{cop(d.spent)}</>}
      </p>
      {d.entries.length > 0 && (
        <ul className="mt-1 space-y-1">
          {d.entries.map((e) => <EntryRow key={e.id} e={e} />)}
        </ul>
      )}
    </li>
  );
}

function EntryRow({ e, withDate }: { e: DailyEntry; withDate?: boolean }) {
  const extra = e.kind === "extra";
  return (
    <li className="flex items-center gap-2 text-sm">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: extra ? "#10b981" : (e.color ?? "#94a3b8") }} />
      <span className="min-w-0 flex-1 truncate">
        {e.concept}{" "}
        <span className="text-xs text-slate-500">· {extra ? "dinero extra" : (e.category ?? "Sin categoría")}{withDate && ` · ${e.date}`}</span>
      </span>
      <span className={`tabular-nums ${extra ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
        {extra ? "+" : "−"}{cop(e.amount)}
      </span>
      <form action={deleteExpenseAction}>
        <input type="hidden" name="id" value={e.id} />
        <button
          type="submit"
          aria-label={`Eliminar ${e.concept}`}
          className="rounded px-1.5 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
        >
          ✕
        </button>
      </form>
    </li>
  );
}

function Line({ label, value, sign }: { label: string; value: number; sign?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums">{sign && value > 0 ? "+" : ""}{cop(value)}</dd>
    </div>
  );
}

function Stat({ label, value, hint, negative }: { label: string; value: string; hint?: string; negative?: boolean }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${negative ? "text-red-600" : ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
