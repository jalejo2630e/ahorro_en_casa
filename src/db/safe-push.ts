// `npm run db:push`: aplica el esquema con red de seguridad.
// 1) respalda  2) cuenta filas  3) drizzle-kit push  4) compara filas; si algo bajó, grita y apunta al respaldo.
//
// Por qué: drizzle-kit reconstruye una tabla SQLite (DROP + CREATE) cuando el orden de columnas del
// esquema no coincide con el de la base, y en ese proceso puede perder filas. Regla: las columnas
// nuevas van SIEMPRE al final de la tabla en schema.ts. Para cambios en una base con datos reales,
// lo más seguro es un `ALTER TABLE ... ADD COLUMN` manual (nunca borra datos).
import { execSync } from "node:child_process";
import fs from "node:fs";
import Database from "better-sqlite3";

const src = process.env.DATABASE_PATH ?? "data/ahorro.db";

function counts(): Record<string, number> {
  if (!fs.existsSync(src)) return {};
  const db = new Database(src, { readonly: true });
  const out: Record<string, number> = {};
  for (const t of db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all() as { name: string }[]) {
    out[t.name] = (db.prepare(`select count(*) n from "${t.name}"`).get() as { n: number }).n;
  }
  db.close();
  return out;
}

execSync("npx tsx src/db/backup.ts", { stdio: "inherit" });
const before = counts();
execSync("npx drizzle-kit push", { stdio: "inherit" });
const after = counts();

const lost = Object.entries(before).filter(([t, n]) => (after[t] ?? 0) < n);
if (lost.length > 0) {
  console.error("\n!!! SE PERDIERON FILAS TRAS EL PUSH !!!");
  for (const [t, n] of lost) console.error(`  ${t}: ${n} -> ${after[t] ?? 0}`);
  console.error("Restaura desde el respaldo más reciente en la carpeta local de respaldos (ver src/lib/backup-dir.ts) (cierra la app antes).");
  process.exit(1);
}
console.log("Esquema aplicado; ninguna tabla perdió filas.");
