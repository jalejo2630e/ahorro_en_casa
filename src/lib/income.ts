// Reglas de frecuencia de ingresos (puras: sin base de datos).
import { daysInMonth, dueDate, weekdayOf } from "./dates";

export const FREQUENCIES = ["diario", "semanal", "quincenal", "mensual"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type IncomeRule = {
  frequency: Frequency;
  dayOfMonth?: number | null; // mensual: día; quincenal: primer día (por defecto 15)
  secondDayOfMonth?: number | null; // quincenal: segundo día (por defecto 30)
  weekday?: number | null; // semanal: 0 = domingo (por defecto)
};

/** `key` identifica la ocurrencia; `date` es null si el ingreso mensual no tiene día fijo. */
export type Occurrence = { key: string; date: string | null };

/** Fechas en las que se espera recibir un ingreso durante `month` (YYYY-MM). */
export function incomeOccurrences(rule: IncomeRule, month: string): Occurrence[] {
  const days = daysInMonth(month);
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const occ = (date: string): Occurrence => ({ key: date, date });

  switch (rule.frequency) {
    case "diario":
      return Array.from({ length: days }, (_, i) => occ(iso(i + 1)));
    case "semanal": {
      const wd = rule.weekday ?? 0;
      return Array.from({ length: days }, (_, i) => iso(i + 1))
        .filter((d) => weekdayOf(d) === wd)
        .map(occ);
    }
    case "quincenal": {
      const dates = new Set([dueDate(month, rule.dayOfMonth ?? 15), dueDate(month, rule.secondDayOfMonth ?? 30)]);
      return [...dates].sort().map(occ);
    }
    case "mensual":
      // Sin día fijo: cuenta una vez en el mes, sin fecha
      return rule.dayOfMonth ? [occ(dueDate(month, rule.dayOfMonth))] : [{ key: `${month}-00`, date: null }];
  }
}

/** Texto corto para mostrar cuándo llega un ingreso. */
export function describeRule(rule: IncomeRule): string {
  switch (rule.frequency) {
    case "diario":
      return "Todos los días";
    case "semanal":
      return `Cada ${WEEKDAY_NAMES[rule.weekday ?? 0].toLowerCase()}`;
    case "quincenal":
      return `Días ${rule.dayOfMonth ?? 15} y ${rule.secondDayOfMonth ?? 30}`;
    case "mensual":
      return rule.dayOfMonth ? `El día ${rule.dayOfMonth} de cada mes` : "Una vez al mes, sin día fijo";
  }
}
