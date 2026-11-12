import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SetupForm } from "@/components/auth-forms";
import { getCurrentUser, isLocalRequest } from "@/lib/auth";
import { countUsers } from "@/lib/users";

export const metadata = { title: "Configurar · Ahorro en casa" };

export default function SetupPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  await connection();
  // Con usuarios ya creados, esta pantalla no sirve: el registro nunca es abierto.
  if (countUsers() > 0) redirect((await getCurrentUser()) ? "/" : "/login");
  const local = await isLocalRequest();

  return (
    <div className="mx-auto mt-10 w-full max-w-sm space-y-6 md:mt-24">
      <header className="text-center">
        <p className="text-3xl font-bold text-emerald-600">Ahorro en casa</p>
        <h1 className="mt-1 text-sm text-slate-500">Primera vez: crea al administrador</h1>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {local ? (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Será quien cree a los demás usuarios. Tus datos actuales quedan tal cual: todo el hogar comparte las mismas finanzas.
            </p>
            <SetupForm />
          </>
        ) : (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            El primer administrador solo se puede crear desde la PC donde corre la app, abriendo{" "}
            <strong>http://localhost:3000</strong>. Hazlo desde allí y luego entra desde tu celular.
          </p>
        )}
      </section>
    </div>
  );
}
