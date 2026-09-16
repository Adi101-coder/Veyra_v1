import { NextResponse } from "next/server";
import { fetchPolymarketMarkets } from "@/lib/polymarket";
import { coreMarkets } from "@/lib/markets";

export const revalidate = 45;

export async function GET() {
  try {
    const markets = await fetchPolymarketMarkets(40);
    if (!markets.length) {
      return NextResponse.json({ source: "local", markets: coreMarkets });
    }
    return NextResponse.json({ source: "polymarket", markets });
  } catch (error) {
    return NextResponse.json({
      source: "local",
      markets: coreMarkets,
      error: error instanceof Error ? error.message : "Polymarket unavailable",
    });
  }
}
