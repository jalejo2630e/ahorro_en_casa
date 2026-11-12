This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Servidor MCP (para asistentes de IA)

La app expone un servidor MCP en `http://localhost:3000/api/mcp` (HTTP, sin sesiones).

1. Crea `.env.local` con un token de al menos 24 caracteres:
   `MCP_TOKEN=<valor aleatorio>` (por ejemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Exporta la misma variable `MCP_TOKEN` en el entorno del cliente MCP y usa [.mcp.json](.mcp.json).
3. Solo acepta peticiones con `Authorization: Bearer <token>` y desde `localhost`.

Herramientas de consulta: `consultar_estado_financiero`, `ver_pagos_proximos`, `ver_ingresos_esperados`, `verificar_meta_ahorro`.

Herramientas que escriben (solo agregan o marcan; **ninguna borra ni deshace** — los errores se corrigen desde la app):
`registrar_gasto`, `registrar_dinero_extra`, `marcar_pago_pagado` y `marcar_ingreso_recibido` (las dos últimas aceptan el monto real).
Todo lo registrado por MCP queda con origen `mcp`.

## Base de datos (SQLite en `data/`, no se sube a git)

- `npm run db:push` crea o actualiza las tablas **con red de seguridad**: respalda antes, compara filas después y avisa si algo se perdió.
- `npm run db:backup` hace un respaldo consistente en `data/backups/` (conserva los 20 últimos).
- `npm run db:seed` carga datos de ejemplo; `npm run db:import` carga tus finanzas desde `data/finanzas.json`.

**Cuidado con los cambios de esquema.** `drizzle-kit push` reconstruye una tabla SQLite (y puede perder filas) si el orden de
columnas de `src/db/schema.ts` no coincide con la base. Reglas: (1) las columnas nuevas van **siempre al final** de la tabla;
(2) en una base con datos reales, lo más seguro es un `ALTER TABLE ... ADD COLUMN` manual; (3) nunca uses `--force` sobre tus datos reales.
