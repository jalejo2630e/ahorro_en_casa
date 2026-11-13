import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryRow, NewCategoryForm } from "@/components/category-forms";
import { requireUser } from "@/lib/auth";
import { listCategoriesWithUsage } from "@/lib/finance";

export const metadata = { title: "Categorías · Ahorro en casa" };

const card = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando categorías…</p>}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await connection();
  await requireUser();
  const list = listCategoriesWithUsage();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Categorías</h1>
        <p className="text-sm text-slate-500">
          Las usas al registrar un gasto o crear un pago. Puedes crear las tuyas, cambiarles el nombre o el color.{" "}
          <Link href="/gastos" className="underline">Volver a Gastos</Link>
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-5">
        <section className={`${card} md:col-span-3`} aria-label="Tus categorías">
          <h2 className="mb-1 font-semibold">Tus categorías</h2>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aún no tienes categorías. Crea la primera.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((c) => (
                <CategoryRow key={c.id} id={c.id} name={c.name} color={c.color} expenses={c.expenses} payments={c.payments} />
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} md:col-span-2`} aria-label="Nueva categoría">
          <h2 className="mb-3 font-semibold">Nueva categoría</h2>
          <NewCategoryForm />
        </section>
      </div>
    </div>
  );
}
