import { STATUS_LABEL } from "@/lib/format";
import type { Semaphore } from "@/lib/finance";

const STYLE: Record<Semaphore, string> = {
  pagado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  urgente: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
const ICON: Record<Semaphore, string> = { pagado: "✅", pendiente: "⏳", urgente: "⚠️" };

// Color + icono + texto: el estado no depende solo del color.
export function StatusBadge({ status, label }: { status: Semaphore; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
      <span aria-hidden>{ICON[status]}</span>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export const DOT: Record<Semaphore, string> = {
  pagado: "bg-emerald-500",
  pendiente: "bg-amber-500",
  urgente: "bg-red-500",
};
