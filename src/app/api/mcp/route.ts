import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorize } from "@/mcp/auth";
import { createMcpServer } from "@/mcp/server";

// Modo sin sesiones: cada petición crea su propio servidor y transporte.
async function handle(req: Request): Promise<Response> {
  const denied = authorize(req);
  if (denied) return denied;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
