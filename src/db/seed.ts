import { db } from "./index";
import {
  categories, incomeSchedule, paymentSchedule, pockets, savingsGoals,
} from "./schema";

const cats = [
  { name: "Vivienda", kind: "vivienda", color: "#6366f1" },
  { name: "Créditos", kind: "creditos", color: "#ef4444" },
  { name: "Servicios", kind: "servicios", color: "#0ea5e9" },
  { name: "Alimentación", kind: "alimentacion", color: "#22c55e" },
  { name: "Suscripciones", kind: "suscripciones", color: "#f59e0b" },
  { name: "Otros", kind: "otros", color: "#64748b" },
];

db.delete(paymentSchedule).run();
db.delete(incomeSchedule).run();
db.delete(savingsGoals).run();
db.delete(pockets).run();
db.delete(categories).run();

db.insert(categories).values(cats).run();
const id = (n: string) => db.select().from(categories).all().find((c) => c.name === n)!.id;

// Montos de ejemplo: reemplázalos por los reales desde la app.
db.insert(paymentSchedule).values([
  { name: "Arriendo", amount: 1200000, dayOfMonth: 1, categoryId: id("Vivienda") },
  { name: "Addi", amount: 150000, dayOfMonth: 3, categoryId: id("Créditos") },
  { name: "Welli", amount: 120000, dayOfMonth: 3, categoryId: id("Créditos") },
  { name: "Plan Sonría", amount: 90000, dayOfMonth: 5, categoryId: id("Otros") },
  { name: "Energía", amount: 110000, dayOfMonth: 12, categoryId: id("Servicios") },
  { name: "Agua", amount: 60000, dayOfMonth: 15, categoryId: id("Servicios") },
  { name: "Internet", amount: 85000, dayOfMonth: 18, categoryId: id("Servicios") },
]).run();

db.insert(incomeSchedule).values([
  { name: "Pago quincena 1", amount: 1500000, dayOfMonth: 20, savePercent: 0 },
  { name: "Pago principal", amount: 3500000, dayOfMonth: 30, savePercent: 30 },
  { name: "Ingreso dominical", amount: 200000, weekday: 0, savePercent: 0 },
]).run();

db.insert(pockets).values([
  { name: "Ahorro intocable", balance: 0, locked: true },
  { name: "Arriendo blindado", balance: 0, locked: true },
  { name: "Gastos del mes", balance: 0, locked: false },
]).run();

db.insert(savingsGoals).values({
  name: "Reto de ahorro", monthlyTarget: 1000000, yearlyTarget: 12000000, year: new Date().getFullYear(),
}).run();

console.log("Seed listo");
