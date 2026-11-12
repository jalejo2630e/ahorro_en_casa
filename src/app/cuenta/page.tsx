import { connection } from "next/server";
import { Suspense } from "react";
import { logoutAction } from "@/app/auth-actions";
import { ChangePinForm, CreateUserForm, ResetPinForm, ToggleActiveForm } from "@/components/auth-forms";
import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const metadata = { title: "Cuenta · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando tu cuenta…</p>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection();
  const me = await requireUser();
  const people = me.role === "admin" ? listUsers() : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hola, {me.name}</h1>
          <p className="text-sm text-slate-500">
            Usuario <strong>{me.username}</strong> · {me.role === "admin" ? "Administrador" : "Miembro"}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Salir
          </button>
        </form>
      </header>

      <section className={card} aria-label="Cambiar PIN">
        <h2 className="mb-3 font-semibold">Cambiar mi PIN</h2>
        <div className="max-w-sm">
          <ChangePinForm />
        </div>
      </section>

      {me.role === "admin" && (
        <>
          <section className={card} aria-label="Usuarios">
            <h2 className="mb-1 font-semibold">Usuarios</h2>
            <p className="mb-2 text-xs text-slate-500">
              Todos comparten las mismas finanzas; cada movimiento queda con el nombre de quien lo registró.
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {people.map((p) => {
                const locked = p.locked;
                return (
                  <li key={p.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {p.name} <span className="text-xs font-normal text-slate-500">({p.username})</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.role === "admin" ? "Administrador" : "Miembro"}
                          {!p.active && " · desactivado"}
                          {locked && " · bloqueado por intentos fallidos"}
                        </p>
                      </div>
                      {p.id !== me.id && <ToggleActiveForm userId={p.id} name={p.name} active={p.active} />}
                    </div>
                    <ResetPinForm userId={p.id} name={p.name} />
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={card} aria-label="Crear usuario">
            <h2 className="mb-3 font-semibold">Crear usuario</h2>
            <div className="max-w-md">
              <CreateUserForm />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
