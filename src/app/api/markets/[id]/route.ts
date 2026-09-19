import { NextResponse } from "next/server";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import { getMarket } from "@/lib/markets";

export const revalidate = 45;
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  // Only ids that exist in the static catalog resolve to demo data.
  const local = getMarket(id);
  if (local) return NextResponse.json({ source: "local", market: local });
  // Veyra-native pools are database rows, not catalog entries, so the lookup above
  // misses them and they would 404 here.
  const { getPoolMarket } = await import("@/server/voting/pool");
  const pool = await getPoolMarket(id).catch(() => null);
  if (pool) return NextResponse.json({ source: "veyra", market: pool });
  try {
    const live = await fetchPolymarketMarket(id);
    if (!live) return NextResponse.json({ source: "polymarket", market: null }, { status: 404 });
    return NextResponse.json({ source: "polymarket", market: live });
  } catch (error) {
    return NextResponse.json(
      {
        source: "polymarket",
        market: null,
        error: error instanceof Error ? error.message : "Polymarket unavailable",
      },
      { status: 502 },
    );
  }
}
