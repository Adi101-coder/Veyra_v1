import { NextResponse } from "next/server";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import { getMarket } from "@/lib/markets";

export const revalidate = 45;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const local = getMarket(id);
  if (local) return NextResponse.json({ market: local });
  const live = await fetchPolymarketMarket(id);
  if (!live) return NextResponse.json({ market: null }, { status: 404 });
  return NextResponse.json({ market: live });
}
