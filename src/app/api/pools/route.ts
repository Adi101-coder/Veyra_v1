import { NextResponse } from "next/server";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { poolInventory } from "@/server/pools/book";
import { marginalPriceBps } from "@/server/pools/lmsr";
import { listPoolMarkets } from "@/server/voting/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open Veyra-native pools, newest first, with their current price and whether they
 * are funded. Unfunded pools are included deliberately: they were voted in and
 * should be visible, they just cannot be traded until the fund covers them.
 */
export async function GET() {
  try {
    const prisma = getPrisma();
    const markets = await listPoolMarkets(prisma);
    const liquidity = await prisma.poolLiquidity.findMany({
      where: { marketId: { in: markets.map((market) => market.id) } },
    });
    const byMarket = new Map(liquidity.map((row) => [row.marketId, row]));

    const pools = await Promise.all(
      markets
        .filter((market) => market.status !== "resolved")
        .map(async (market) => {
          const funding = byMarket.get(market.id);
          const funded = funding?.status === "ACTIVE";
          let yesPriceBps: number | null = null;
          if (funding && funded) {
            const inventory = await poolInventory(prisma, market.id);
            yesPriceBps = marginalPriceBps({ bMicros: funding.bMicros, ...inventory }, "YES");
          }
          return {
            id: market.id,
            title: market.title,
            category: market.category,
            tag: market.tag,
            funded,
            yesPriceBps,
            feeBps: funding?.feeBps ?? null,
          };
        }),
    );
    return NextResponse.json({ pools });
  } catch (error) {
    return jsonError(error);
  }
}
