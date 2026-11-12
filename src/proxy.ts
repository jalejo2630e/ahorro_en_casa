import { NextResponse, type NextRequest } from "next/server";

// Revisión RÁPIDA y optimista: sin cookie de sesión, todo va a /login. NO valida la sesión (eso exigiría
// consultar la base en cada petición, incluidas las precargas): la validación real está en requireUser(),
// que cada página y cada Server Action ejecutan.
const SESSION_COOKIE = "ahorro_session";

// Públicas: pantallas de acceso y lo que el navegador pide SIN cookie (manifest e íconos de la PWA).
const PUBLIC_PATHS = new Set(["/login", "/setup", "/manifest.webmanifest"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/icons/")) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // /api/mcp tiene su propia autenticación (token Bearer + solo localhost); los estáticos de Next quedan fuera.
  matcher: ["/((?!api/mcp|_next/static|_next/image|favicon.ico).*)"],
};
