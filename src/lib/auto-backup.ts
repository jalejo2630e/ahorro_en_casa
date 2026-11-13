// Respaldo automático de la base: al arrancar la app y cada pocas horas, si el último respaldo ya tiene
// más de ~20 horas. Usa la API de respaldo de SQLite (consistente aunque la app esté en uso) y deja
// los archivos en la carpeta local de respaldos, fuera de OneDrive (los mismos que crea `npm run db:backup`). Nunca rompe la app: si falla, solo avisa.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { backupDir } from "./backup-dir";
import { dbPath } from "./db-path";

const KEEP = 30; // respaldos que se conservan
const MAX_AGE_MS = 20 * 60 * 60 * 1000; // se hace uno nuevo si el último tiene más de 20 h
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000; // revisa cada 3 h

const g = globalThis as unknown as { autoBackupStarted?: boolean };

export async function backupIfNeeded(): Promise<string | null> {
  const src = dbPath();
  if (!fs.existsSync(src)) return null;
  const base = path.basename(src, ".db");
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const mine = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}-`) && f.endsWith(".db")).sort();
  const last = mine.at(-1);
  if (last && Date.now() - fs.statSync(path.join(dir, last)).mtimeMs < MAX_AGE_MS) return null;

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const dest = path.join(dir, `${base}-${stamp}.db`);
  const conn = new Database(src, { readonly: true });
  try {
    await conn.backup(dest);
  } finally {
    conn.close();
  }
  for (const f of [...mine, path.basename(dest)].sort().reverse().slice(KEEP)) fs.rmSync(path.join(dir, f), { force: true });
  return dest;
}

export function startAutoBackup() {
  if (g.autoBackupStarted) return;
  g.autoBackupStarted = true;
  const run = () =>
    backupIfNeeded()
      .then((d) => d && console.log(`[respaldo automático] ${d}`))
      .catch((e) => console.error("[respaldo automático] falló:", e instanceof Error ? e.message : e));
  setTimeout(run, 20_000).unref(); // un poco después de arrancar, sin estorbar
  setInterval(run, CHECK_EVERY_MS).unref();
}
