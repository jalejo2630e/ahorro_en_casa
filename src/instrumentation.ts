// Se ejecuta una vez cuando arranca el servidor de Next.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoBackup } = await import("./lib/auto-backup");
    startAutoBackup();
    const { startPushScheduler } = await import("./lib/push");
    startPushScheduler();
  }
}
