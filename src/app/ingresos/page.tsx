import { connection } from "next/server";
import { Suspense } from "react";
import {
  deactivateIncomeAction, deleteIncomeEntryAction, markIncomeReceivedAction, unmarkIncomeReceivedAction,
} from "@/app/actions";
import { IncomeForm } from "@/components/income-form";
import { MonthTabs } from "@/components/month-tabs";
import { StatusBadge } from "@/components/status-badge";
import { cop, monthLabel } from "@/lib/format";
import { getIncomeEntries, getIncomePlan, getSummary, listIncomePlans, monthOf, parseMonth, toISO } from "@/lib/finance";
import { describeRule, FREQUENCY_LABEL, incomeOccurrences } from "@/lib/income";

export const metadata = { title: "Ingresos · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

const BADGE = {
  recibido: { status: "pagado", label: "Recibido" },
  pendiente: { status: "pendiente", label: "Pendiente" },
  atrasado: { status: "urgente", label: "Atrasado" },
} as const;

export default function IncomePage({ searchParams }: PageProps<"/ingresos">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando ingresos…</p>}>
      <Income searchParams={searchParams} />
    </Suspense>
  );
}

async function Income({ searchParams }: { searchParams: PageProps<"/ingresos">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const today = toISO(new Date());
  const month = parseMonth(sp.mes, today);
  const s = getSummary(month, today);
  const rows = getIncomePlan(month, today);
  const plans = listIncomePlans();
  const entries = getIncomeEntries(month);
  const pendingTotal = rows.filter((r) => r.status !== "recibido").reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Ingresos · {monthLabel(month)}</h1>
        <p className="text-sm text-slate-500">Programa lo que recibes y marca cada pago cuando llegue.</p>
      </header>

      <MonthTabs path="/ingresos" month={month} todayMonth={monthOf(today)} />

      <section aria-label="Resumen de ingresos" className="grid grid-cols-3 gap-3">
        <Stat label="Esperado" value={cop(s.expectedIncome)} />
        <Stat label="Recibido" value={cop(s.income)} />
        <Stat label="Falta por recibir" value={cop(pendingTotal)} />
      </section>

      <div className="grid gap-6 md:grid-cols-5">
        <section className={`${card} md:col-span-2`} aria-label="Registrar ingreso">
          <h2 className="mb-3 font-semibold">Registrar ingreso</h2>
          <IncomeForm month={month} />
        </section>

        <div className="space-y-6 md:col-span-3">
          <section className={card} aria-label="Pagos esperados del mes">
            <h2 className="mb-1 font-semibold">Pagos esperados</h2>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No hay ingresos programados. Agrega uno con frecuencia diaria, semanal, quincenal o mensual.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const b = BADGE[r.status];
                  return (
                    <li key={`${r.scheduleId}-${r.key}`} className="flex items-center gap-3 py-3">
                      <div className="w-12 shrink-0 text-center">
                        {r.date ? (
                          <>
                            <p className="text-xl font-bold leading-none">{Number(r.date.slice(8))}</p>
                            <p className="text-[10px] uppercase text-slate-500">día</p>
                          </>
                        ) : (
                          <p className="text-[10px] uppercase leading-tight text-slate-500">sin día fijo</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.name}</p>
                        {r.savePercent > 0 && <p className="text-xs text-slate-500">Aparta {r.savePercent}% al ahorro</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="font-semibold tabular-nums">{cop(r.amount)}</p>
                        {r.status === "recibido" ? (
                          <form action={unmarkIncomeReceivedAction} className="flex items-center gap-2">
                            <StatusBadge status={b.status} label={b.label} />
                            <input type="hidden" name="scheduleId" value={r.scheduleId} />
                            <input type="hidden" name="key" value={r.key} />
                            <button
                              type="submit"
                              className="text-xs text-slate-500 underline hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                            >
                              Deshacer
                            </button>
                          </form>
                        ) : (
                          <form action={markIncomeReceivedAction} className="flex items-center gap-2">
                            <StatusBadge status={b.status} label={b.label} />
                            <input type="hidden" name="scheduleId" value={r.scheduleId} />
                            <input type="hidden" name="key" value={r.key} />
                            <button
                              type="submit"
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                            >
                              Marcar recibido
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={card} aria-label="Ingresos recibidos">
            <h2 className="mb-1 font-semibold">Ingresos recibidos</h2>
            <p className="mb-2 text-xs text-slate-500">
              Todo lo que ya entró en {monthLabel(month)}. Si un sueldo aparece dos veces, quita el registrado a mano (✕) o
              deshaz el que marcaste en “Pagos esperados”.
            </p>
            {entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Todavía no hay ingresos recibidos este mes.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-8 shrink-0 text-center font-semibold tabular-nums">{Number(e.date.slice(8))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{e.concept}</span>
                        <span className="text-xs text-slate-500">
                          {e.linked ? "vinculado a Pagos esperados" : "registrado a mano"}
                          {e.saved > 0 && ` · apartó ${cop(e.saved)}`}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{cop(e.amount)}</span>
                      {e.linked ? (
                        <span className="w-6" aria-hidden />
                      ) : (
                        <form action={deleteIncomeEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button
                            type="submit"
                            aria-label={`Quitar ${e.concept}`}
                            className="rounded px-1.5 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
                          >
                            ✕
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold dark:border-slate-800">
                  <span>Total recibido</span>
                  <span className="tabular-nums">{cop(entries.reduce((a, e) => a + e.amount, 0))}</span>
                </p>
              </>
            )}
          </section>

          <section className={card} aria-label="Ingresos programados">
            <h2 className="mb-1 font-semibold">Mis ingresos programados</h2>
            {plans.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Todavía no tienes ninguno.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {plans.map((p) => {
                  const n = incomeOccurrences(p.rule, month).length;
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {FREQUENCY_LABEL[p.frequency]} · {describeRule(p.rule)} · {cop(p.amount)} c/u
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{cop(p.amount * n)}</p>
                        <p className="text-xs text-slate-500">{n} pago{n === 1 ? "" : "s"} este mes</p>
                      </div>
                      <form action={deactivateIncomeAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          aria-label={`Quitar ${p.name}`}
                          className="rounded px-1.5 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
                        >
                          ✕
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums md:text-lg">{value}</p>
    </div>
  );
}
