import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  // Parte del ingreso que se apartó al ahorro (solo ingresos); permite medir la meta por mes
  saved: integer("saved").notNull().default(0),
  categoryId: integer("category_id").references(() => categories.id),
  pocketId: integer("pocket_id").references(() => pockets.id),
  date: text("date").notNull(), // YYYY-MM-DD
  // Si nace de pagar una obligación del calendario
  scheduleId: integer("schedule_id"),
  source: text("source", { enum: ["web", "mcp"] }).notNull().default("web"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // IMPORTANTE: las columnas nuevas SIEMPRE van al final. drizzle-kit reconstruye la tabla (y
  // puede perder filas) si el orden de columnas del esquema no coincide con el de la base.
  // Dinero extra (regalos, etc.) que suma al presupuesto de gastos diarios; NO es ingreso planeado.
  // 0 / 1 (entero simple, para que el DDL coincida con el ALTER TABLE).
  extra: integer("extra").notNull().default(0),
  // Quién registró el movimiento (null = asistente MCP, o anterior a los usuarios). Sin FK a propósito:
  // así el ALTER TABLE manual coincide con el esquema y drizzle-kit no reconstruye la tabla.
  userId: integer("user_id"),
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

// Ingresos recurrentes. `amount` es lo que se recibe en CADA pago.
export const incomeSchedule = sqliteTable("income_schedule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  frequency: text("frequency", { enum: ["diario", "semanal", "quincenal", "mensual"] })
    .notNull()
    .default("mensual"),
  dayOfMonth: integer("day_of_month"), // mensual: día (vacío = sin día fijo); quincenal: primer día
  secondDayOfMonth: integer("second_day_of_month"), // quincenal: segundo día
  weekday: integer("weekday"), // semanal: 0 = domingo
  savePercent: integer("save_percent").notNull().default(0), // % que se aparta al recibir
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Cada ocurrencia esperada que ya se marcó como recibida.
// `occurrence` es la fecha esperada (YYYY-MM-DD) o YYYY-MM-00 si el ingreso mensual no tiene día fijo.
export const incomeReceipts = sqliteTable(
  "income_receipts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => incomeSchedule.id),
    occurrence: text("occurrence").notNull(),
    transactionId: integer("transaction_id"),
  },
  (t) => [uniqueIndex("income_receipts_unique").on(t.scheduleId, t.occurrence)],
);

// Configuración clave/valor. Hoy: "start_month" (YYYY-MM), el primer mes que llevas en la app.
// OJO: src/db/index.ts crea esta tabla con CREATE TABLE IF NOT EXISTS; si cambias esta definición,
// cambia también ese SQL (deben coincidir exactamente o drizzle-kit querrá reconstruir la tabla).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------- Usuarios y sesiones ----------
// Los datos financieros son compartidos por todo el hogar; los usuarios solo controlan quién entra
// (y quién registró cada movimiento). OJO: src/db/index.ts crea estas tablas con CREATE TABLE IF NOT EXISTS;
// si cambias estas definiciones, regenera ese SQL (deben coincidir exactamente).
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(), // minúsculas, único
  name: text("name").notNull(), // nombre para mostrar
  pinHash: text("pin_hash").notNull(), // scrypt; nunca el PIN
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until"), // epoch ms; null = sin bloqueo
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // Correo de Google autorizado por el administrador (minúsculas). Va AL FINAL de la tabla.
  email: text("email"),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

// Se guarda el hash (sha256) del token, no el token: si alguien lee la base no puede usar las sesiones.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(), // epoch ms
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
