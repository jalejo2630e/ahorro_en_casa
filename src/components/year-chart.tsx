import { cop, monthLabel } from "@/lib/format";

type Month = { month: string; beforeStart: boolean; income: number; expenses: number };

/**
 * Ingresos y gastos de cada mes del año, en barras horizontales (misma escala para todos los meses).
 * Colores = paleta validada (azul: ingresos, naranja: gastos); además cada barra lleva su valor escrito y hay
 * una vista en tabla, así que el color nunca es lo único que dice algo.
 */
export function YearChart({ months, year }: { months: Month[]; year: number }) {
  const rows = months.filter((m) => !m.beforeStart && (m.income > 0 || m.expenses > 0));
  const max = Math.max(1, ...rows.flatMap((m) => [m.income, m.expenses]));
  const width = (v: number) => `${v > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0}%`;

  return (
    <section
      aria-label={`Ingresos y gastos por mes de ${year}`}
      className="viz rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Ingresos y gastos por mes</h2>
        <ul className="flex gap-4 text-xs text-slate-600 dark:text-slate-400" aria-label="Leyenda">
          <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-[var(--series-1)]" />Ingresos</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-[var(--series-2)]" />Gastos</li>
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Todavía no hay movimientos este año.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {rows.map((m) => (
              <li key={m.month}>
                <p className="mb-1 text-xs font-medium capitalize text-slate-600 dark:text-slate-400">
                  {monthLabel(m.month).split(" ")[0]}
                </p>
                <div className="space-y-0.5">
                  {[
                    { label: "Ingresos", value: m.income, color: "var(--series-1)" },
                    { label: "Gastos", value: m.expenses, color: "var(--series-2)" },
                  ].map((b) => (
                    <div key={b.label} className="flex items-center gap-2" title={`${monthLabel(m.month)} · ${b.label}: ${cop(b.value)}`}>
                      <div className="h-2 min-w-0 flex-1">
                        <div
                          className="h-full rounded-r"
                          style={{ width: width(b.value), background: b.color }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                        {cop(b.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Ver como tabla</summary>
            <table className="mt-2 w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium">Mes</th>
                  <th className="py-1 text-right font-medium">Ingresos</th>
                  <th className="py-1 text-right font-medium">Gastos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 capitalize">{monthLabel(m.month).split(" ")[0]}</td>
                    <td className="py-1 text-right">{cop(m.income)}</td>
                    <td className="py-1 text-right">{cop(m.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
