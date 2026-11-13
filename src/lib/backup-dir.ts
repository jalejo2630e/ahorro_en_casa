// Carpeta de los respaldos. Por defecto queda FUERA de OneDrive (en el disco local), para que no suba a la nube:
// %LOCALAPPDATA%\AhorroEnCasa\respaldos. Se puede cambiar con BACKUP_DIR en .env.local.
import os from "node:os";
import path from "node:path";

export function backupDir(): string {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
  return path.join(local, "AhorroEnCasa", "respaldos");
}
