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
assert.equal(f.expectedIncome("2026-11", today), 6_000_000);
assert.equal(f.expectedIncome("2026-12", today), 5_800_000); // diciembre 2026 tiene 4 domingos

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
assert.equal(f.expectedIncome("2026-12", today), 5_800_000 + 31 * 10_000);
f.deactivateIncomePlan(plan.id);
assert.equal(f.expectedIncome("2026-12", today), 5_800_000);

// ---- Libre del mes = ingresos - pagos obligatorios (SIN descontar la meta de ahorro)
// diciembre: 5.8M esperado (recibido 3.5M < esperado) - 1.815M pagos
const b0 = f.getBudget("2026-12", today);
assert.equal(b0.budget, 3_985_000);
assert.equal(b0.daysLeft, 31); // mes futuro: todos los días por delante
const exp = f.addExpense({ concept: "Mercado", amount: 100_000, category: "Alimentación", date: "2026-12-02" });
const b1 = f.getBudget("2026-12", today);
assert.equal(b1.spent, 100_000);
assert.equal(b1.remaining, 3_885_000);
// un pago obligatorio NO cuenta como gasto diario
const arrDic = f.getPayments("2026-12", today).find((p) => p.name === "Arriendo")!;
const pagoDic = f.markPaid(arrDic.id, "2026-12", "2026-12-01");
assert.equal(f.getBudget("2026-12", today).spent, 100_000);
assert.equal(f.getDailyExpenses("2026-12").length, 1);
// borrar: el gasto diario sí; el pago obligatorio no
assert.equal(f.deleteExpense((pagoDic as { transactionId: number }).transactionId), false);
assert.equal(f.deleteExpense(exp.id), true);
assert.equal(f.getBudget("2026-12", today).spent, 0);

// ---- Lo que puedes gastar hoy = lo libre del mes / días que quedan (contando hoy)
const D = (d: number) => `2026-12-${String(d).padStart(2, "0")}`;
// Día 3, sin gastar nada: quedan 29 días contando hoy -> 3.985.000 / 29
const b3 = f.getBudget("2026-12", D(3));
assert.equal(b3.daysLeft, 29);
assert.equal(b3.freeAtStartOfToday, 3_985_000);
assert.equal(b3.availableToday, 137_414); // round(3.985.000 / 29)
assert.equal(b3.todayAllowance, 137_414);
assert.equal(f.getBudget("2026-12", today).availableToday, 0); // mes futuro: todavía no corre

// Gasto el día 2 y recibo un regalo el día 5: lo gastado baja lo libre, el regalo lo sube; se reparte en los días que quedan
f.addExpense({ concept: "Mercado", amount: 100_000, category: "Alimentación", date: D(2) });
const gift = f.addExtraIncome({ concept: "Regalo", amount: 50_000, date: D(5) });
// día 10: libre = 3.985.000 + 50.000 - 100.000 = 3.935.000, quedan 22 días
assert.equal(f.getBudget("2026-12", D(10)).availableToday, 178_864); // round(3.935.000 / 22)
// El regalo NO es ingreso del mes; sí suma a lo libre
assert.equal(f.getSummary("2026-12", D(10)).income, 3_500_000);
assert.equal(f.getSummary("2026-12", D(10)).extraReceived, 50_000);
assert.equal(f.getBudget("2026-12", D(10)).budget, 3_985_000);
assert.equal(f.getBudget("2026-12", D(10)).pool, 4_035_000);
assert.equal(f.getBudget("2026-12", D(10)).remaining, 3_935_000);

// Me paso el día 10: queda en negativo y lo de los días siguientes baja
f.addExpense({ concept: "Salida", amount: 1_000_000, date: D(10) });
assert.equal(f.getBudget("2026-12", D(10)).availableToday, -821_136); // 178.864 - 1.000.000
const b11 = f.getBudget("2026-12", D(11));
assert.equal(b11.freeAtStartOfToday, 2_935_000); // 3.985.000 + 50.000 - 1.100.000
assert.equal(b11.daysLeft, 21);
assert.equal(b11.availableToday, 139_762); // round(2.935.000 / 21)
assert.equal(b11.overspent, false); // aún queda libre en el mes

// Historial día a día
const ledger = f.getDailyLedger("2026-12", D(11));
assert.equal(ledger.length, 11);
assert.equal(ledger[1].spent, 100_000); // día 2
assert.equal(ledger[4].received, 50_000); // día 5
assert.equal(ledger[9].balance, -821_136); // día 10
assert.equal(ledger[10].freeAtStart, 2_935_000);
assert.equal(ledger[10].daysLeft, 21);

// Si gasto más de lo libre del mes, se marca
f.addExpense({ concept: "Compra enorme", amount: 5_000_000, date: D(11) });
assert.equal(f.getBudget("2026-12", D(11)).overspent, true);
f.deleteExpense(f.getDailyEntries("2026-12").find((e) => e.concept === "Compra enorme")!.id);

// Borrar el regalo lo quita; un ingreso planeado (sueldo) NO se puede borrar por esta vía
assert.equal(f.deleteExpense(gift.id), true);
assert.equal(f.getSummary("2026-12", D(11)).extraReceived, 0);
const sueldo = f.getDailyEntries("2026-12").find((e) => e.concept === "Pago principal");
assert.equal(sueldo, undefined); // los ingresos planeados no aparecen entre los movimientos diarios

// ---- Lo que marcas pertenece a SU mes, no al mes en que haces clic (hoy es noviembre)
const jan = f.getIncomePlan("2027-01", today).find((p) => p.name === "Pago principal")!;
assert.equal(jan.key, "2027-01-30");
const novIncomeBefore = f.getSummary("2026-11", today).income;
f.markIncomeReceived(jan.scheduleId, jan.key, today); // se marca HOY (nov) un ingreso de enero
assert.equal(f.getSummary("2026-11", today).income, novIncomeBefore); // no contó en noviembre
assert.equal(f.getSummary("2027-01", today).income, 3_500_000); // contó en enero
assert.equal(f.getIncomeEntries("2027-01")[0].date, "2027-01-30"); // fechado dentro de enero
assert.equal(f.getSavingsGoal("2027-01").saved, 1_050_000);

const arrJan = f.getPayments("2027-01", today).find((p) => p.name === "Arriendo")!;
const novExpBefore = f.getSummary("2026-11", today).expenses;
f.markPaid(arrJan.id, "2027-01", today);
assert.equal(f.getSummary("2026-11", today).expenses, novExpBefore); // el pago de enero no cuenta en noviembre
assert.equal(f.getSummary("2027-01", today).expenses, 1_200_000);

// ---- Deshacer
assert.equal(f.unmarkPaid(arrJan.id, "2027-01"), true);
assert.equal(f.unmarkPaid(arrJan.id, "2027-01"), false); // ya no está pagado
assert.equal(f.getSummary("2027-01", today).expenses, 0);
assert.equal(f.getPayments("2027-01", today).find((p) => p.name === "Arriendo")!.status, "pendiente");
assert.equal(f.unmarkIncomeReceived(jan.scheduleId, jan.key), true);
assert.equal(f.getSummary("2027-01", today).income, 0);
assert.equal(f.getSavingsGoal("2027-01").saved, 0); // también revierte lo apartado al ahorro
assert.equal(f.getIncomePlan("2027-01", today).find((p) => p.key === jan.key)!.status, "pendiente");

// ---- Ingresos a mano: se pueden borrar; los marcados desde "Pagos esperados" se deshacen, no se borran
const manual = f.addIncome({ concept: "pago manual", amount: 500_000, date: "2027-02-10", savePercent: 20 });
assert.equal(f.getSavingsGoal("2027-02").saved, 100_000);
assert.equal(f.deleteIncomeEntry(manual.transaction.id), true);
assert.equal(f.getSavingsGoal("2027-02").saved, 0);
assert.equal(f.getIncomeEntries("2027-02").length, 0);
const feb = f.getIncomePlan("2027-02", today).find((p) => p.name === "Pago principal")!;
f.markIncomeReceived(feb.scheduleId, feb.key, today);
const febEntry = f.getIncomeEntries("2027-02")[0];
assert.equal(febEntry.linked, true);
assert.equal(f.deleteIncomeEntry(febEntry.id), false);

// ---- Marcar recibido con el monto REAL (un domingo llegaron 100.000 y no los 200.000 programados)
const sun = f.getIncomePlan("2026-12", today).find((p) => p.name === "Ingreso dominical" && p.key === "2026-12-06")!;
assert.equal(sun.amount, 200_000); // lo programado
const decBefore = f.getSummary("2026-12", today).income;
assert.throws(() => f.markIncomeReceived(sun.scheduleId, sun.key, today, "web", -5)); // monto inválido
assert.throws(() => f.markIncomeReceived(sun.scheduleId, sun.key, today, "web", 1.5));
f.markIncomeReceived(sun.scheduleId, sun.key, today, "web", 100_000);
assert.equal(f.getSummary("2026-12", today).income, decBefore + 100_000); // cuenta lo recibido
assert.equal(f.getSummary("2026-12", today).expectedIncome, 5_800_000); // lo esperado no cambia
assert.equal(f.getIncomeEntries("2026-12").find((e) => e.date === "2026-12-06")!.amount, 100_000);
assert.equal(f.getIncomePlan("2026-12", today).find((p) => p.key === sun.key)!.status, "recibido");
assert.equal(f.unmarkIncomeReceived(sun.scheduleId, sun.key), true);
assert.equal(f.getSummary("2026-12", today).income, decBefore);
// sin monto: usa el programado
f.markIncomeReceived(sun.scheduleId, sun.key, today);
assert.equal(f.getSummary("2026-12", today).income, decBefore + 200_000);
f.unmarkIncomeReceived(sun.scheduleId, sun.key);

// ---- Pagar un monto distinto al programado (la luz llegó más cara)
const addi = f.getPayments("2026-12", today).find((p) => p.name === "Addi")!;
assert.equal(addi.amount, 150_000); // programado
const sum0 = f.getSummary("2026-12", today);
assert.throws(() => f.markPaid(addi.id, "2026-12", today, "web", 0));
f.markPaid(addi.id, "2026-12", today, "web", 180_000);
const addiPaid = f.getPayments("2026-12", today).find((p) => p.name === "Addi")!;
assert.equal(addiPaid.status, "pagado");
assert.equal(addiPaid.amount, 150_000); // el programado no cambia
assert.equal(addiPaid.effectiveAmount, 180_000); // lo realmente pagado
const sum1 = f.getSummary("2026-12", today);
assert.equal(sum1.expenses, sum0.expenses + 180_000);
assert.equal(sum1.obligationsTotal, sum0.obligationsTotal + 30_000); // el total refleja lo real
assert.equal(sum1.pendingObligations, sum0.pendingObligations - 150_000); // lo pendiente baja lo programado
assert.equal(f.getBudget("2026-12", today).budget, f.getBudget("2026-12", today).incomeBase - sum1.obligationsTotal);
assert.equal(f.getBudget("2026-12", today).budget, 3_985_000 - 30_000); // pagar de más reduce lo libre
// deshacer vuelve a lo programado
assert.equal(f.unmarkPaid(addi.id, "2026-12"), true);
const sum2 = f.getSummary("2026-12", today);
assert.equal(sum2.obligationsTotal, sum0.obligationsTotal);
assert.equal(sum2.expenses, sum0.expenses);

// ---- Fecha de inicio: los meses anteriores no tienen pagos ni ingresos esperados (nada "vencido")
assert.equal(f.getStartMonth(today), "2026-11"); // sin configurar: el mes del primer movimiento
assert.equal(f.getPayments("2026-10", today).length, 0); // octubre es anterior: no hay pagos vencidos
assert.equal(f.getPayments("2026-11", today).length, 7);
assert.equal(f.expectedIncome("2026-10", today), 0);
assert.deepEqual(f.getIncomePlan("2026-10", today), []);
const octBudget = f.getBudget("2026-10", today);
assert.equal(octBudget.beforeStart, true);
assert.equal(octBudget.budget, 0); // no sale un presupuesto negativo
assert.equal(f.getSummary("2026-10", today).pendingObligations, 0);
const yr = f.getYearOverview(2026, today);
assert.equal(yr[9].beforeStart, true); // octubre
assert.equal(yr[9].obligations, 0);
assert.equal(yr[10].beforeStart, false); // noviembre
assert.equal(yr[0].urgentCount, 0); // enero ya no llena de rojo

// Cambiar la fecha de inicio
assert.throws(() => f.setStartMonth("2026-13"));
assert.throws(() => f.setStartMonth("basura"));
f.setStartMonth("2026-12");
assert.equal(f.getStartMonth(today), "2026-12");
assert.equal(f.getPayments("2026-11", today).length, 0); // ahora noviembre queda antes del inicio
assert.equal(f.getPayments("2026-12", today).length, 7);
assert.equal(f.getBudget("2026-11", today).beforeStart, true);
f.setStartMonth("2026-01"); // se puede adelantar el inicio: aparecen los meses anteriores
assert.equal(f.getPayments("2026-03", today).length, 7);
assert.equal(f.getBudget("2026-03", today).beforeStart, false);
f.setStartMonth("2026-11");
assert.equal(f.getPayments("2026-03", today).length, 0);
// Renombrar un pago: cambia el nombre en todos los meses y en los gastos que ya generó
f.setStartMonth("2026-01");
const rp = f.getPayments("2026-03", today)[0];
const other = f.getPayments("2026-03", today)[1];
assert.throws(() => f.updatePayment(rp.id, { name: "   " })); // vacío
assert.throws(() => f.updatePayment(rp.id, { name: other.name })); // ya existe otro con ese nombre
assert.throws(() => f.updatePayment(999999, { name: "X" })); // no existe
f.markPaid(rp.id, "2026-03", today, "web");
f.updatePayment(rp.id, { name: "  Nombre corregido  " });
assert.equal(f.getPayments("2026-03", today).find((p) => p.id === rp.id)?.name, "Nombre corregido");
assert.equal(f.getPayments("2026-04", today).find((p) => p.id === rp.id)?.name, "Nombre corregido"); // todos los meses
assert.equal(f.getPayments("2026-03", today).find((p) => p.id === rp.id)?.status, "pagado"); // el pago sigue marcado
f.updatePayment(rp.id, { name: "Nombre corregido" }); // mismo nombre sobre sí mismo no es conflicto
// Editar monto y día programados (vale para todos los meses; lo ya pagado conserva su monto real)
assert.throws(() => f.updatePayment(rp.id, { amount: 0 }));
assert.throws(() => f.updatePayment(rp.id, { amount: 1.5 }));
assert.throws(() => f.updatePayment(rp.id, { dayOfMonth: 0 }));
assert.throws(() => f.updatePayment(rp.id, { dayOfMonth: 32 }));
const paidReal = f.getPayments("2026-03", today).find((p) => p.id === rp.id)!.effectiveAmount;
f.updatePayment(rp.id, { amount: 777_000, dayOfMonth: 31 });
const apr = f.getPayments("2026-04", today).find((p) => p.id === rp.id)!;
assert.equal(apr.amount, 777_000); // mes sin pagar: toma el nuevo monto
assert.equal(apr.due, "2026-04-30"); // día 31 en un mes de 30 días -> último día
assert.equal(f.getPayments("2026-03", today).find((p) => p.id === rp.id)!.effectiveAmount, paidReal); // lo pagado no cambia
assert.equal(f.getPayments("2026-03", today).find((p) => p.id === rp.id)!.name, "Nombre corregido"); // solo cambió lo indicado
f.updatePayment(rp.id, { amount: rp.amount, dayOfMonth: rp.dayOfMonth }); // se puede devolver
f.unmarkPaid(rp.id, "2026-03");
f.setStartMonth("2026-11");
// ---- Ahorro: registrar lo que realmente guardaste (monto + fecha)
f.setStartMonth("2026-01");
const goal0 = f.getSavingsGoal("2026-03");
assert.equal(goal0.deposited, 0);
assert.equal(goal0.remaining, goal0.monthlyTarget);
assert.throws(() => f.addSavingsDeposit({ amount: 0, date: "2026-03-05" }, today)); // monto inválido
assert.throws(() => f.addSavingsDeposit({ amount: 100, date: "2026-03-5" }, today)); // fecha inválida
assert.throws(() => f.addSavingsDeposit({ amount: 100, date: "2027-12-01" }, today)); // futura
assert.throws(() => f.addSavingsDeposit({ amount: 100, date: "2025-12-01" }, today)); // antes del inicio
const pocketBefore = f.getBudget("2026-03", today).budget;
const dep1 = f.addSavingsDeposit({ amount: 400_000, date: "2026-03-05", note: "Alcancía" }, today);
f.addSavingsDeposit({ amount: 250_000, date: "2026-03-20" }, today);
f.addSavingsDeposit({ amount: 100_000, date: "2026-04-02" }, today); // otro mes: no cuenta en marzo
const g3 = f.getSavingsGoal("2026-03");
assert.equal(g3.saved, 650_000);
assert.equal(g3.deposited, 650_000);
assert.equal(g3.remaining, g3.monthlyTarget - 650_000);
assert.equal(g3.medal, "bronce"); // 65% de la meta
assert.equal(f.getSavingsGoal("2026-04").saved, 100_000);
assert.equal(f.listSavingsDeposits("2026-03").length, 2);
assert.equal(f.listSavingsDeposits("2026-03")[0].date, "2026-03-20"); // el más reciente primero
assert.equal(f.getSavingsGoal("2026-03").yearSaved, g3.yearSaved);
// Lo ahorrado deja de estar libre para gastar (la meta, no)
assert.equal(f.getBudget("2026-03", today).budget, pocketBefore - 650_000);
assert.equal(f.getBudget("2026-03", today).savedDeposits, 650_000);
// Cumplir la meta -> oro; quitar un ahorro lo devuelve
f.addSavingsDeposit({ amount: g3.remaining, date: "2026-03-28" }, today);
assert.equal(f.getSavingsGoal("2026-03").medal, "oro");
assert.equal(f.getSavingsGoal("2026-03").remaining, 0);
assert.equal(f.deleteSavingsDeposit(dep1.id), true);
assert.equal(f.deleteSavingsDeposit(dep1.id), false); // ya no existe
assert.equal(f.getSavingsGoal("2026-03").deposited, 250_000 + g3.remaining);
f.setStartMonth("2026-11");

console.log("finance OK", s);
}
main();
