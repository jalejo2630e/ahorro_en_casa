import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { cop, MEDAL_LABEL, monthLabel } from "@/lib/format";
import { setStartMonthAction } from "@/app/actions";
import { getStartMonth, getYearOverview, toISO } from "@/lib/finance";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Año · Ahorro en casa" };

export default function YearPage({ searchParams }: PageProps<"/anual">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando el año…</p>}>
      <Year searchParams={searchParams} />
    </Suspense>
  );
}

async function Year({ searchParams }: { searchParams: PageProps<"/anual">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  await requireUser();
  const today = toISO(new Date());
  const raw = Array.isArray(sp.anio) ? sp.anio[0] : sp.anio;
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : Number(today.slice(0, 4));
  const months = getYearOverview(year, today);
  const start = getStartMonth(today);

  const totals = months.reduce(
    (a, m) => ({ saved: a.saved + m.saved, obligations: a.obligations + m.obligations, paid: a.paid + m.paid }),
    { saved: 0, obligations: 0, paid: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Año {year}</h1>
          <p className="text-sm text-slate-500">
            Ahorrado {cop(totals.saved)} · Pagado {cop(totals.paid)} de {cop(totals.obligations)}
          </p>
        </div>
        <div className="flex gap-1 text-sm font-medium">
          <Link href={`/anual?anio=${year - 1}`} aria-label="Año anterior" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">←</Link>
          <Link href="/anual" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Este año</Link>
          <Link href={`/anual?anio=${year + 1}`} aria-label="Año siguiente" className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">→</Link>
        </div>
      </header>

      <section
        aria-label="Fecha de inicio"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <form action={setStartMonthAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="start-month" className="mb-1 block text-sm font-medium">Empecé a llevar mis finanzas en</label>
            <input
              id="start-month" name="month" type="month" required defaultValue={start} placeholder="AAAA-MM"
              pattern="[0-9]{4}-[0-9]{2}"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Guardar
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Los meses anteriores no cuentan pagos ni ingresos, así no aparecen como vencidos. Puedes moverla cuando quieras.
        </p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((m) => {
          const isCurrent = m.month === today.slice(0, 7);
          const paidPct = m.obligations ? m.paid / m.obligations : 0;
          const savePct = m.target ? Math.min(m.saved / m.target, 1) : 0;
          if (m.beforeStart) {
            return (
              <li key={m.month}>
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-400 dark:border-slate-700">
                  <h2 className="font-semibold">{monthLabel(m.month).split(" ")[0]}</h2>
                  <p className="mt-2 text-xs">Antes de tu inicio</p>
                </div>
              </li>
            );
          }
          return (
            <li key={m.month}>
              <Link
                href={`/?mes=${m.month}`}
                className={`block rounded-2xl border bg-white p-4 hover:border-emerald-500 dark:bg-slate-900 ${
                  isCurrent ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{monthLabel(m.month).split(" ")[0]}</h2>
                  {isCurrent && <span className="text-xs font-semibold text-emerald-600">Mes actual</span>}
                  {!isCurrent && m.medal !== "ninguna" && <span className="text-xs">{MEDAL_LABEL[m.medal]}</span>}
                </div>
                <Meter label="Pagado" text={`${cop(m.paid)} / ${cop(m.obligations)}`} value={paidPct} />
                <Meter label="Ahorro" text={`${cop(m.saved)} / ${cop(m.target)}`} value={savePct} />
                {m.urgentCount > 0 && (
                  <p className="mt-2 text-xs font-medium text-red-600">⚠️ {m.urgentCount} pago(s) urgente(s) o vencido(s)</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Meter({ label, text, value }: { label: string; text: string; value: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
