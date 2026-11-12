import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

const sqlite =
  globalForDb.sqlite ?? new Database(process.env.DATABASE_PATH ?? "data/ahorro.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
