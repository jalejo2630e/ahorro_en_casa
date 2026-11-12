// Respaldo consistente de la base (incluye lo que aún está en el WAL).
// Uso: npm run db:backup   ->  data/backups/ahorro-AAAAMMDD-HHMMSS.db
// `npm run db:push` lo ejecuta antes de tocar el esquema.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const src = process.env.DATABASE_PATH ?? "data/ahorro.db";

async function main() {
  if (!fs.existsSync(src)) {
    console.log(`No hay base en ${src}; nada que respaldar.`);
    return;
  }
  const dir = path.join(path.dirname(src), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const dest = path.join(dir, `${path.basename(src, ".db")}-${stamp}.db`);

  const db = new Database(src, { readonly: true });
  await db.backup(dest); // API de respaldo de SQLite: seguro aunque la app esté corriendo
  const n = db.prepare("select count(*) n from transactions").get() as { n: number } | undefined;
  db.close();
  console.log(`Respaldo creado: ${dest} (${n?.n ?? 0} movimientos)`);

  // Conservar solo los 20 más recientes
  const old = fs.readdirSync(dir).filter((f) => f.startsWith(path.basename(src, ".db") + "-")).sort().reverse().slice(20);
  for (const f of old) fs.rmSync(path.join(dir, f));
}

main().catch((e) => {
  console.error("Falló el respaldo:", e.message);
  process.exit(1);
});
