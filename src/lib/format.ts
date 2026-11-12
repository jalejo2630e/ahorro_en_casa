const copFmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
export const cop = (n: number) => copFmt.format(n);
export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const STATUS_LABEL = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  urgente: "Urgente",
} as const;

export const MEDAL_LABEL = {
  oro: "🥇 Medalla de oro",
  plata: "🥈 Medalla de plata",
  bronce: "🥉 Medalla de bronce",
  ninguna: "Sin medalla todavía",
} as const;
