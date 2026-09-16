import { NextResponse } from "next/server";
import { fetchPolymarketTrades } from "@/lib/polymarket";

export const revalidate = 8;

export async function GET() {
  try {
    const trades = await fetchPolymarketTrades(24);
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
