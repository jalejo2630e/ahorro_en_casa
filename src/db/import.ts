// Importa tus finanzas desde un JSON (por defecto data/finanzas.json, que git ignora).
// Uso: npm run db:import [-- ruta.json]
// Es idempotente: actualiza por nombre y elimina obligaciones que ya no estén en el archivo
// (salvo las que ya tengan pagos registrados, que se conservan y se avisan).
import fs from "node:fs";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./index";
import {
  categories, incomeSchedule, paymentSchedule, paymentStatus, savingsGoals,
} from "./schema";

const file = process.argv[2] ?? "data/finanzas.json";

const schema = z.object({
  configuracion_mensual: z.object({
    meta_ahorro_mensual: z.number().int().positive(),
  }),
  ingresos: z.array(
    z.object({
      concepto: z.string().min(1),
      monto: z.number().int().positive(),
      frecuencia: z.enum(["diario", "semanal", "quincenal", "mensual"]).optional(),
      dia_ingreso: z.number().int().min(1).max(31).optional(),
      segundo_dia: z.number().int().min(1).max(31).optional(),
      dia_semana: z.enum(["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]).optional(),
    }),
  ),
  egresos: z.array(
    z.object({
      dia_pago: z.number().int().min(1).max(31),
      concepto: z.string().min(1),
      categoria: z.string().min(1),
      monto: z.number().int().positive(),
      prioridad: z.enum(["critica", "alta", "media", "baja"]).default("media"),
      bolsillo_origen: z.string().optional(),
    }),
  ),
});

const COLORS: Record<string, [string, string]> = {
  Vivienda: ["vivienda", "#6366f1"],
  "Créditos Javi": ["creditos", "#ef4444"],
  Servicios: ["servicios", "#0ea5e9"],
  Alimentación: ["alimentacion", "#22c55e"],
  "Familia y Salud": ["otros", "#ec4899"],
  Mascota: ["otros", "#a855f7"],
  Suscripciones: ["suscripciones", "#f59e0b"],
};
const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

const data = schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));

db.transaction((tx) => {
  // Categorías
  for (const name of new Set(data.egresos.map((e) => e.categoria))) {
    const [kind, color] = COLORS[name] ?? ["otros", "#64748b"];
    tx.insert(categories).values({ name, kind, color }).onConflictDoNothing().run();
  }
  const catId = new Map(tx.select().from(categories).all().map((c) => [c.name, c.id]));

  // Obligaciones: se identifican por su "import_key" (el nombre del archivo), no por el nombre visible:
  // así, si renombras un pago en la app, importar NO crea un duplicado ni te pisa el nombre.
  const names = data.egresos.map((e) => e.concepto);
  const claimed = new Set<number>();
  for (const e of data.egresos) {
    const values = {
      amount: e.monto, dayOfMonth: e.dia_pago,
      categoryId: catId.get(e.categoria)!, priority: e.prioridad,
      fundingSource: e.bolsillo_origen ?? null, active: true,
    };
    const all = tx.select().from(paymentSchedule).all();
    let existing =
      all.find((p) => p.importKey === e.concepto && !claimed.has(p.id)) ??
      all.find((p) => p.name === e.concepto && p.importKey === null && !claimed.has(p.id));
    if (!existing) {
      // Respaldo: un pago sin clave ajena al archivo con el mismo día y monto (renombrado antes de existir la clave)
      const same = all.filter(
        (p) => !claimed.has(p.id) && !names.includes(p.importKey ?? "") && p.dayOfMonth === e.dia_pago && p.amount === e.monto,
      );
      if (same.length === 1) existing = same[0];
    }
    if (existing) {
      tx.update(paymentSchedule).set({ ...values, importKey: e.concepto }).where(eq(paymentSchedule.id, existing.id)).run();
      claimed.add(existing.id);
    } else {
      const row = tx.insert(paymentSchedule).values({ ...values, name: e.concepto, importKey: e.concepto }).returning().get();
      claimed.add(row.id);
    }
  }

  // Quitar las que ya no están (conservando las que tienen historial de pagos)
  // Solo las que vinieron de un archivo (tienen import_key): las que creaste en la app no se tocan
  const stale = tx.select().from(paymentSchedule).all().filter((p) => p.importKey !== null && !claimed.has(p.id));
  const withHistory = new Set(
    stale.length
      ? tx.select({ id: paymentStatus.scheduleId }).from(paymentStatus)
          .where(inArray(paymentStatus.scheduleId, stale.map((s) => s.id))).all().map((r) => r.id)
      : [],
  );
  for (const s of stale) {
    if (withHistory.has(s.id)) {
      tx.update(paymentSchedule).set({ active: false }).where(eq(paymentSchedule.id, s.id)).run();
      console.warn(`Conservada (desactivada) por tener pagos: ${s.name}`);
    } else {
      tx.delete(paymentSchedule).where(eq(paymentSchedule.id, s.id)).run();
    }
  }

  // Ingresos programados: actualizar por nombre o insertar; los que ya no están se desactivan
  // (no se borran: pueden tener ingresos ya marcados como recibidos)
  for (const i of data.ingresos) {
    // Si no viene "frecuencia": con dia_semana es semanal; en otro caso, mensual
    const frequency = i.frecuencia ?? (i.dia_semana ? "semanal" : "mensual");
    const values = {
      name: i.concepto, amount: i.monto, frequency,
      dayOfMonth: frequency === "semanal" || frequency === "diario" ? null : (i.dia_ingreso ?? null),
      secondDayOfMonth: frequency === "quincenal" ? (i.segundo_dia ?? null) : null,
      weekday: frequency === "semanal" ? WEEKDAYS.indexOf(i.dia_semana ?? "domingo") : null,
      active: true,
    };
    const existing = tx.select().from(incomeSchedule).where(eq(incomeSchedule.name, i.concepto)).get();
    if (existing) tx.update(incomeSchedule).set(values).where(eq(incomeSchedule.id, existing.id)).run();
    else tx.insert(incomeSchedule).values({ ...values, savePercent: 0 }).run();
  }
  tx.update(incomeSchedule).set({ active: false })
    .where(notInArray(incomeSchedule.name, data.ingresos.map((i) => i.concepto))).run();

  // Meta de ahorro del año actual
  const year = new Date().getFullYear();
  const monthly = data.configuracion_mensual.meta_ahorro_mensual;
  const goal = tx.select().from(savingsGoals).where(eq(savingsGoals.year, year)).get();
  const g = { name: "Reto de ahorro", monthlyTarget: monthly, yearlyTarget: monthly * 12, year };
  if (goal) tx.update(savingsGoals).set(g).where(and(eq(savingsGoals.id, goal.id))).run();
  else tx.insert(savingsGoals).values(g).run();
});

const totalOut = data.egresos.reduce((a, e) => a + e.monto, 0);
const monthlyIn = data.ingresos.reduce((a, i) => a + i.monto * (i.dia_semana ? 4 : 1), 0);
const fmt = (n: number) => n.toLocaleString("es-CO");
console.log(`Importado: ${data.egresos.length} obligaciones, ${data.ingresos.length} ingresos.`);
console.log(`Egresos/mes: ${fmt(totalOut)} | Ingresos/mes (domingos x4): ${fmt(monthlyIn)}`);
console.log(`Sobrante tras la meta de ahorro: ${fmt(monthlyIn - totalOut - data.configuracion_mensual.meta_ahorro_mensual)}`);
