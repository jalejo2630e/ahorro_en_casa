import Link from "next/link";
import { monthLabel } from "@/lib/format";

/** Aviso para los meses anteriores a la fecha de inicio: no se llevan pagos ni ingresos. */
export function BeforeStartNotice({ month, start }: { month: string; start: string }) {
  return (
    <section
      aria-label="Mes anterior a tu inicio"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <p className="font-semibold">{monthLabel(month)} es anterior a tu fecha de inicio</p>
      <p className="mt-1 text-sm text-slate-500">
        Empezaste a llevar tus finanzas en {monthLabel(start)}, así que aquí no se cuentan pagos ni ingresos esperados
        (nada aparece como vencido). Si quieres incluir este mes, cambia la fecha de inicio en la pestaña{" "}
        <Link href="/anual" className="font-medium text-emerald-600 underline">Año</Link>.
      </p>
    </section>
  );
}
