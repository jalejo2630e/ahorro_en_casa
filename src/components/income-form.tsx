"use client";

import { useActionState, useState } from "react";
import { addIncomeAction } from "@/app/actions";
import { cop, monthLabel } from "@/lib/format";
import { incomeOccurrences, WEEKDAY_NAMES, type Frequency } from "@/lib/income";
import { input, label, Message, Submit } from "./forms";

type Choice = "unica" | Frequency;

const OPTIONS: { value: Choice; label: string; hint: string }[] = [
  { value: "unica", label: "Una sola vez", hint: "Plata que ya recibiste" },
  { value: "diario", label: "Diario", hint: "Se cuenta cada día del mes" },
  { value: "semanal", label: "Semanal", hint: "Una vez por semana" },
  { value: "quincenal", label: "Quincenal", hint: "Dos veces al mes" },
  { value: "mensual", label: "Mensual", hint: "Una vez al mes" },
];

/** `month` (YYYY-MM) solo sirve para estimar el total mensual en pantalla. */
export function IncomeForm({ month }: { month: string }) {
  const [state, action, pending] = useActionState(addIncomeAction, null);
  const [freq, setFreq] = useState<Choice>("mensual");
  const [amount, setAmount] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [day1, setDay1] = useState("");
  const [day2, setDay2] = useState("");

  const value = Number(amount.replace(/\D/g, "")) || 0;
  const count =
    freq === "unica"
      ? 1
      : incomeOccurrences(
          {
            frequency: freq,
            weekday: Number(weekday),
            dayOfMonth: day1 ? Number(day1) : null,
            secondDayOfMonth: day2 ? Number(day2) : null,
          },
          month,
        ).length;
  const hint = OPTIONS.find((o) => o.value === freq)!.hint;

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="i-concept">Concepto</label>
        <input id="i-concept" name="concept" required maxLength={120} className={input} placeholder="Sueldo, domingos, propinas…" />
      </div>

      <div>
        <label className={label} htmlFor="i-freq">¿Cómo lo recibes?</label>
        <select id="i-freq" name="frequency" className={input} value={freq} onChange={(e) => setFreq(e.target.value as Choice)}>
          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>

      <div>
        <label className={label} htmlFor="i-amount">
          {freq === "unica" ? "Monto recibido (COP)" : "Monto de cada pago (COP)"}
        </label>
        <input
          id="i-amount" name="amount" required inputMode="numeric" className={input} placeholder="2.000.000"
          value={amount} onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* Campos que dependen de la frecuencia: los que no aplican ni se muestran ni se envían */}
      {freq === "unica" && (
        <div>
          <label className={label} htmlFor="i-date">Fecha <span className="font-normal text-slate-500">(vacío = hoy)</span></label>
          <input id="i-date" name="date" type="date" className={input} />
        </div>
      )}

      {freq === "semanal" && (
        <div>
          <label className={label} htmlFor="i-weekday">Día de la semana</label>
          <select id="i-weekday" name="weekday" className={input} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </div>
      )}

      {freq === "quincenal" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="i-d1">Primer día</label>
            <input id="i-d1" name="day1" type="number" min={1} max={31} className={input} placeholder="15" value={day1} onChange={(e) => setDay1(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="i-d2">Segundo día</label>
            <input id="i-d2" name="day2" type="number" min={1} max={31} className={input} placeholder="30" value={day2} onChange={(e) => setDay2(e.target.value)} />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-slate-500">Si los dejas vacíos se usan el 15 y el 30.</p>
        </div>
      )}

      {freq === "mensual" && (
        <div>
          <label className={label} htmlFor="i-d1">Día del mes <span className="font-normal text-slate-500">(opcional)</span></label>
          <input id="i-d1" name="day1" type="number" min={1} max={31} className={input} placeholder="Vacío = sin día fijo" value={day1} onChange={(e) => setDay1(e.target.value)} />
        </div>
      )}

      <div>
        <label className={label} htmlFor="i-save">% a apartar al ahorro intocable</label>
        <input id="i-save" name="savePercent" type="number" min={0} max={100} defaultValue={0} className={input} />
      </div>

      {value > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950" aria-live="polite">
          {freq === "unica" ? (
            <>Vas a registrar <strong>{cop(value)}</strong>.</>
          ) : (
            <>
              Total estimado en {monthLabel(month)}: <strong>{cop(value * count)}</strong>{" "}
              <span className="text-slate-500">({count} pago{count === 1 ? "" : "s"} de {cop(value)})</span>
            </>
          )}
        </p>
      )}

      <Message state={state} />
      <Submit pending={pending}>{freq === "unica" ? "Registrar ingreso" : "Programar ingreso"}</Submit>
    </form>
  );
}
