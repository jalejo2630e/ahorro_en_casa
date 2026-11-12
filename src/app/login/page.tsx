import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/users";

export const metadata = { title: "Entrar · Ahorro en casa" };

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  await connection();
  if (await getCurrentUser()) redirect("/");
  if (countUsers() === 0) redirect("/setup"); // primera vez: no hay usuarios todavía

  return (
    <div className="mx-auto mt-10 w-full max-w-sm space-y-6 md:mt-24">
      <header className="text-center">
        <p className="text-3xl font-bold text-emerald-600">Ahorro en casa</p>
        <h1 className="mt-1 text-sm text-slate-500">Entra con tu usuario y tu PIN</h1>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <LoginForm />
      </section>
    </div>
  );
}
