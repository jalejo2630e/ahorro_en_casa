import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

const sqlite =
  globalForDb.sqlite ?? new Database(process.env.DATABASE_PATH ?? "data/ahorro.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// Tabla de configuración: se crea sola (idempotente) para no exigir un `db:push` sobre una base con datos.
// El SQL replica exactamente el que genera drizzle-kit para `settings` en schema.ts.
sqlite.exec("CREATE TABLE IF NOT EXISTS `settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);");
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
