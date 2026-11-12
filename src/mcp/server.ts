import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addExpense, getBudget, getExpensesByCategory, getSavingsGoal, getSummary, listCategories,
  monthOf, toISO, upcomingPayments,
} from "@/lib/finance";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato YYYY-MM");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

/** Todos los montos son pesos colombianos (COP) enteros. */
export function createMcpServer() {
  const server = new McpServer({ name: "ahorro-en-casa", version: "0.1.0" });

  server.registerTool(
    "consultar_estado_financiero",
    {
      title: "Estado financiero del mes",
      description:
        "Resumen del mes: ingresos (esperado y recibido), pagos obligatorios, gastos diarios, tasa de ahorro (0-1), margen libre, presupuesto de gastos diarios y gastos por categoría. Montos en COP.",
      inputSchema: { mes: monthSchema.optional().describe("Mes YYYY-MM. Por defecto, el mes actual.") },
      annotations: { readOnlyHint: true },
    },
    async ({ mes }) => {
      const today = toISO(new Date());
      const month = mes ?? monthOf(today);
      const b = getBudget(month, today);
      return ok({
        ...getSummary(month, today),
        presupuestoGastosDiarios: {
          presupuestoMes: b.budget, dineroExtraRecibido: b.extra, gastadoEnElMes: b.spent,
          quedaEnElMes: b.remaining, porcentajeUsado: b.usedPct, diasRestantes: b.daysLeft,
          asignacionDiariaBase: b.dailyAllowance,
          // Lo que puede gastar HOY sin tocar el ahorro (acumula lo no gastado; negativo si se pasó)
          disponibleHoy: b.availableToday, veniaDeDiasAnteriores: b.carried,
          gastandoDelAhorro: b.eatingIntoSavings,
        },
        gastosPorCategoria: getExpensesByCategory(month),
      });
    },
  );

  server.registerTool(
    "registrar_gasto",
    {
      title: "Registrar un gasto",
      description:
        "Registra un gasto DIARIO (no un pago obligatorio) y lo descuenta del bolsillo 'Gastos del mes'. El monto es un entero positivo en COP.",
      inputSchema: {
        concepto: z.string().trim().min(1).max(120),
        monto: z.number().int().positive().describe("Monto en COP, sin decimales"),
        categoria: z.string().max(60).optional().describe("Nombre de categoría existente (ver descripción)"),
        fecha: dateSchema.optional().describe("YYYY-MM-DD. Por defecto, hoy."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ concepto, monto, categoria, fecha }) => {
      const valid = listCategories().map((c) => c.name);
      if (categoria && !valid.includes(categoria)) {
        return fail(`Categoría desconocida "${categoria}". Válidas: ${valid.join(", ")}`);
      }
      const t = addExpense(
        { concept: concepto, amount: monto, category: categoria, date: fecha ?? toISO(new Date()) },
        "mcp",
      );
      return ok({ registrado: true, id: t.id, concepto: t.concept, monto: t.amount, fecha: t.date });
    },
  );

  server.registerTool(
    "ver_pagos_proximos",
    {
      title: "Pagos próximos",
      description:
        "Obligaciones sin pagar que vencen en los próximos N días, incluyendo las ya vencidas. Estado: pendiente o urgente.",
      inputSchema: { dias: z.number().int().min(0).max(60).default(7) },
      annotations: { readOnlyHint: true },
    },
    async ({ dias }) => {
      const today = toISO(new Date());
      return ok(
        upcomingPayments(dias, today).map((p) => ({
          id: p.id, nombre: p.name, monto: p.amount, vence: p.due,
          diasRestantes: p.daysLeft, estado: p.status, categoria: p.category,
        })),
      );
    },
  );

  server.registerTool(
    "verificar_meta_ahorro",
    {
      title: "Meta de ahorro",
      description:
        "Progreso del reto de ahorro: ahorrado, meta mensual y anual, porcentaje cumplido y medalla (oro/plata/bronce/ninguna).",
      annotations: { readOnlyHint: true },
    },
    async () => ok(getSavingsGoal(monthOf(toISO(new Date())))),
  );

  return server;
}
