import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Todos los montos se guardan como enteros en pesos (COP), sin decimales.

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  // vivienda | creditos | servicios | alimentacion | suscripciones | otros
  kind: text("kind").notNull().default("otros"),
  color: text("color").notNull().default("#64748b"),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["ingreso", "gasto"] }).notNull(),
  concept: text("concept").notNull(),
  amount: integer("amount").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  pocketId: integer("pocket_id").references(() => pockets.id),
  date: text("date").notNull(), // YYYY-MM-DD
  // Si nace de pagar una obligación del calendario
  scheduleId: integer("schedule_id"),
  source: text("source", { enum: ["web", "mcp"] }).notNull().default("web"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Bolsillos virtuales (ahorro intocable, arriendo blindado, etc.)
export const pockets = sqliteTable("pockets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
});

export const savingsGoals = sqliteTable("savings_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  monthlyTarget: integer("monthly_target").notNull(),
  yearlyTarget: integer("yearly_target").notNull(),
  year: integer("year").notNull(),
});

// Obligaciones recurrentes: una fila por obligación, se repite cada mes
export const paymentSchedule = sqliteTable("payment_schedule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  dayOfMonth: integer("day_of_month").notNull(), // 1..30
  categoryId: integer("category_id").references(() => categories.id),
  priority: text("priority", { enum: ["critica", "alta", "media", "baja"] }).notNull().default("media"),
  // Ingreso con el que se planea pagar, p. ej. "Sueldo Empresa 1 (Día 30)"
  fundingSource: text("funding_source"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Pagos efectivos por mes: aquí vive el estado del semáforo
export const paymentStatus = sqliteTable("payment_status", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scheduleId: integer("schedule_id")
    .notNull()
    .references(() => paymentSchedule.id),
  month: text("month").notNull(), // YYYY-MM
  paidAt: text("paid_at"), // null = pendiente
  transactionId: integer("transaction_id"),
});

// Ingresos esperados fraccionados (días 20/21, 23/25, 30, domingos…)
export const incomeSchedule = sqliteTable("income_schedule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  dayOfMonth: integer("day_of_month"), // null si es semanal
  weekday: integer("weekday"), // 0 = domingo, para ingresos semanales
  savePercent: integer("save_percent").notNull().default(0), // % que se aparta al entrar
});
