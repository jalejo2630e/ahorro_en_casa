import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { countUsers } from "@/lib/users";

export const metadata = { title: "Entrar · Ahorro en casa" };

const ERRORS: Record<string, string> = {
  google_unauthorized: "Ese correo no tiene acceso. Pídele al administrador que lo autorice en Cuenta.",
  google_denied: "Cancelaste el inicio de sesión con Google.",
  google_failed: "No se pudo entrar con Google. Inténtalo de nuevo.",
  google_off: "El acceso con Google no está configurado.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  if (await getCurrentUser()) redirect("/");
  if (countUsers() === 0) redirect("/setup"); // primera vez: no hay usuarios todavía

  const google = googleConfig() !== null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  return (
    <div className="mx-auto mt-10 w-full max-w-sm space-y-6 md:mt-24">
      <header className="text-center">
        <p className="text-3xl font-bold text-emerald-600">Ahorro en casa</p>
        <h1 className="mt-1 text-sm text-slate-500">
          {google ? "Entra con Google o con tu usuario y PIN" : "Entra con tu usuario y tu PIN"}
        </h1>
      </header>
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        {google && (
          <>
            {/* Enlace normal (no fetch): el navegador debe seguir la redirección a Google */}
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
              </svg>
              Continuar con Google
            </a>
            <p className="text-center text-xs text-slate-500">— o con tu PIN —</p>
          </>
        )}
        <LoginForm />
      </section>
    </div>
  );
}
