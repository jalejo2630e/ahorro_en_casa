import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { exportMovements } from "@/lib/finance";

/** Descarga los movimientos de un año (?anio=2026) o de un mes (?mes=2026-11) en CSV. Solo con sesión. */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });

  const p = request.nextUrl.searchParams;
  const mes = p.get("mes");
  const anio = p.get("anio");
  const prefix = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : anio && /^\d{4}$/.test(anio) ? anio : null;
  if (!prefix) return NextResponse.json({ error: "Usa ?anio=AAAA o ?mes=AAAA-MM" }, { status: 400 });

  const rows = exportMovements(prefix).map((r) => [r.date, r.kind, r.concept, r.category, r.amount, r.by]);
  return new Response(toCsv(["Fecha", "Tipo", "Concepto", "Categoría", "Monto (COP)", "Registrado por"], rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ahorro-en-casa-${prefix}.csv"`,
      "cache-control": "no-store",
    },
  });
}
