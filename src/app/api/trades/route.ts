import { NextResponse } from "next/server";
import { fetchPolymarketMarket, fetchPolymarketTrades } from "@/lib/polymarket";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "24", 10);
    const marketId = url.searchParams.get("marketId") ?? undefined;
    const user = url.searchParams.get("user") ?? url.searchParams.get("walletAddress") ?? undefined;
    let conditionId = url.searchParams.get("conditionId") ?? undefined;
    if (marketId && !conditionId) {
      const live = await fetchPolymarketMarket(marketId).catch(() => null);
      conditionId = live?.conditionId ?? undefined;
    }
    const trades = await fetchPolymarketTrades({
      limit: Number.isFinite(limit) ? limit : 24,
      marketId,
      conditionId,
      user,
    });
    return NextResponse.json({ source: "polymarket", trades });
  } catch (error) {
    return NextResponse.json(
      {
        source: "error",
        trades: [],
        error: error instanceof Error ? error.message : "Polymarket trades unavailable",
      },
      { status: 502 },
    );
  }
}
