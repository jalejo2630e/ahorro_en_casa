import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

const sqlite =
  globalForDb.sqlite ?? new Database(process.env.DATABASE_PATH ?? "data/ahorro.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
/**
 * Migraciones ADITIVAS e idempotentes que se aplican solas al conectar, para no exigir un `db:push`
 * (que puede reconstruir tablas y perder filas) sobre una base con datos reales.
 * El SQL replica exactamente el que genera drizzle-kit a partir de schema.ts; si cambias una
 * definición allá, cámbiala aquí. Solo se agregan tablas y columnas AL FINAL: nunca se borra ni reordena.
 */
function migrate(conn: Database.Database) {
  conn.exec("CREATE TABLE IF NOT EXISTS `settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);");
  conn.exec(
    "CREATE TABLE IF NOT EXISTS `users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`username` text NOT NULL,\n\t`name` text NOT NULL,\n\t`pin_hash` text NOT NULL,\n\t`role` text DEFAULT 'member' NOT NULL,\n\t`failed_attempts` integer DEFAULT 0 NOT NULL,\n\t`locked_until` integer,\n\t`active` integer DEFAULT true NOT NULL,\n\t`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL\n);",
  );
  conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);");
  conn.exec(
    "CREATE TABLE IF NOT EXISTS `sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` integer NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL\n);",
  );
  conn.exec(
    "CREATE TABLE IF NOT EXISTS `savings_deposits` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`date` text NOT NULL,\n\t`amount` integer NOT NULL,\n\t`note` text,\n\t`user_id` integer,\n\t`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL\n);",
  );
  // payment_schedule.import_key: nombre original para que `db:import` no duplique pagos renombrados.
  // Se rellena con el nombre actual (solo filas que aún no la tienen).
  const payCols = conn.prepare("pragma table_info(payment_schedule)").all() as { name: string }[];
  if (payCols.length > 0 && !payCols.some((c) => c.name === "import_key")) {
    conn.exec("ALTER TABLE `payment_schedule` ADD `import_key` text;");
    conn.exec("UPDATE `payment_schedule` SET `import_key` = `name` WHERE `import_key` IS NULL;");
  }
  if (payCols.length > 0 && !payCols.some((c) => c.name === "start_month")) {
    conn.exec("ALTER TABLE `payment_schedule` ADD `start_month` text;");
  }
  if (payCols.length > 0 && !payCols.some((c) => c.name === "end_month")) {
    conn.exec("ALTER TABLE `payment_schedule` ADD `end_month` text;");
  }
  // users.email: correo de Google autorizado (nullable; varios NULL permitidos en el índice único)
  const userCols = conn.prepare("pragma table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "email")) conn.exec("ALTER TABLE `users` ADD `email` text;");
  conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);");
  // transactions.user_id: quién registró el movimiento (ALTER ADD COLUMN nunca borra datos)
  const cols = conn.prepare("pragma table_info(transactions)").all() as { name: string }[];
  if (cols.length > 0 && !cols.some((c) => c.name === "user_id")) {
    conn.exec("ALTER TABLE `transactions` ADD `user_id` integer;");
  }
}
migrate(sqlite);
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
