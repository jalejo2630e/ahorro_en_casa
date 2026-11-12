import { ImageResponse } from "next/og";

const SIZES = [180, 192, 512];

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const px = Number(size);
  if (!SIZES.includes(px)) return new Response("Not found", { status: 404 });

  // Fondo completo (sin esquinas transparentes) y contenido dentro de la zona segura "maskable" (80%)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
          color: "white",
          fontSize: px * 0.5,
          fontWeight: 700,
        }}
      >
        $
      </div>
    ),
    { width: px, height: px },
  );
}
