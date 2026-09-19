import { NextResponse } from "next/server";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { poolInventory } from "@/server/pools/book";
import { poolLiquidity } from "@/server/pools/fund";
import { marginalPriceBps } from "@/server/pools/lmsr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How a pool is funded and priced. Public so the UI can explain, on the pool
 * itself, that Veyra is the counterparty and where that money came from.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const liquidity = await poolLiquidity(prisma, id);
    if (!liquidity) {
      return NextResponse.json({ marketId: id, funded: false, reason: "AWAITING_LIQUIDITY" });
    }
    const inventory = await poolInventory(prisma, id);
    const state = { bMicros: liquidity.bMicros, ...inventory };
    return NextResponse.json({
      marketId: id,
      funded: liquidity.status === "ACTIVE",
      status: liquidity.status,
      feeBps: liquidity.feeBps,
      maxLossMicros: liquidity.allocatedMicros.toString(),
      yesPriceBps: marginalPriceBps(state, "YES"),
      noPriceBps: marginalPriceBps(state, "NO"),
      sharesYesMicros: inventory.qYesMicros.toString(),
      sharesNoMicros: inventory.qNoMicros.toString(),
      openedAt: liquidity.openedAt.toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
