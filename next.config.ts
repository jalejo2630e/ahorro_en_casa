import type { NextConfig } from "next";

// Dirección pública de la app (p. ej. https://mi-pc.tailXXXX.ts.net con Tailscale). Se autoriza para que los
// formularios (Server Actions) y el servidor de desarrollo acepten peticiones que llegan con ese nombre.
function publicHost(): { host: string; hostname: string } | null {
  try {
    const u = new URL(process.env.APP_URL ?? "");
    return u.hostname === "localhost" ? null : { host: u.host, hostname: u.hostname };
  } catch {
    return null;
  }
}
const pub = publicHost();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  ...(pub ? { allowedDevOrigins: [pub.hostname] } : {}),
  ...(pub ? { experimental: { serverActions: { allowedOrigins: [pub.host] } } } : {}),
  async redirects() {
    return [
      { source: "/calendario", destination: "/pagos", permanent: false },
      { source: "/registrar", destination: "/gastos", permanent: false },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
