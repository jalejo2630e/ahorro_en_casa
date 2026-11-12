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

Herramientas: `consultar_estado_financiero`, `registrar_gasto`, `ver_pagos_proximos`, `verificar_meta_ahorro`.

Base de datos: `npm run db:push` crea las tablas y `npm run db:seed` carga datos de ejemplo.
