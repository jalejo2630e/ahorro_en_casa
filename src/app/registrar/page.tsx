import { Suspense } from "react";
import { connection } from "next/server";
import { ExpenseForm, IncomeForm } from "@/components/forms";
import { listCategories } from "@/lib/finance";

export const metadata = { title: "Registrar · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Registrar movimiento</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-semibold">Gasto</h2>
          <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
            <Expense />
          </Suspense>
        </section>
        <section className={card}>
          <h2 className="mb-3 font-semibold">Ingreso</h2>
          <IncomeForm />
        </section>
      </div>
    </div>
  );
}

async function Expense() {
  await connection();
  return <ExpenseForm categories={listCategories().map((c) => c.name)} />;
}
