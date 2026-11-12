import Link from "next/link";

const NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Selector de los 12 meses del año de `month`, con flechas para cambiar de año. */
export function MonthTabs({ path, month, todayMonth }: { path: string; month: string; todayMonth: string }) {
  const year = Number(month.slice(0, 4));
  const mm = month.slice(5);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Link href={`${path}?mes=${year - 1}-${mm}`} aria-label="Año anterior" className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">←</Link>
        <span>{year}</span>
        <Link href={`${path}?mes=${year + 1}-${mm}`} aria-label="Año siguiente" className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">→</Link>
      </div>
      <nav aria-label={`Meses de ${year}`} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {NAMES.map((name, i) => {
          const m = `${year}-${String(i + 1).padStart(2, "0")}`;
          const active = m === month;
          return (
            <Link
              key={m}
              href={`${path}?mes=${m}`}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {name}
              {m === todayMonth && (
                <span aria-label="mes actual" className={`absolute right-1.5 top-1 size-1.5 rounded-full ${active ? "bg-white" : "bg-emerald-500"}`} />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
