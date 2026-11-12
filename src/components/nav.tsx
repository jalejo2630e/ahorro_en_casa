"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Inicio", icon: "◧" },
  { href: "/calendario", label: "Calendario", icon: "▦" },
  { href: "/anual", label: "Año", icon: "▤" },
  { href: "/registrar", label: "Registrar", icon: "＋" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:static md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-t-0 md:border-r md:p-4"
    >
      <p className="hidden px-3 pb-4 text-lg font-bold text-emerald-600 md:block">Ahorro en casa</p>
      {ITEMS.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium md:flex-none md:flex-row md:gap-3 md:rounded-lg md:px-3 md:text-sm ${
              active
                ? "text-emerald-600 md:bg-emerald-50 dark:md:bg-emerald-950"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            <span aria-hidden className="text-lg md:text-base">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
