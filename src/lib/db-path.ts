// Ruta de la base. Sale de DATABASE_PATH; los scripts (db:push, db:backup…) corren fuera de Next y no leen
// .env.local solos, así que aquí se carga para que TODOS usen la misma base (sin pisar variables ya definidas).
import fs from "node:fs";

export function dbPath(): string {
  if (!process.env.DATABASE_PATH && fs.existsSync(".env.local")) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      /* si no se puede leer, se usa la ruta por defecto */
    }
  }
  return process.env.DATABASE_PATH ?? "data/ahorro.db";
}
