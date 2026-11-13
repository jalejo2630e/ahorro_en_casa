import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addExpense, addExtraIncome, getBudget, getExpensesByCategory, getIncomePlan, getPayments, getSavingsGoal,
  getSummary, isBeforeStart, listCategories, markIncomeReceived, markPaid, monthOf, toISO, upcomingPayments,
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
          // Lo libre = ingresos − pagos obligatorios (sin descontar la meta de ahorro) + extra − gastos diarios
          promedioPorDiaDeLoQueQueda: b.dailyAllowance,
          // Lo que puede gastar HOY = lo libre del mes ÷ días que quedan (contando hoy) − lo ya gastado hoy; negativo si se pasó
          disponibleHoy: b.availableToday, libreAlEmpezarHoy: b.freeAtStartOfToday,
          gastoMasDeLoLibre: b.overspent,
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

  // ---------- Escritura segura ----------
  // Las herramientas que cambian datos solo AGREGAN o MARCAN. No hay ninguna que borre o deshaga:
  // si la IA se equivoca, el usuario lo corrige desde la app (botones "Deshacer" / ✕).

  server.registerTool(
    "marcar_pago_pagado",
    {
      title: "Marcar un pago obligatorio como pagado",
      description:
        "Marca como pagada una obligación del mes (arriendo, servicios, cuotas…). Usa 'ver_pagos_proximos' para obtener el id. " +
        "Si se paga un monto distinto al programado (p. ej. la luz llegó más cara), pásalo en 'monto'. Es idempotente: marcar dos veces no duplica el gasto.",
      inputSchema: {
        pago_id: z.number().int().positive().describe("id del pago (de ver_pagos_proximos)"),
        mes: monthSchema.optional().describe("Mes YYYY-MM al que pertenece el pago. Por defecto, el mes actual."),
        monto: z.number().int().positive().optional().describe("Monto realmente pagado en COP. Vacío = el programado."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ pago_id, mes, monto }) => {
      try {
        const today = toISO(new Date());
        const month = mes ?? monthOf(today);
        if (isBeforeStart(month, today)) return fail(`${month} es anterior a la fecha de inicio: no se llevan pagos en ese mes.`);
        const item = getPayments(month, today).find((p) => p.id === pago_id);
        if (!item) return fail(`No existe el pago ${pago_id} en ${month}. Consulta los ids con ver_pagos_proximos.`);
        const r = markPaid(pago_id, month, today, "mcp", monto); // sin userId: queda como "Asistente"
        const after = getPayments(month, today).find((p) => p.id === pago_id)!;
        return ok({
          pago: item.name, mes: month, yaEstabaPagado: r.alreadyPaid,
          montoProgramado: after.amount, montoPagado: after.effectiveAmount,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "No se pudo marcar el pago");
      }
    },
  );

  server.registerTool(
    "ver_ingresos_esperados",
    {
      title: "Ingresos esperados del mes",
      description:
        "Lista los pagos de ingresos programados del mes (sueldos, domingos…) con su estado: recibido, pendiente o atrasado. " +
        "Devuelve 'ingreso_id' y 'fecha_esperada' para usar con marcar_ingreso_recibido.",
      inputSchema: { mes: monthSchema.optional().describe("Mes YYYY-MM. Por defecto, el mes actual.") },
      annotations: { readOnlyHint: true },
    },
    async ({ mes }) => {
      const today = toISO(new Date());
      const month = mes ?? monthOf(today);
      return ok(
        getIncomePlan(month, today).map((r) => ({
          ingreso_id: r.scheduleId, nombre: r.name, montoProgramado: r.amount,
          // Los ingresos mensuales sin día fijo usan AAAA-MM-00
          fecha_esperada: r.key, estado: r.status,
        })),
      );
    },
  );

  server.registerTool(
    "marcar_ingreso_recibido",
    {
      title: "Marcar un ingreso esperado como recibido",
      description:
        "Marca como recibido un pago de ingreso programado. Usa 'ver_ingresos_esperados' para obtener ingreso_id y fecha_esperada. " +
        "Si llegó un monto distinto al programado, pásalo en 'monto'. Cuenta en el mes de la fecha esperada. Es idempotente.",
      inputSchema: {
        ingreso_id: z.number().int().positive(),
        fecha_esperada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").describe("La 'fecha_esperada' que devuelve ver_ingresos_esperados"),
        monto: z.number().int().positive().optional().describe("Monto realmente recibido en COP. Vacío = el programado."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ ingreso_id, fecha_esperada, monto }) => {
      try {
        const today = toISO(new Date());
        const month = fecha_esperada.slice(0, 7);
        if (isBeforeStart(month, today)) return fail(`${month} es anterior a la fecha de inicio: no se llevan ingresos en ese mes.`);
        const row = getIncomePlan(month, today).find((r) => r.scheduleId === ingreso_id && r.key === fecha_esperada);
        if (!row) return fail(`No hay un ingreso ${ingreso_id} esperado el ${fecha_esperada}. Consulta ver_ingresos_esperados.`);
        const r = markIncomeReceived(ingreso_id, fecha_esperada, today, "mcp", monto);
        return ok({
          ingreso: row.name, fechaEsperada: fecha_esperada, yaEstabaRecibido: r.alreadyReceived,
          montoProgramado: row.amount, montoRecibido: r.alreadyReceived ? row.amount : (monto ?? row.amount),
          ...(r.alreadyReceived ? {} : { apartadoAlAhorro: r.saved }),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "No se pudo marcar el ingreso");
      }
    },
  );

  server.registerTool(
    "registrar_dinero_extra",
    {
      title: "Registrar dinero extra recibido",
      description:
        "Registra dinero que NO es un sueldo ni un ingreso programado (un regalo, una devolución…). Suma a lo que el usuario puede gastar " +
        "hoy en gastos diarios; no cuenta como ingreso del mes ni se aparta al ahorro.",
      inputSchema: {
        concepto: z.string().trim().min(1).max(120).describe("De dónde viene, p. ej. 'Regalo de mamá'"),
        monto: z.number().int().positive().describe("Monto en COP, sin decimales"),
        fecha: dateSchema.optional().describe("YYYY-MM-DD. Por defecto, hoy."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ concepto, monto, fecha }) => {
      try {
        const t = addExtraIncome({ concept: concepto, amount: monto, date: fecha ?? toISO(new Date()) }, "mcp");
        return ok({ registrado: true, id: t.id, concepto: t.concept, monto: t.amount, fecha: t.date });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "No se pudo registrar");
      }
    },
  );

  return server;
}
