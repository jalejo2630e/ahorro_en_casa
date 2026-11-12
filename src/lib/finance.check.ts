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
console.log("finance OK", s);
}
main();
