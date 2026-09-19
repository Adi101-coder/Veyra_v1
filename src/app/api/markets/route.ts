import { NextResponse } from "next/server";
import { fetchPolymarketMarkets } from "@/lib/polymarket";
import { coreMarkets, type CategoryId } from "@/lib/markets";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set<CategoryId>([
  "politics",
  "finance",
  "crypto",
  "sports",
  "entertainment",
  "science",
  "culture",
  "weather",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "80", 10);
  const category = url.searchParams.get("category");
  try {
    let markets = await fetchPolymarketMarkets(Number.isFinite(limit) ? Math.min(120, Math.max(8, limit)) : 80);
    if (category && CATEGORIES.has(category as CategoryId)) {
      markets = markets.filter((market) => market.category === category);
    }
    if (!markets.length) {
      return NextResponse.json({
        source: "local",
        markets: coreMarkets,
        error: "Polymarket returned no markets",
      });
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
