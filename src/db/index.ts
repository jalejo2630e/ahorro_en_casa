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
  // transactions.user_id: quién registró el movimiento (ALTER ADD COLUMN nunca borra datos)
  const cols = conn.prepare("pragma table_info(transactions)").all() as { name: string }[];
  if (cols.length > 0 && !cols.some((c) => c.name === "user_id")) {
    conn.exec("ALTER TABLE `transactions` ADD `user_id` integer;");
  }
}
migrate(sqlite);
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
