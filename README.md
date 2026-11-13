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

## Acceso y usuarios

La app pide usuario y PIN de 6 dígitos. Todos los usuarios comparten las mismas finanzas del hogar; cada movimiento
queda con el nombre de quien lo registró (los del asistente MCP aparecen como "Asistente").

- **Primer uso:** abre `http://localhost:3000/setup` **desde la PC donde corre la app** y crea al administrador. Desde otra
  dirección (p. ej. el celular) la pantalla se niega: así nadie de tu red se adueña de la app antes que tú.
- **Más usuarios:** solo el administrador, en la pestaña **Cuenta** (crear, desactivar, restablecer PIN). No hay registro abierto.
- **Seguridad:** el PIN se guarda solo como hash (scrypt); la sesión es una cookie `HttpOnly` y en la base queda únicamente el
  hash del token; tras 5 PIN incorrectos la cuenta se bloquea 15 minutos (el administrador puede desbloquearla restableciendo el PIN).
  El `proxy` solo hace una revisión rápida de la cookie; la verificación real se hace en cada página y en cada Server Action.
- **Entrar con Google (opcional):** el botón "Continuar con Google" aparece si defines en `.env.local`
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL` (la dirección con la que abres la app, p. ej. `http://localhost:3000`
  o `https://mi-pc.tailXXXX.ts.net`). En Google Cloud Console crea un "ID de cliente OAuth" de tipo *Aplicación web* y registra como
  URI de redirección `<APP_URL>/api/auth/google/callback`. Google solo identifica a la persona: entra **solo quien tenga su correo
  autorizado** por el administrador en Cuenta (no se crean cuentas solas). Google no acepta IP privadas (192.168.x.x) como redirección.
- **HTTPS:** si sirves la app por HTTPS (p. ej. con Tailscale), pon `COOKIE_SECURE=true` en `.env.local` para marcar la cookie como `Secure`.
- El servidor MCP no usa este login: tiene su propio token y solo acepta conexiones desde localhost.
- Límite conocido: el bloqueo es por usuario (no por IP); alguien que conozca un usuario podría bloquearlo a propósito durante 15 min.

## Base de datos (SQLite en `data/`, no se sube a git)

- `npm run db:push` crea o actualiza las tablas **con red de seguridad**: respalda antes, compara filas después y avisa si algo se perdió.
- `npm run db:backup` hace un respaldo consistente en `AppData/Local/AhorroEnCasa/respaldos` (disco local, fuera de OneDrive; se cambia con `BACKUP_DIR`) (conserva los 20 últimos).
- `npm run db:seed` carga datos de ejemplo; `npm run db:import` carga tus finanzas desde `data/finanzas.json`.
  Los pagos se identifican por su nombre original (columna `import_key`), así que si renombras un pago en la app,
  importar de nuevo **no** lo duplica ni te cambia el nombre.

## Cuánto puedes gastar hoy

Libre del mes = ingresos − pagos obligatorios (**sin** descontar la meta de ahorro) + dinero extra − gastos diarios.
Hoy puedes gastar = libre al empezar el día ÷ días que quedan del mes (contando hoy) − lo gastado hoy.
Se recalcula solo al pagar, recibir dinero o registrar gastos: lo que no gastas se reparte entre los días que quedan y lo que te pasas lo reduce.

**Cuidado con los cambios de esquema.** `drizzle-kit push` reconstruye una tabla SQLite (y puede perder filas) si el orden de
columnas de `src/db/schema.ts` no coincide con la base. Reglas: (1) las columnas nuevas van **siempre al final** de la tabla;
(2) en una base con datos reales, lo más seguro es un `ALTER TABLE ... ADD COLUMN` manual; (3) nunca uses `--force` sobre tus datos reales.

## Ahorro

La pestaña **Ahorro** registra lo que realmente guardaste (monto + fecha, o "ya guardé la meta completa") y muestra el avance de la
meta de cada mes, la medalla y el año. Lo ahorrado cuenta en el mes de su fecha y deja de ser dinero libre para gastar; la meta
en sí no se descuenta. El MCP tiene la herramienta `registrar_ahorro` (agrega, no borra).

## Usar la app desde el celular (Tailscale + HTTPS)

1. Instala **Tailscale** en la PC y en el celular, e inicia sesión con la misma cuenta.
2. En la consola de Tailscale (login.tailscale.com → *DNS*) activa **MagicDNS** y **HTTPS Certificates**.
3. En la PC: `npm run build`, luego `npm start` (la app queda en el puerto 3000), y en otra terminal `tailscale serve --bg 3000`.
   Tailscale muestra tu dirección: `https://<nombre-pc>.<tu-red>.ts.net`.
4. En `.env.local`: `APP_URL=https://<nombre-pc>.<tu-red>.ts.net` y `COOKIE_SECURE=true`. Reinicia la app.
5. En Google Cloud Console, en tu ID de cliente OAuth, agrega como URI de redirección `<APP_URL>/api/auth/google/callback`.
6. En el celular abre esa dirección; ya puedes entrar con Google o con tu PIN, e "Instalar" la app. La PC debe estar encendida.

`APP_URL` también autoriza ese nombre para los formularios (Server Actions) en `next.config.ts`.

## Que arranque sola, reiniciar y respaldos

- **Arranque automático (Windows):** `iniciar-app.cmd` arranca la app (modo producción) si no está corriendo. Una copia de llamada
  vive en la carpeta de inicio de Windows (`shell:startup` → `AhorroEnCasa.cmd`), así que la app sube sola al iniciar sesión.
  Tailscale conserva la publicación (`tailscale serve --bg 3000`) tras reiniciar.
- **Después de cambiar código:** ejecuta `reiniciar-app.cmd` (detiene la app, recompila y vuelve a arrancar).
- **Respaldo automático:** al arrancar y cada pocas horas, si el último respaldo tiene más de ~20 h, se crea uno en `AppData/Local/AhorroEnCasa/respaldos` (disco local, fuera de OneDrive; se cambia con `BACKUP_DIR`)
  (se conservan los 30 últimos). `npm run db:backup` sigue haciendo uno a mano.
- **Exportar:** en **Año**, "Descargar los movimientos" baja un CSV (Excel) con ingresos, gastos, pagos y ahorros del año
  (`/api/export?anio=AAAA` o `?mes=AAAA-MM`).
- **Pagos:** en **Pagos** puedes agregar uno ("+ Agregar un pago"), editarlo (✎) y quitarlo desde el mes que ves; lo que ya
  pagaste en meses anteriores se conserva. Los ingresos programados también se editan con ✎.

## Categorías propias

En **Gastos → "Crea o edita las tuyas"** (`/categorias`) puedes crear categorías con nombre y color, renombrarlas y borrarlas.
Al borrar una, sus gastos y pagos no se pierden: quedan "Sin categoría". Aparecen en el formulario de gastos, en Pagos y en la
gráfica de gastos por categoría (el asistente MCP también las ve).

## Avisos de pagos en el celular

- **Activar:** en **Cuenta → "Avisos de pagos en el celular"** toca "Activar avisos en este celular" y acepta el permiso. Hay un botón
  de aviso de prueba. En iPhone la app debe estar instalada (Safari → Compartir → "Agregar a inicio") y abrirse desde su ícono.
- **Qué manda:** un aviso al día, a partir de las 8 a. m., con los pagos sin pagar que vencen hoy, mañana o ya vencieron. Si no hay,
  no manda nada. Funciona con la app cerrada (el aviso lo entrega Google/Apple); al tocarlo se abre Pagos (necesita Tailscale activo).
- **Claves:** `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en `.env.local` (no las compartas ni las subas). Si cambias de claves,
  cada celular debe volver a activar los avisos.

## Dónde vive la base

`DATABASE_PATH` en `.env.local` apunta a `AppData/Local/AhorroEnCasa/ahorro.db` (disco local), **fuera de OneDrive**, para que
OneDrive no sincronice un archivo SQLite que está en uso. Los scripts (`db:push`, `db:backup`…) leen la misma variable.
La copia anterior quedó en `AppData/Local/AhorroEnCasa/respaldos/base-anterior-en-OneDrive/` (puedes borrarla cuando quieras).
