// Fechas puras (sin base de datos): se usan en servidor y en formularios del cliente.
// Todo en YYYY-MM-DD local, sin zona horaria.

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const monthOf = (iso: string) => iso.slice(0, 7);

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Un día 30 en febrero cae el último día del mes. */
export function dueDate(month: string, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISOStr + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(iso: string): number {
  return new Date(Date.parse(iso + "T00:00:00Z")).getUTCDay();
}
