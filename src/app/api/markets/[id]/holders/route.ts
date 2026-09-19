import { NextResponse } from "next/server";
import { fetchPolymarketHolders, fetchPolymarketMarket } from "@/lib/polymarket";

export const revalidate = 20;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const market = await fetchPolymarketMarket(id);
    if (!market?.conditionId) {
      return NextResponse.json({ source: "polymarket", holders: [], marketId: id });
    }
    const holders = await fetchPolymarketHolders(market.conditionId, 20);
    return NextResponse.json({ source: "polymarket", marketId: market.id, holders });
  } catch (error) {
    return NextResponse.json(
      {
        source: "error",
        marketId: id,
        holders: [],
        error: error instanceof Error ? error.message : "Polymarket holders unavailable",
      },
      { status: 502 },
    );
  }
}
