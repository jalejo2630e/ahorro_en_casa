// Prueba de humo: usa una base aparte (data/check.db), no toca la real.
// Requiere una base preparada: DATABASE_PATH=data/check.db, luego `drizzle-kit push`, `tsx src/db/seed.ts`
// y finalmente `tsx src/lib/finance.check.ts`.
import assert from "node:assert/strict";

if (process.env.DATABASE_PATH !== "data/check.db") {
  throw new Error("Ejecuta con DATABASE_PATH=data/check.db para no tocar tus datos reales");
}
async function main() {
const f = await import("./finance");

assert.equal(f.dueDate("2026-02", 30), "2026-02-28");
assert.equal(f.semaphore(false, "2026-11-10", "2026-11-12"), "urgente"); // vencido
assert.equal(f.semaphore(false, "2026-11-20", "2026-11-12"), "pendiente");
assert.equal(f.semaphore(true, "2026-11-01", "2026-11-12"), "pagado");
assert.equal(f.medalFor(1_000_000, 1_000_000), "oro");
assert.equal(f.medalFor(600_000, 1_000_000), "bronce");

const today = "2026-11-12";
const arriendo = f.getPayments("2026-11", today).find((p) => p.name === "Arriendo")!;
assert.equal(arriendo.status, "urgente"); // día 1 ya vencido

const r1 = f.markPaid(arriendo.id, "2026-11", today);
const r2 = f.markPaid(arriendo.id, "2026-11", today);
assert.equal(r1.alreadyPaid, false);
assert.equal(r2.alreadyPaid, true); // idempotente, no duplica el gasto

const inc = f.addIncome({ concept: "Pago principal", amount: 3_500_000, date: today, savePercent: 30 });
assert.equal(inc.saved, 1_050_000);

const s = f.getSummary("2026-11", today);
assert.equal(s.income, 3_500_000);
assert.equal(s.expenses, 1_200_000); // un solo arriendo
assert.equal(f.getSavingsGoal("2026-11").medal, "oro");
// El ahorro se mide por mes: otro mes del mismo año no hereda lo apartado en noviembre
assert.equal(f.getSavingsGoal("2026-10").saved, 0);
assert.equal(f.getSavingsGoal("2026-10").yearSaved, 1_050_000);
assert.equal(f.getSavingsGoal("2027-11").yearSaved, 0);
const year = f.getYearOverview(2026, today);
assert.equal(year.length, 12);
assert.equal(year[10].saved, 1_050_000);
assert.equal(year[2].saved, 0);
assert.equal(f.parseMonth("2026-13", today), "2026-11");
assert.equal(f.parseMonth(["2027-02"], today), "2027-02");

// ---- Frecuencias de ingreso (reglas puras)
const { incomeOccurrences } = await import("./income");
const keys = (r: Parameters<typeof incomeOccurrences>[0], m: string) => incomeOccurrences(r, m).map((o) => o.key);
assert.deepEqual(keys({ frequency: "semanal", weekday: 0 }, "2026-11"),
  ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]); // noviembre 2026 tiene 5 domingos
assert.deepEqual(keys({ frequency: "quincenal" }, "2026-02"), ["2026-02-15", "2026-02-28"]);
assert.deepEqual(keys({ frequency: "quincenal", dayOfMonth: 30, secondDayOfMonth: 31 }, "2026-02"), ["2026-02-28"]); // sin duplicar
assert.equal(keys({ frequency: "diario" }, "2026-11").length, 30);
assert.deepEqual(incomeOccurrences({ frequency: "mensual" }, "2026-11"), [{ key: "2026-11-00", date: null }]); // sin día fijo
assert.deepEqual(keys({ frequency: "mensual", dayOfMonth: 31 }, "2026-02"), ["2026-02-28"]);

// ---- Ingresos esperados: 1.5M (día 20) + 3.5M (día 30) + 200k x 5 domingos
assert.equal(f.expectedIncome("2026-11"), 6_000_000);
assert.equal(f.expectedIncome("2026-12"), 5_800_000); // diciembre 2026 tiene 4 domingos

// ---- Marcar un ingreso esperado como recibido
const dec = f.getIncomePlan("2026-12", today);
const pago = dec.find((p) => p.name === "Pago principal")!;
assert.equal(pago.key, "2026-12-30");
assert.equal(pago.status, "pendiente");
const rec1 = f.markIncomeReceived(pago.scheduleId, pago.key, "2026-12-30");
const rec2 = f.markIncomeReceived(pago.scheduleId, pago.key, "2026-12-30");
assert.equal(rec1.alreadyReceived, false);
assert.equal(rec2.alreadyReceived, true); // idempotente
assert.equal(f.getSummary("2026-12", today).income, 3_500_000); // no se duplicó
assert.equal(f.getSavingsGoal("2026-12").saved, 1_050_000); // 30% apartado
assert.throws(() => f.markIncomeReceived(pago.scheduleId, "2026-12-15", "2026-12-15")); // fecha que no corresponde

// ---- Plan de ingreso nuevo con frecuencia diaria
const plan = f.addIncomePlan({ name: "Propinas", amount: 10_000, frequency: "diario" });
assert.equal(f.expectedIncome("2026-12"), 5_800_000 + 31 * 10_000);
f.deactivateIncomePlan(plan.id);
assert.equal(f.expectedIncome("2026-12"), 5_800_000);

// ---- Presupuesto de gastos diarios = ingresos - pagos obligatorios - meta de ahorro
// diciembre: 5.8M esperado (recibido 3.5M < esperado) - 1.815M pagos - 1M ahorro
const b0 = f.getBudget("2026-12", today);
assert.equal(b0.budget, 2_985_000);
assert.equal(b0.daysLeft, 31); // mes futuro: todos los días por delante
const exp = f.addExpense({ concept: "Mercado", amount: 100_000, category: "Alimentación", date: "2026-12-02" });
const b1 = f.getBudget("2026-12", today);
assert.equal(b1.spent, 100_000);
assert.equal(b1.remaining, 2_885_000);
// un pago obligatorio NO cuenta como gasto diario
const arrDic = f.getPayments("2026-12", today).find((p) => p.name === "Arriendo")!;
const pagoDic = f.markPaid(arrDic.id, "2026-12", "2026-12-01");
assert.equal(f.getBudget("2026-12", today).spent, 100_000);
assert.equal(f.getDailyExpenses("2026-12").length, 1);
// borrar: el gasto diario sí; el pago obligatorio no
assert.equal(f.deleteExpense((pagoDic as { transactionId: number }).transactionId), false);
assert.equal(f.deleteExpense(exp.id), true);
assert.equal(f.getBudget("2026-12", today).spent, 0);

// ---- Presupuesto diario ACUMULATIVO (diciembre: 2.985.000 repartidos en 31 días)
const D = (d: number) => `2026-12-${String(d).padStart(2, "0")}`;
// Sin gastar nada, lo asignado se acumula: asignado hasta el día d = round(2.985.000 * d / 31)
const b3 = f.getBudget("2026-12", D(3));
assert.equal(b3.availableToday, 288_871); // 3 días acumulados
assert.equal(b3.carried, 192_581); // lo que venía de los días 1 y 2
assert.equal(b3.todayAllowance, 96_290); // asignación de hoy
assert.equal(f.getBudget("2026-12", today).availableToday, 0); // mes futuro: todavía no corre
assert.equal(f.getBudget("2026-12", today).carried, 0);

// Gasto el día 2 y recibo un regalo el día 5
f.addExpense({ concept: "Mercado", amount: 100_000, category: "Alimentación", date: D(2) });
const gift = f.addExtraIncome({ concept: "Regalo", amount: 50_000, date: D(5) });
assert.equal(f.getBudget("2026-12", D(10)).availableToday, 912_903); // 962.903 - 100.000 + 50.000
// El regalo NO es ingreso del mes (no infla el presupuesto base); sí suma a lo disponible
assert.equal(f.getSummary("2026-12", D(10)).income, 3_500_000);
assert.equal(f.getSummary("2026-12", D(10)).extraReceived, 50_000);
assert.equal(f.getBudget("2026-12", D(10)).budget, 2_985_000);
assert.equal(f.getBudget("2026-12", D(10)).pool, 3_035_000);

// Me paso el día 10: queda en negativo y el día siguiente arranca con menos
f.addExpense({ concept: "Salida", amount: 1_000_000, date: D(10) });
assert.equal(f.getBudget("2026-12", D(10)).availableToday, -87_097);
const b11 = f.getBudget("2026-12", D(11));
assert.equal(b11.carried, -87_097); // arrastra el exceso
assert.equal(b11.availableToday, 9_194); // 1.059.194 asignados - 1.100.000 gastados + 50.000 de regalo
assert.equal(b11.eatingIntoSavings, false); // aún dentro del total del mes

// Historial día a día
const ledger = f.getDailyLedger("2026-12", D(11));
assert.equal(ledger.length, 11);
assert.equal(ledger[1].spent, 100_000); // día 2
assert.equal(ledger[4].received, 50_000); // día 5
assert.equal(ledger[9].balance, -87_097); // día 10
assert.equal(ledger[10].carried, ledger[9].balance); // lo de cada día pasa al siguiente

// Borrar el regalo lo quita; un ingreso planeado (sueldo) NO se puede borrar por esta vía
assert.equal(f.deleteExpense(gift.id), true);
assert.equal(f.getSummary("2026-12", D(11)).extraReceived, 0);
const sueldo = f.getDailyEntries("2026-12").find((e) => e.concept === "Pago principal");
assert.equal(sueldo, undefined); // los ingresos planeados no aparecen entre los movimientos diarios
console.log("finance OK", s);
}
main();
