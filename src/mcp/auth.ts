import { timingSafeEqual } from "node:crypto";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Devuelve una Response de error si la petición no está autorizada; null si todo bien. */
export function authorize(req: Request): Response | null {
  const expected = process.env.MCP_TOKEN;
  if (!expected || expected.length < 24) {
    return json(503, "MCP deshabilitado: define MCP_TOKEN (mínimo 24 caracteres) en .env.local");
  }

  // Aislamiento local: protege contra DNS rebinding y accesos desde la red
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!LOCAL_HOSTS.has(host) && process.env.MCP_ALLOW_REMOTE !== "true") {
    return json(403, "Solo se acepta acceso desde localhost");
  }

  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json(401, "Token inválido");
  }
  return null;
}

function json(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...(status === 401 ? { "www-authenticate": "Bearer" } : {}) },
  });
}
