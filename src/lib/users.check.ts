// Prueba de usuarios/PIN/sesiones. Usa una base aparte: DATABASE_PATH=data/check.db
// (preparada con `drizzle-kit push --force` en esa base desechable).
import assert from "node:assert/strict";

if (process.env.DATABASE_PATH !== "data/check.db") {
  throw new Error("Ejecuta con DATABASE_PATH=data/check.db para no tocar tus datos reales");
}

async function main() {
  const u = await import("./users");
  const { db } = await import("@/db");
  const { sessions, users } = await import("@/db/schema");
  const MIN = 60_000;
  const T0 = Date.UTC(2026, 10, 12, 12, 0, 0);

  // ---- Hash del PIN
  const h1 = await u.hashPin("123456");
  const h2 = await u.hashPin("123456");
  assert.notEqual(h1, h2); // cada PIN lleva su propia sal
  assert.ok(!h1.includes("123456")); // nunca el PIN en claro
  assert.equal(await u.verifyPinHash("123456", h1), true);
  assert.equal(await u.verifyPinHash("123457", h1), false);
  assert.equal(await u.verifyPinHash("123456", "basura"), false);

  // ---- Crear usuarios: validaciones
  assert.equal(u.countUsers(), 0);
  await assert.rejects(u.createUser({ username: "ab", name: "X", pin: "123456" })); // usuario corto
  await assert.rejects(u.createUser({ username: "con espacio", name: "X", pin: "123456" }));
  await assert.rejects(u.createUser({ username: "javi", name: "Javi", pin: "12345" })); // PIN de 5
  await assert.rejects(u.createUser({ username: "javi", name: "Javi", pin: "12345a" })); // no solo dígitos
  await assert.rejects(u.createUser({ username: "javi", name: "  ", pin: "123456" })); // sin nombre
  const admin = await u.createUser({ username: "  JAVI ", name: "Javi", pin: "123456", role: "admin" });
  assert.equal(admin.username, "javi"); // se normaliza a minúsculas
  await assert.rejects(u.createUser({ username: "javi", name: "Otro", pin: "654321" })); // duplicado
  assert.equal(u.countUsers(), 1);
  const stored = db.select().from(users).get()!;
  assert.ok(!stored.pinHash.includes("123456"));

  // ---- Inicio de sesión
  const ok = await u.authenticate("Javi", "123456", T0);
  assert.equal(ok.ok, true);
  const bad = await u.authenticate("javi", "000000", T0);
  assert.deepEqual(bad, { ok: false, reason: "invalid" });
  // usuario inexistente: mismo resultado que PIN malo (no revela si existe) y no revienta
  assert.deepEqual(await u.authenticate("nadie", "123456", T0), { ok: false, reason: "invalid" });
  assert.deepEqual(await u.authenticate("x", "123456", T0), { ok: false, reason: "invalid" });
  assert.deepEqual(await u.authenticate("javi", "abc", T0), { ok: false, reason: "invalid" }); // PIN mal formado

  // ---- Bloqueo tras 5 fallos (ya llevamos 2: el "000000" y el "abc"; el de usuario inexistente no cuenta)
  assert.equal((await u.authenticate("javi", "111111", T0)).ok, false); // 3
  assert.equal((await u.authenticate("javi", "111111", T0)).ok, false); // 4
  const fifth = await u.authenticate("javi", "111111", T0); // 5 -> bloquea
  assert.deepEqual(fifth, { ok: false, reason: "locked", retryInMinutes: u.LOCK_MINUTES });
  // bloqueado: ni con el PIN correcto entra
  const locked = await u.authenticate("javi", "123456", T0 + 5 * MIN);
  assert.equal(locked.ok, false);
  assert.equal((locked as { reason: string }).reason, "locked");
  assert.equal((locked as { retryInMinutes: number }).retryInMinutes, 10);
  // pasado el bloqueo, entra y el contador se reinicia
  assert.equal((await u.authenticate("javi", "123456", T0 + 16 * MIN)).ok, true);
  assert.equal(db.select().from(users).get()!.failedAttempts, 0);

  // ---- Sesiones
  const s = u.createSession(admin.id, T0);
  const sid = db.select().from(sessions).get()!.id;
  assert.notEqual(sid, s.token); // en la base solo queda el hash del token
  assert.equal(sid.length, 64);
  assert.equal(u.userFromToken(s.token, T0 + MIN)?.username, "javi");
  assert.equal(u.userFromToken("token-falso", T0), null);
  assert.equal(u.userFromToken(undefined, T0), null);
  assert.equal(u.userFromToken(s.token, T0 + (u.SESSION_DAYS + 1) * 86_400_000), null); // vencida
  u.deleteSession(s.token);
  assert.equal(u.userFromToken(s.token, T0 + MIN), null); // cerrar sesión funciona

  // ---- El único administrador no se puede desactivar
  assert.throws(() => u.setUserActive(admin.id, false), /único administrador/);
  const ana = await u.createUser({ username: "ana", name: "Ana", pin: "246810" });
  assert.equal(ana.role, "member"); // por defecto, miembro
  const sAna = u.createSession(ana.id, T0);
  assert.equal(u.userFromToken(sAna.token, T0)?.role, "member");
  u.setUserActive(ana.id, false); // desactivar cierra sus sesiones y le impide entrar
  assert.equal(u.userFromToken(sAna.token, T0), null);
  assert.deepEqual(await u.authenticate("ana", "246810", T0), { ok: false, reason: "invalid" });
  u.setUserActive(ana.id, true);
  assert.equal((await u.authenticate("ana", "246810", T0)).ok, true);

  // ---- Un segundo administrador permite desactivar al primero; nunca quedan 0
  const bea = await u.createUser({ username: "bea", name: "Bea", pin: "135790", role: "admin" });
  u.setUserActive(admin.id, false);
  assert.throws(() => u.setUserActive(bea.id, false), /único administrador/);
  u.setUserActive(admin.id, true);

  // ---- Restablecer PIN (administrador): desbloquea, cierra sesiones, el PIN viejo deja de servir
  for (let i = 0; i < 5; i++) await u.authenticate("ana", "999999", T0);
  assert.equal((await u.authenticate("ana", "246810", T0)).ok, false); // bloqueada
  const sAna2 = u.createSession(ana.id, T0);
  await assert.rejects(u.resetPin(ana.id, "12"));
  await u.resetPin(ana.id, "112233");
  assert.equal(u.userFromToken(sAna2.token, T0), null); // sesiones cerradas
  assert.equal((await u.authenticate("ana", "246810", T0)).ok, false); // el PIN viejo ya no sirve
  assert.equal((await u.authenticate("ana", "112233", T0)).ok, true); // y la cuenta quedó desbloqueada

  // ---- Cambiar el propio PIN: exige el actual y conserva solo la sesión actual
  const keep = u.createSession(ana.id, T0);
  const other = u.createSession(ana.id, T0);
  await assert.rejects(u.changeOwnPin(ana.id, "000000", "445566", keep.token)); // PIN actual incorrecto
  await assert.rejects(u.changeOwnPin(ana.id, "112233", "44", keep.token)); // PIN nuevo inválido
  await u.changeOwnPin(ana.id, "112233", "445566", keep.token);
  assert.equal(u.userFromToken(keep.token, T0)?.username, "ana"); // la actual sigue
  assert.equal(u.userFromToken(other.token, T0), null); // las demás se cerraron
  assert.equal((await u.authenticate("ana", "445566", T0)).ok, true);

  // ---- Correo de Google: solo entra quien el admin autorizó
  assert.equal(u.userByEmail("ana@gmail.com"), null); // nadie autorizado todavía
  await assert.rejects(async () => u.setUserEmail(ana.id, "no-es-correo"));
  u.setUserEmail(ana.id, "  Ana@Gmail.COM ");
  assert.equal(u.userByEmail("ANA@gmail.com")?.username, "ana"); // sin distinguir mayúsculas
  assert.equal(u.userByEmail("otra@gmail.com"), null); // correo no autorizado
  assert.equal(u.userByEmail(""), null);
  await assert.rejects(async () => u.setUserEmail(admin.id, "ana@gmail.com")); // un correo, una cuenta
  u.setUserEmail(ana.id, "ana@gmail.com"); // volver a guardar el suyo no es conflicto
  u.setUserActive(ana.id, false);
  assert.equal(u.userByEmail("ana@gmail.com"), null); // desactivada: no entra por Google
  u.setUserActive(ana.id, true);
  u.setUserEmail(ana.id, ""); // quitar el correo
  assert.equal(u.userByEmail("ana@gmail.com"), null);
  await assert.rejects(u.createUser({ username: "luis", name: "Luis", pin: "135790", email: "mal" }));
  const luis = await u.createUser({ username: "luis", name: "Luis", pin: "135790", email: "Luis@Gmail.com" });
  assert.equal(u.userByEmail("luis@gmail.com")?.id, luis.id);

  console.log("users OK");
}
main();
